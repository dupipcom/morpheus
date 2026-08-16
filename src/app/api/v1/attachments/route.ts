import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { assertCan } from '@/lib/services/ownership'
import type { EntityKind } from '@/lib/services/ownership'
import { sanitizeText } from '@/lib/utils/sanitize'
import {
  VALID_KINDS,
  VALID_ROLES,
  capFor,
  deleteObject,
  extensionAllowedFor,
  extensionOf,
  getFirstBytes,
  headObject,
  kindFamilyMatches,
  publicUrlFor,
  type AttachmentKind,
  type AttachmentRole
} from '@/lib/storage/s3'
import type { Prisma } from '@/generated/prisma/client'

const ENTITY_TYPES = ['task', 'list', 'job', 'note', 'user'] as const

/** First bytes fetched for magic-byte inspection (plan §4.1: 4 KB). */
const MAGIC_BYTE_SAMPLE = 4096
const MAX_LIST_TAKE = 50
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/

function isValidObjectId(id: string): boolean {
  return OBJECT_ID_PATTERN.test(id)
}

/**
 * file-type v22 is ESM-only ("type": "module"); dynamic import keeps this
 * route compatible with the Node 20 runtime the app targets
 * (require(esm) needs Node >= 22.12).
 */
async function detectFileType(
  key: string
): Promise<{ ext: string; mime: string } | null> {
  const bytes = await getFirstBytes(key, MAGIC_BYTE_SAMPLE)
  if (bytes.length === 0) return null
  const { fileTypeFromBuffer } = await import('file-type')
  const result = await fileTypeFromBuffer(bytes)
  return result ? { ext: result.ext, mime: result.mime } : null
}

function parseNonNegativeNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || num < 0) {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must be a non-negative number`)
  }
  return num
}

function parseLocation(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'INVALID_LOCATION', 'location must be an object')
  }
  const location = value as Record<string, unknown>
  if (typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    throw new ApiError(400, 'INVALID_LOCATION', 'location requires numeric lat and lng')
  }
  return location
}

async function entityExists(entityType: string, entityId: string): Promise<boolean> {
  switch (entityType) {
    case 'task':
      return Boolean(await prisma.task.findUnique({ where: { id: entityId }, select: { id: true } }))
    case 'list':
      return Boolean(await prisma.list.findUnique({ where: { id: entityId }, select: { id: true } }))
    case 'job':
      return Boolean(await prisma.job.findUnique({ where: { id: entityId }, select: { id: true } }))
    case 'note':
      return Boolean(await prisma.note.findUnique({ where: { id: entityId }, select: { id: true } }))
    default:
      return false
  }
}

/**
 * POST /api/v1/attachments
 * Confirms an uploaded object: the key must live under the caller's own
 * prefix, the HEAD size must be within the per-kind cap, and the object's
 * real bytes (first 4 KB, magic-byte sniffed) must match the declared kind.
 * Only then is the Document row created and linked to the target entity.
 * `role` (cover/flier/evidence/inline/cv) is validated but not persisted —
 * the Document model has no role column; kind='cv' marks CVs.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      throw new ApiError(400, 'INVALID_REQUEST', 'Invalid request body')
    }

    const { key, fileName, kind, width, height, duration, location, entityType, entityId, role } =
      body

    // --- basic shape validation ---
    if (typeof key !== 'string' || !key.trim()) {
      throw new ApiError(400, 'INVALID_KEY', 'key is required')
    }
    if (typeof fileName !== 'string' || !fileName.trim()) {
      throw new ApiError(400, 'INVALID_FILE_NAME', 'fileName is required')
    }
    if (!VALID_KINDS.includes(kind as AttachmentKind)) {
      throw new ApiError(400, 'INVALID_KIND', 'kind must be one of: image, video, document, cv')
    }
    if (role !== undefined && !VALID_ROLES.includes(role as AttachmentRole)) {
      throw new ApiError(400, 'INVALID_ROLE', 'role must be one of: cover, flier, evidence, inline, cv')
    }
    if (
      typeof entityType !== 'string' ||
      !ENTITY_TYPES.includes(entityType as (typeof ENTITY_TYPES)[number])
    ) {
      throw new ApiError(400, 'INVALID_ENTITY_TYPE', 'entityType must be one of: task, list, job, note, user')
    }
    if (typeof entityId !== 'string' || !entityId.trim()) {
      throw new ApiError(400, 'INVALID_ENTITY_ID', 'entityId is required')
    }

    // --- SECURITY: the key must live under the caller's own prefix ---
    const keyPrefix = `u/${user.id}/`
    if (!key.startsWith(keyPrefix)) {
      throw new ApiError(403, 'FORBIDDEN', 'Forbidden')
    }

    const attachmentKind = kind as AttachmentKind
    const ext = extensionOf(key)
    if (!ext || !extensionAllowedFor(attachmentKind, ext)) {
      throw new ApiError(
        400,
        'INVALID_EXTENSION',
        `Extension .${ext || '?'} is not allowed for kind ${attachmentKind}`
      )
    }

    // --- server-side re-validation: HEAD size within cap, then magic bytes ---
    const head = await headObject(key)
    if (!head) {
      throw new ApiError(404, 'OBJECT_NOT_FOUND', 'Object not found in storage')
    }
    const declaredRole = typeof role === 'string' ? role : undefined
    const cap = capFor(attachmentKind, declaredRole)
    if (head.contentLength > cap) {
      await deleteObject(key)
      throw new ApiError(
        400,
        'CAP_EXCEEDED',
        `File exceeds the ${Math.round(cap / (1024 * 1024))} MB cap for kind ${attachmentKind}`
      )
    }

    const detected = await detectFileType(key)
    if (
      !detected ||
      !kindFamilyMatches(attachmentKind, detected.mime) ||
      !extensionAllowedFor(attachmentKind, detected.ext)
    ) {
      // Disguised payload (e.g. HTML renamed to .jpg): remove it, reject it.
      await deleteObject(key)
      throw new ApiError(400, 'TYPE_MISMATCH', 'File content does not match its type')
    }

    // --- ownership: edit capability for task/list/job/note; self-only for 'user' ---
    if (entityType === 'user') {
      if (entityId !== user.id) {
        throw new ApiError(403, 'FORBIDDEN', 'Forbidden')
      }
    } else {
      if (!isValidObjectId(entityId) || !(await entityExists(entityType, entityId))) {
        throw new ApiError(404, 'ENTITY_NOT_FOUND', `${entityType} not found`)
      }
      await assertCan(user.id, 'edit', entityType as EntityKind, entityId)
    }

    // --- optional metadata ---
    const widthValue = parseNonNegativeNumber(width, 'width')
    const heightValue = parseNonNegativeNumber(height, 'height')
    const durationValue = parseNonNegativeNumber(duration, 'duration')
    const locationValue = parseLocation(location)

    // --- create the Document row (declared fileSize/mimeType in the body are
    // ignored — HEAD size and sniffed mime are the server-side truth) ---
    const document = await prisma.document.create({
      data: {
        fileUrl: publicUrlFor(key),
        fileName: sanitizeText(fileName),
        fileSize: head.contentLength,
        fileFormat: ext,
        mimeType: detected.mime,
        kind: attachmentKind,
        width: widthValue,
        height: heightValue,
        fileDuration: durationValue,
        location: locationValue as Prisma.InputJsonValue | undefined,
        userId: user.id,
        // Keep both sides of the Task/Job <-> Document reference arrays in sync.
        ...(entityType === 'task' ? { taskIds: [entityId] } : {}),
        ...(entityType === 'job' ? { jobIds: [entityId] } : {})
      }
    })

    // --- link the owning entity's side of the reference ---
    if (entityType === 'task') {
      await prisma.task.update({
        where: { id: entityId },
        data: { documentIds: { push: document.id } }
      })
    } else if (entityType === 'job') {
      await prisma.job.update({
        where: { id: entityId },
        data: { documentIds: { push: document.id } }
      })
    } else if (entityType === 'list') {
      await prisma.list.update({
        where: { id: entityId },
        data: { documentIds: { push: document.id } }
      })
    } else if (entityType === 'note') {
      await prisma.note.update({
        where: { id: entityId },
        data: { documentIds: { push: document.id } }
      })
    }
    // 'user' → no linking: kind='cv' rows are owned via Document.userId and
    // listed with GET /api/v1/attachments?kind=cv&mine=true.

    return NextResponse.json({ document })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/attachments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/v1/attachments
 * Only one mode exists for now: listing the caller's own documents
 * (`?mine=true`), optionally filtered by kind (`?kind=cv`), newest first,
 * take <= 50.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const mine = searchParams.get('mine')
    const kind = searchParams.get('kind')

    if (mine !== 'true') {
      throw new ApiError(400, 'INVALID_QUERY', 'kind and mine=true are required')
    }

    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1),
      MAX_LIST_TAKE
    )

    const documents = await prisma.document.findMany({
      where: {
        userId: user.id,
        ...(kind ? { kind } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    return NextResponse.json({ documents })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/attachments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
