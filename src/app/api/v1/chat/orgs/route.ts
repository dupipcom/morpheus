import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getCurrentChatUser, getClerkOrganizations } from '@/lib/chat/auth'
import { jsonError, slugifyChatName } from '@/lib/chat/api'
import { sanitizeText } from '@/lib/utils/sanitize'

type ClerkOrgSummary = { id: string; name?: string; slug?: string; imageUrl?: string | null }

export async function GET() {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const memberships = await prisma.chatOrgMembership.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    })
    const orgs = await getClerkOrganizations(memberships.map((membership) => membership.clerkOrgId)).catch(() => [])
    const orgMap = new Map((orgs as ClerkOrgSummary[]).map((org) => [org.id, org]))

    return NextResponse.json({
      orgs: memberships.map((membership) => ({
        id: membership.clerkOrgId,
        role: membership.role,
        name: orgMap.get(membership.clerkOrgId)?.name ?? 'Organization',
        slug: orgMap.get(membership.clerkOrgId)?.slug ?? membership.clerkOrgId,
        imageUrl: orgMap.get(membership.clerkOrgId)?.imageUrl ?? null,
      })),
    })
  } catch (error) {
    console.error('Error listing chat orgs:', error)
    return jsonError('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const body = await request.json()
    const name = sanitizeText(body?.name || '')
    if (!name) return jsonError('Organization name is required')

    const slug = slugifyChatName(body?.slug || name)
    const client = await clerkClient()
    const organization = await client.organizations.createOrganization({
      name,
      slug,
      createdBy: user.clerkUserId,
    })

    await prisma.chatOrgMembership.upsert({
      where: {
        clerkOrgId_userId: {
          clerkOrgId: organization.id,
          userId: user.id,
        },
      },
      update: { role: 'SUPERUSER' },
      create: {
        clerkOrgId: organization.id,
        userId: user.id,
        role: 'SUPERUSER',
      },
    })

    await prisma.chatChannel.upsert({
      where: {
        clerkOrgId_slug: {
          clerkOrgId: organization.id,
          slug: 'general',
        },
      },
      update: {},
      create: {
        clerkOrgId: organization.id,
        name: 'general',
        slug: 'general',
        description: 'Default chat channel',
        createdByUserId: user.id,
        position: 0,
      },
    })

    return NextResponse.json({
      org: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        imageUrl: organization.imageUrl ?? null,
        role: 'SUPERUSER',
      },
    })
  } catch (error) {
    console.error('Error creating chat org:', error)
    return jsonError('Internal server error', 500)
  }
}
