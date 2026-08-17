/**
 * Event↔list links (Phase 8): POST { listId } links, DELETE ?id= unlinks.
 * Owner/manager of the event only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getViewerRole } from '@/lib/services/ownership'
import { setListLink } from '@/lib/services/events'

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
    const listId = typeof body?.listId === 'string' ? body.listId : null
    if (!listId) {
      return NextResponse.json({ error: 'listId is required' }, { status: 400 })
    }

    await setListLink(eventId, listId, true)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/events/[eventId]/lists:', error)
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
    const listId = searchParams.get('listId')
    if (!listId) {
      return NextResponse.json({ error: 'listId query param is required' }, { status: 400 })
    }

    await setListLink(eventId, listId, false)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in DELETE /api/v1/events/[eventId]/lists:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
