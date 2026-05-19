import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ensureOrgMembership, getCurrentChatUser } from '@/lib/chat/auth'
import { canManageInvites } from '@/lib/chat/permissions'
import { jsonError } from '@/lib/chat/api'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { inviteId } = await params
    const invite = await prisma.chatInviteLink.findUnique({ where: { id: inviteId } })
    if (!invite) return jsonError('Invite not found', 404)

    const membership = await ensureOrgMembership(invite.clerkOrgId, user.id)
    if (!canManageInvites(membership.role)) return jsonError('Forbidden', 403)

    await prisma.chatInviteLink.update({
      where: { id: inviteId },
      data: { status: 'REVOKED' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error revoking invite:', error)
    return jsonError(error instanceof Error && error.message === 'Forbidden' ? 'Forbidden' : 'Internal server error', error instanceof Error && error.message === 'Forbidden' ? 403 : 500)
  }
}
