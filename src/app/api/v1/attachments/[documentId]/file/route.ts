import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { isStorageConfigured, getObjectStream, PUBLIC_BASE_URL } from '@/lib/storage/s3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

/**
 * GET /api/v1/attachments/[documentId]/file
 *
 * Authenticated pipe from the private storage bucket (iDrive e2) into the app.
 * The bucket requires credentials, so `<img>`/`<video>`/`<a>` src attributes
 * point at this route instead of the bucket URL; the app authenticates via the
 * Clerk session cookie and streams the object bytes with the sniffed
 * Content-Type. Range headers are forwarded so video seeking works.
 *
 * Authorization:
 * - Documents with visibility PUBLIC stream to anyone (including anonymous).
 * - Otherwise the viewer must be the owner, or be linked to the document via a
 *   job (worker or list member), task (list member), list (member), or note
 *   (author or public note).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    if (!isStorageConfigured()) {
      throw new ApiError(503, 'STORAGE_NOT_CONFIGURED', 'Storage not configured')
    }

    const { documentId } = await params
    if (!OBJECT_ID_PATTERN.test(documentId)) {
      throw new ApiError(404, 'NOT_FOUND', 'Attachment not found')
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        userId: true,
        visibility: true,
        kind: true,
        mimeType: true,
        fileName: true,
        fileUrl: true,
        posterUrl: true
      }
    })
    if (!document) {
      throw new ApiError(404, 'NOT_FOUND', 'Attachment not found')
    }

    // Resolve the viewer's internal user id (may stay null for anonymous)
    const { userId: clerkUserId } = await auth()
    let viewerId: string | null = null
    if (clerkUserId) {
      const user = await prisma.user.findUnique({
        where: { userId: clerkUserId },
        select: { id: true }
      })
      viewerId = user?.id ?? null
    }

    if (document.visibility !== 'PUBLIC') {
      if (!viewerId) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized')
      }
      if (document.userId !== viewerId && !(await isViewerLinkedToDocument(document.id, viewerId))) {
        throw new ApiError(403, 'FORBIDDEN', 'Forbidden')
      }
    }

    // The key is derived from fileUrl (bucket URL = PUBLIC_BASE_URL + '/' + key).
    // `?poster=1` streams the video cover frame (Document.posterUrl) instead.
    const { searchParams } = new URL(request.url)
    const wantsPoster = searchParams.get('poster') === '1'

    let key: string
    if (wantsPoster) {
      if (!document.posterUrl) {
        throw new ApiError(404, 'NOT_FOUND', 'Poster not found')
      }
      key = document.posterUrl.replace(`${PUBLIC_BASE_URL}/`, '')
    } else {
      key = document.fileUrl.replace(`${PUBLIC_BASE_URL}/`, '')
    }

    const range = request.headers.get('range')

    const object = await getObjectStream(key, range)
    if (!object) {
      throw new ApiError(404, 'NOT_FOUND', 'Object not found in storage')
    }

    const isInlinePreviewable =
      wantsPoster ||
      document.kind === 'image' ||
      document.kind === 'video' ||
      document.mimeType === 'application/pdf'

    const headers = new Headers({
      'Content-Type': wantsPoster ? 'image/jpeg' : object.contentType,
      'Content-Length': String(object.contentLength),
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': document.visibility === 'PUBLIC'
        ? 'public, max-age=14400'
        : 'private, max-age=14400'
    })
    if (object.contentRange) {
      headers.set('Content-Range', object.contentRange)
    }
    if (!isInlinePreviewable) {
      headers.set('Content-Disposition', `attachment; filename="${sanitizeFileName(document.fileName)}"`)
    }

    return new Response(object.stream, {
      status: object.contentRange ? 206 : 200,
      headers
    })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error streaming attachment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * True when the viewer participates in any entity that links this document.
 * Queries the forward documentIds arrays (works for rows created before the
 * back-references were populated on Document).
 */
async function isViewerLinkedToDocument(documentId: string, viewerId: string): Promise<boolean> {
  const [job, task, list, note] = await Promise.all([
    prisma.job.findFirst({
      where: {
        documentIds: { has: documentId },
        OR: [
          { workerId: viewerId },
          { list: { users: { some: { userId: viewerId } } } }
        ]
      },
      select: { id: true }
    }),
    prisma.task.findFirst({
      where: {
        documentIds: { has: documentId },
        list: { users: { some: { userId: viewerId } } }
      },
      select: { id: true }
    }),
    prisma.list.findFirst({
      where: {
        documentIds: { has: documentId },
        users: { some: { userId: viewerId } }
      },
      select: { id: true }
    }),
    prisma.note.findFirst({
      where: {
        documentIds: { has: documentId },
        OR: [{ userId: viewerId }, { visibility: 'PUBLIC' }]
      },
      select: { id: true }
    })
  ])

  return Boolean(job || task || list || note)
}

/** Strip characters that would break a Content-Disposition header value. */
function sanitizeFileName(fileName: string | null): string {
  return (fileName || 'attachment').replace(/[^\w.\- ]/g, '_').slice(0, 120)
}
