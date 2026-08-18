/**
 * Event staff API Route Handler (Phase 8)
 *
 * GET: Staff members. POST: { userId, role } adds/updates (SCANNER | MANAGER).
 * DELETE ?userId= removes. Owner/manager of the event only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getViewerRole } from '@/lib/services/ownership'
import { setStaff } from '@/lib/services/events'

async function authEventManager(eventId: string): Promise<NextResponse | null> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { userId }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const role = await getViewerRole(user.id, 'event', eventId)
  if (role !== 'OWNER' && role !== 'MANAGER') {
    return NextResponse.json({ error: 'Only owners and managers can manage staff' }, { status: 403 })
  }
  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  try {
    const { eventId } = await params
    const denied = await authEventManager(eventId)
    if (denied) return denied

    const staff = await prisma.eventStaff.findMany({
      where: { eventId },
      include: { user: { select: { id: true, profiles: { select: { data: true } } } } }
    })

    return NextResponse.json({ staff })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/events/[eventId]/staff:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
    const { userId: staffUserId, role } = (body || {}) as Record<string, unknown>
    if (typeof staffUserId !== 'string' || typeof role !== 'string') {
      return NextResponse.json({ error: 'userId and role are required' }, { status: 400 })
    }

    await setStaff(eventId, staffUserId, role, true)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/events/[eventId]/staff:', error)
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
    const staffUserId = searchParams.get('userId')
    if (!staffUserId) {
      return NextResponse.json({ error: 'userId query param is required' }, { status: 400 })
    }

    await setStaff(eventId, staffUserId, 'SCANNER', false)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in DELETE /api/v1/events/[eventId]/staff:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
