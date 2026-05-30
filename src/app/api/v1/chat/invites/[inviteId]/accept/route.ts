import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getCurrentChatUser } from '@/lib/chat/auth'
import { jsonError, publishUserInvalidation } from '@/lib/chat/api'
import { isChatInviteActive, isMongoObjectId } from '@/lib/chat/invites'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { inviteId } = await params
    const invite = await prisma.chatInviteLink.findFirst({
      where: {
        ...(isMongoObjectId(inviteId)
          ? {
              OR: [
                { id: inviteId },
                { token: inviteId },
              ],
            }
          : { token: inviteId }),
      },
    })

    if (!invite) return jsonError('Invite not found', 404)
    if (invite.inviteeUserId && invite.inviteeUserId !== user.id) {
      return jsonError('Forbidden', 403)
    }
    if (!isChatInviteActive(invite)) {
      return jsonError('Invite is no longer active', 400)
    }

    await prisma.chatOrgMembership.upsert({
      where: {
        clerkOrgId_userId: {
          clerkOrgId: invite.clerkOrgId,
          userId: user.id,
        },
      },
      update: { role: 'USER' },
      create: {
        clerkOrgId: invite.clerkOrgId,
        userId: user.id,
        role: 'USER',
      },
    })

    if (user.clerkUserId) {
      const client = await clerkClient()
      try {
        await client.organizations.createOrganizationMembership({
          organizationId: invite.clerkOrgId,
          userId: user.clerkUserId,
          role: 'org:member',
        })
      } catch {
        // Ignore already-a-member or Clerk-side membership sync issues.
      }
    }

    const nextUsedCount = invite.usedCount + 1
    await Promise.all([
      prisma.chatInviteLink.update({
        where: { id: invite.id },
        data: {
          usedCount: nextUsedCount,
          acceptedByUserId: user.id,
          status: invite.maxUses && nextUsedCount >= invite.maxUses ? 'EXPIRED' : invite.status,
        },
      }),
      publishUserInvalidation([user.id], { inviteId: invite.id, orgId: invite.clerkOrgId }),
    ])

    return NextResponse.json({ success: true, orgId: invite.clerkOrgId })
  } catch (error) {
    console.error('Error accepting invite:', error)
    return jsonError('Internal server error', 500)
  }
}
