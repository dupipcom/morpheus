/**
 * Handle resolution API Route Handler (Phase 5/7)
 *
 * GET: Resolve a handle in the shared /@ namespace for the edge middleware
 * (which cannot run Prisma). Returns the entity kind only — never data.
 * Query: ?handle=
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/resolve-handle?handle=
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const handle = searchParams.get('handle')
    if (!handle || !/^[a-z0-9-]{1,64}$/i.test(handle)) {
      return NextResponse.json({ error: 'Invalid handle' }, { status: 400 })
    }

    const [profile, organization, project] = await Promise.all([
      prisma.profile.findUnique({ where: { username: handle }, select: { id: true } }),
      prisma.organization.findUnique({ where: { username: handle }, select: { id: true } }),
      prisma.project.findUnique({ where: { username: handle }, select: { id: true } })
    ])

    if (organization) return NextResponse.json({ kind: 'org' })
    if (project) return NextResponse.json({ kind: 'project' })
    if (profile) return NextResponse.json({ kind: 'profile' })

    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch (error) {
    console.error('Error in GET /api/v1/resolve-handle:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
