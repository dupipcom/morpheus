/**
 * Event↔list links (Phase 8): POST { projectId } links, DELETE ?id= unlinks.
 * Owner/manager of the event only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getViewerRole } from '@/lib/services/ownership'
import { setProjectLink } from '@/lib/services/events'

async function authEventManager(eventId: string): Promise<NextResponse | null> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { userId }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const role = await getViewerRole(user.id, 'event', eventId)
  if (role !== 'OWNER' && role !== 'MANAGER') {
    return NextResponse.json({ error: 'Only owners and managers can manage links' }, { status: 403 })
  }
  return null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  try {
    const { eventId } = await params
    const denied = await authEventManager(eventId)
    if (denied) return denied

    const body = await request.json().catch(() => null)
    const projectId = typeof body?.projectId === 'string' ? body.projectId : null
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    await setProjectLink(eventId, projectId, true)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/events/[eventId]/projects:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  try {
    const { eventId } = await params
    const denied = await authEventManager(eventId)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ error: 'projectId query param is required' }, { status: 400 })
    }

    await setProjectLink(eventId, projectId, false)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in DELETE /api/v1/events/[eventId]/projects:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
