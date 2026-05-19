import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getCurrentChatUser } from '@/lib/chat/auth'
import { jsonError } from '@/lib/chat/api'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { token } = await params
    const invite = await prisma.chatInviteLink.findUnique({ where: { token } })
    if (!invite) return jsonError('Invite not found', 404)

    const isExpired = invite.expiresAt ? invite.expiresAt.getTime() < Date.now() : false
    const maxUsesReached = invite.maxUses !== null && invite.maxUses !== undefined && invite.usedCount >= invite.maxUses
    if (invite.status !== 'ACTIVE' || isExpired || maxUsesReached) {
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
    await prisma.chatInviteLink.update({
      where: { id: invite.id },
      data: {
        usedCount: nextUsedCount,
        status: invite.maxUses && nextUsedCount >= invite.maxUses ? 'EXPIRED' : invite.status,
      },
    })

    return NextResponse.json({ success: true, orgId: invite.clerkOrgId })
  } catch (error) {
    console.error('Error accepting invite:', error)
    return jsonError('Internal server error', 500)
  }
}
