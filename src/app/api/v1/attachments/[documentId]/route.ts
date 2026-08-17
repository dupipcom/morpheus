import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { PUBLIC_BASE_URL, deleteObject } from '@/lib/storage/s3'
import { isValidObjectId, parseLocation } from '@/lib/utils/attachments'
import type { Prisma } from '@/generated/prisma/client'

/** Recover the object key embedded in a fileUrl; null when it cannot be derived. */
function keyFromFileUrl(fileUrl: string): string | null {
  if (!PUBLIC_BASE_URL || !fileUrl.startsWith(PUBLIC_BASE_URL)) return null
  return fileUrl.slice(PUBLIC_BASE_URL.length).replace(/^\//, '')
}

/**
 * PATCH /api/v1/attachments/[documentId]
 * Owner-only. Updates the document's location (or clears it with null).
 * This is how photo locations stay shareable AFTER the upload completed.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
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

    const { documentId } = await params
    if (!isValidObjectId(documentId)) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Attachment not found')
    }

    const document = await prisma.document.findUnique({ where: { id: documentId } })
    if (!document) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Attachment not found')
    }
    if (document.userId !== user.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Forbidden')
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || !('location' in body)) {
      throw new ApiError(400, 'INVALID_REQUEST', 'location is required (object or null)')
    }

    // Canonical { lat, lng, placeId?, name?, address? } shape, or null to clear
    const parsed = body.location === null ? null : parseLocation(body.location)

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: { location: parsed as Prisma.InputJsonValue | null }
    })

    return NextResponse.json({ document: updated })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error updating attachment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/v1/attachments/[documentId]
 * Owner-only. Deletes the storage object, pulls the id from every
 * Task/Job/List/Note documentIds array, then deletes the Document row.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
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

    const { documentId } = await params
    if (!isValidObjectId(documentId)) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Attachment not found')
    }

    const document = await prisma.document.findUnique({ where: { id: documentId } })
    if (!document) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Attachment not found')
    }
    if (document.userId !== user.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Forbidden')
    }

    // Best-effort object deletion — the row is the source of truth. A storage
    // outage or unconfigured storage must not block removing the record.
    const key = keyFromFileUrl(document.fileUrl)
    if (key) {
      try {
        await deleteObject(key)
      } catch (error) {
        console.error('Failed to delete storage object (orphan possible):', {
          key,
          documentId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Task/Job/List/Note hold documentIds as plain scalar arrays without an
    // onDelete cascade, and the generated client exposes only set/push on
    // those arrays, so pull the id out by read-modify-write before deleting
    // the row.
    const [taskRows, jobRows, listRows, noteRows] = await Promise.all([
      prisma.task.findMany({ where: { documentIds: { has: documentId } }, select: { id: true, documentIds: true } }),
      prisma.job.findMany({ where: { documentIds: { has: documentId } }, select: { id: true, documentIds: true } }),
      prisma.list.findMany({ where: { documentIds: { has: documentId } }, select: { id: true, documentIds: true } }),
      prisma.note.findMany({ where: { documentIds: { has: documentId } }, select: { id: true, documentIds: true } })
    ])

    const withoutDocumentId = (ids: string[]) => ids.filter((id) => id !== documentId)

    const operations: Prisma.PrismaPromise<unknown>[] = [
      ...taskRows.map((row) =>
        prisma.task.update({
          where: { id: row.id },
          data: { documentIds: { set: withoutDocumentId(row.documentIds) } }
        })
      ),
      ...jobRows.map((row) =>
        prisma.job.update({
          where: { id: row.id },
          data: { documentIds: { set: withoutDocumentId(row.documentIds) } }
        })
      ),
      ...listRows.map((row) =>
        prisma.list.update({
          where: { id: row.id },
          data: { documentIds: { set: withoutDocumentId(row.documentIds) } }
        })
      ),
      ...noteRows.map((row) =>
        prisma.note.update({
          where: { id: row.id },
          data: { documentIds: { set: withoutDocumentId(row.documentIds) } }
        })
      ),
      prisma.document.delete({ where: { id: documentId } })
    ]
    await prisma.$transaction(operations)

    return NextResponse.json({ message: 'Attachment deleted' })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in DELETE /api/v1/attachments/[documentId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
