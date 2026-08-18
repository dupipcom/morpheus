/**
 * Project detail API Route Handler
 *
 * GET: Project detail (members only).
 * PUT: Update public-profile fields (OWNER/MANAGER).
 * Body: { name?, bio?, photoDocumentId?, coverDocumentId?, links?, supportUrl?, spotlight?, publicVisible?, collaborators? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText, sanitizeHTML, sanitizeURL } from '@/lib/utils/sanitize'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getViewerRole } from '@/lib/services/ownership'
import { updateProject } from '@/lib/services/projects'

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

/**
 * GET /api/v1/projects/[projectId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId } = await params

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const role = await getViewerRole(user.id, 'project', projectId)
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { lists: { select: { id: true, name: true, publicUrl: true, publicVisible: true } } }
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ project, viewerRole: role })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in GET /api/v1/projects/[projectId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/v1/projects/[projectId]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId } = await params

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      name, bio, photoDocumentId, coverDocumentId, links, supportUrl, spotlight, publicVisible, collaborators
    } = body as Record<string, unknown>

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json({ error: 'Name must be a non-empty string' }, { status: 400 })
    }
    if (bio !== undefined && typeof bio !== 'string') {
      return NextResponse.json({ error: 'Bio must be a string' }, { status: 400 })
    }
    if (
      photoDocumentId !== undefined &&
      (typeof photoDocumentId !== 'string' || !OBJECT_ID_PATTERN.test(photoDocumentId))
    ) {
      return NextResponse.json({ error: 'Invalid photoDocumentId' }, { status: 400 })
    }
    if (
      coverDocumentId !== undefined &&
      (typeof coverDocumentId !== 'string' || !OBJECT_ID_PATTERN.test(coverDocumentId))
    ) {
      return NextResponse.json({ error: 'Invalid coverDocumentId' }, { status: 400 })
    }
    if (spotlight !== undefined && typeof spotlight !== 'boolean') {
      return NextResponse.json({ error: 'spotlight must be a boolean' }, { status: 400 })
    }
    if (publicVisible !== undefined && typeof publicVisible !== 'boolean') {
      return NextResponse.json({ error: 'publicVisible must be a boolean' }, { status: 400 })
    }
    if (
      collaborators !== undefined &&
      (!Array.isArray(collaborators) ||
        !collaborators.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v)))
    ) {
      return NextResponse.json({ error: 'Collaborators must be an array of user IDs' }, { status: 400 })
    }

    let parsedLinks: Array<{ label: string; url: string }> | undefined
    if (links !== undefined && links !== null) {
      if (
        !Array.isArray(links) ||
        !links.every(
          (l) =>
            typeof l === 'object' &&
            l !== null &&
            typeof (l as Record<string, unknown>).label === 'string' &&
            typeof (l as Record<string, unknown>).url === 'string'
        )
      ) {
        return NextResponse.json({ error: 'Links must be an array of { label, url }' }, { status: 400 })
      }
      parsedLinks = (links as Array<{ label: string; url: string }>).map((l) => ({
        label: sanitizeText(l.label),
        url: sanitizeURL(l.url)
      }))
    }

    const project = await updateProject({
      viewerUserId: user.id,
      input: {
        projectId,
        name: typeof name === 'string' ? sanitizeText(name.trim()) : undefined,
        bio: typeof bio === 'string' ? sanitizeHTML(bio) : undefined,
        photoDocumentId: typeof photoDocumentId === 'string' ? photoDocumentId : undefined,
        coverDocumentId: typeof coverDocumentId === 'string' ? coverDocumentId : undefined,
        links: parsedLinks,
        supportUrl: typeof supportUrl === 'string' ? sanitizeURL(supportUrl) : undefined,
        spotlight: typeof spotlight === 'boolean' ? spotlight : undefined,
        publicVisible: typeof publicVisible === 'boolean' ? publicVisible : undefined,
        collaborators: Array.isArray(collaborators) ? (collaborators as string[]) : undefined
      }
    })

    return NextResponse.json({ project })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in PUT /api/v1/projects/[projectId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
