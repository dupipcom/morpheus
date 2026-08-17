/**
 * Projects API Route Handler
 *
 * GET: Projects the viewer participates in (any role) — feeds the Do-area
 * project picker and the list form's project selector.
 * POST: Create a project (creator becomes OWNER, always unpublished).
 * Body: { name, bio?, photoDocumentId?, coverDocumentId?, links?, supportUrl?, collaborators? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText, sanitizeHTML, sanitizeURL } from '@/lib/utils/sanitize'
import { ApiError, toResponse } from '@/lib/services/errors'
import { createProject, listProjectsForUser } from '@/lib/services/projects'

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

/**
 * GET /api/v1/projects
 */
export async function GET(): Promise<NextResponse> {
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

    const projects = await listProjectsForUser(user.id)

    return NextResponse.json({ projects })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in GET /api/v1/projects:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/projects
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      name, bio, photoDocumentId, coverDocumentId, links, supportUrl, collaborators
    } = body as Record<string, unknown>

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
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

    if (
      collaborators !== undefined &&
      (!Array.isArray(collaborators) ||
        !collaborators.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v)))
    ) {
      return NextResponse.json({ error: 'Collaborators must be an array of user IDs' }, { status: 400 })
    }

    const project = await createProject({
      userInternalId: user.id,
      name: sanitizeText(name.trim()),
      bio: typeof bio === 'string' ? sanitizeHTML(bio) : null,
      photoDocumentId: typeof photoDocumentId === 'string' ? photoDocumentId : null,
      coverDocumentId: typeof coverDocumentId === 'string' ? coverDocumentId : null,
      links: parsedLinks ?? null,
      supportUrl: typeof supportUrl === 'string' ? sanitizeURL(supportUrl) : null,
      collaborators: Array.isArray(collaborators) ? (collaborators as string[]) : undefined
    })

    return NextResponse.json({ project })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in POST /api/v1/projects:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
