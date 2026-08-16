import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import {
  MIME_BY_EXTENSION,
  SVG_MIME_TYPE,
  VALID_KINDS,
  VALID_ROLES,
  capFor,
  extensionAllowedFor,
  extensionOf,
  isStorageConfigured,
  objectKeyForUpload,
  presignPut,
  publicUrlFor,
  type AttachmentKind,
  type AttachmentRole
} from '@/lib/storage/s3'

/**
 * POST /api/v1/attachments/presign
 * Validates the declared fileName/mimeType/size against the per-kind allowlist
 * and cap, then returns a presigned PUT URL. The browser uploads straight to
 * storage; the server re-validates the real bytes at POST /attachments.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isStorageConfigured()) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })
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

    const { fileName, mimeType, kind, size, role } = body

    if (typeof fileName !== 'string' || !fileName.trim()) {
      throw new ApiError(400, 'INVALID_FILE_NAME', 'fileName is required')
    }
    if (typeof mimeType !== 'string' || !mimeType.trim()) {
      throw new ApiError(400, 'INVALID_MIMETYPE', 'mimeType is required')
    }
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
      throw new ApiError(400, 'INVALID_SIZE', 'size must be a positive number of bytes')
    }
    if (!VALID_KINDS.includes(kind as AttachmentKind)) {
      throw new ApiError(400, 'INVALID_KIND', 'kind must be one of: image, video, document, cv')
    }
    if (role !== undefined && !VALID_ROLES.includes(role as AttachmentRole)) {
      throw new ApiError(400, 'INVALID_ROLE', 'role must be one of: cover, flier, evidence, inline, cv')
    }
    if (mimeType === SVG_MIME_TYPE || extensionOf(fileName) === 'svg') {
      throw new ApiError(400, 'SVG_NOT_ALLOWED', 'SVG files are not allowed')
    }

    const attachmentKind = kind as AttachmentKind
    const ext = extensionOf(fileName)
    if (!ext || !extensionAllowedFor(attachmentKind, ext)) {
      throw new ApiError(
        400,
        'INVALID_EXTENSION',
        `Extension .${ext || '?'} is not allowed for kind ${attachmentKind}`
      )
    }
    if (MIME_BY_EXTENSION[ext] !== mimeType) {
      throw new ApiError(400, 'MIMETYPE_MISMATCH', 'mimeType does not match the file extension')
    }

    const declaredRole = typeof role === 'string' ? role : undefined
    const cap = capFor(attachmentKind, declaredRole)
    if (size > cap) {
      throw new ApiError(
        400,
        'CAP_EXCEEDED',
        `File exceeds the ${Math.round(cap / (1024 * 1024))} MB cap for kind ${attachmentKind}`
      )
    }

    const key = objectKeyForUpload(user.id, ext)
    const { uploadUrl, expiresIn } = await presignPut(key, mimeType, size)

    return NextResponse.json({ uploadUrl, key, publicUrl: publicUrlFor(key), expiresIn })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/attachments/presign:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
