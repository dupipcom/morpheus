import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { PUBLIC_BASE_URL, deleteObject } from '@/lib/storage/s3'

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/

/** Recover the object key embedded in a fileUrl; null when it cannot be derived. */
function keyFromFileUrl(fileUrl: string): string | null {
  if (!PUBLIC_BASE_URL || !fileUrl.startsWith(PUBLIC_BASE_URL)) return null
  return fileUrl.slice(PUBLIC_BASE_URL.length).replace(/^\//, '')
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
    if (!OBJECT_ID_PATTERN.test(documentId)) {
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
    // onDelete cascade, so pull the id out of each before deleting the row.
    await prisma.$transaction([
      prisma.task.updateMany({
        where: { documentIds: { has: documentId } },
        data: { documentIds: { pull: documentId } }
      }),
      prisma.job.updateMany({
        where: { documentIds: { has: documentId } },
        data: { documentIds: { pull: documentId } }
      }),
      prisma.list.updateMany({
        where: { documentIds: { has: documentId } },
        data: { documentIds: { pull: documentId } }
      }),
      prisma.note.updateMany({
        where: { documentIds: { has: documentId } },
        data: { documentIds: { pull: documentId } }
      }),
      prisma.document.delete({ where: { id: documentId } })
    ])

    return NextResponse.json({ message: 'Attachment deleted' })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in DELETE /api/v1/attachments/[documentId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
