/**
 * Organization Service (Phase 7)
 *
 * Clerk Organizations stay the identity/membership source of truth; Prisma
 * mirrors them (`Organization`/`OrgMembership`) so we can join and index
 * locally. Webhook events upsert idempotently; `syncOrganization()` is the
 * pull-based repair for webhook loss tolerance.
 *
 * Handles live in the shared `/@` namespace: `/{locale}/o/{username}` renders
 * from this row (no `Profile` — the Organization IS its public profile), and
 * usernames are globally unique across users, orgs and projects
 * (cross-checked at creation).
 */

import prisma from '@/lib/prisma'
import { ApiError } from '@/lib/services/errors'
import { slugify, ensureUniqueSlug } from '@/lib/public/slug'
import { getLikeState } from '@/lib/services/social'
import { getCurrentUser, batchEnrichUserProfiles } from '@/lib/services/visibility'

const ORG_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'STAFF'] as const

/**
 * Username handle for an org: slugify(name) + uniqueness retry across
 * Organization.username, Profile.username and Project.username (the shared
 * /@ namespace).
 */
export async function generateOrgUsername(name: string): Promise<string> {
  const base = slugify(name)
  return ensureUniqueSlug(base, async (candidate) => {
    const [org, profile, project] = await Promise.all([
      prisma.organization.findUnique({ where: { username: candidate }, select: { id: true } }),
      prisma.profile.findUnique({ where: { username: candidate }, select: { id: true } }),
      prisma.project.findUnique({ where: { username: candidate }, select: { id: true } })
    ])
    return Boolean(org || profile || project)
  })
}

/**
 * Idempotent upsert of the org mirror from a Clerk event payload. Keyed on
 * clerkOrgId; `publicVisible`/`verified` are never reset by webhook data.
 */
export async function upsertOrganization(data: {
  clerkOrgId: string
  name?: string | null
  slug?: string | null
  imageUrl?: string | null
}): Promise<{ id: string }> {
  const existing = await prisma.organization.findUnique({
    where: { clerkOrgId: data.clerkOrgId },
    select: { id: true }
  })

  if (existing) {
    await prisma.organization.update({
      where: { id: existing.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
        status: 'ACTIVE',
        deletedAt: null
      }
    })
    return existing
  }

  // New mirror: generate the username handle from the name (or Clerk slug)
  const username = await generateOrgUsername(data.name || data.slug || 'org')

  const created = await prisma.organization.create({
    data: {
      clerkOrgId: data.clerkOrgId,
      username,
      name: data.name || 'Organization',
      imageUrl: data.imageUrl ?? null,
      publicVisible: false,
      verified: false,
      status: 'ACTIVE',
      createdByUserId: '' // filled by the membership webhook (creator)
    }
  })
  return { id: created.id }
}

/**
 * Idempotent upsert of a membership from a Clerk event. The org's OWNER role
 * seeds `createdByUserId` (the creator/steward) when still empty.
 */
export async function upsertMembership(data: {
  clerkOrgId: string
  clerkUserId: string
  role: string
}): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { clerkOrgId: data.clerkOrgId },
    select: { id: true, createdByUserId: true }
  })
  if (!org) {
    // Webhook ordering: org.created may arrive after membership.created — mirror on demand
    await upsertOrganization({ clerkOrgId: data.clerkOrgId })
    return upsertMembership(data)
  }

  const user = await prisma.user.findUnique({
    where: { userId: data.clerkUserId },
    select: { id: true }
  })
  if (!user) return // unknown internal user (webhook ordering) — syncOrganization repairs later

  const role = ORG_ROLES.includes(data.role as (typeof ORG_ROLES)[number]) ? data.role : 'MEMBER'

  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    update: { role, clerkOrgId: data.clerkOrgId },
    create: { orgId: org.id, userId: user.id, role, clerkOrgId: data.clerkOrgId }
  })

  if (!org.createdByUserId && (role === 'OWNER' || role === 'ADMIN')) {
    await prisma.organization.update({
      where: { id: org.id },
      data: { createdByUserId: user.id }
    })
  }
}

/**
 * Pull-based repair: fetch the org + memberships from Clerk and mirror them.
 * Used when a request references an org we haven't mirrored yet. Gracefully
 * no-ops when Clerk is unreachable (the webhook path still heals later).
 */
export async function syncOrganization(clerkOrgId: string): Promise<void> {
  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const client = await clerkClient()
    const [clerkOrg, memberships] = await Promise.all([
      client.organizations.getOrganization({ organizationId: clerkOrgId }),
      client.organizations.getOrganizationMembershipList({
        organizationId: clerkOrgId,
        limit: 500
      })
    ])

    await upsertOrganization({
      clerkOrgId,
      name: clerkOrg.name,
      slug: clerkOrg.slug ?? null,
      imageUrl: clerkOrg.imageUrl ?? null
    })

    for (const membership of memberships.data) {
      if (!membership.publicUserData?.userId) continue
      await upsertMembership({
        clerkOrgId,
        clerkUserId: membership.publicUserData.userId,
        role: membership.role
      })
    }
  } catch (error) {
    console.error(`[org] syncOrganization failed for ${clerkOrgId}:`, error)
  }
}

/**
 * Mark an org as ORPHANED (deleted in Clerk). Lists/events/projects are
 * retained and readable by their steward; the public org page 404s.
 */
export async function markOrphaned(clerkOrgId: string): Promise<void> {
  await prisma.organization.updateMany({
    where: { clerkOrgId },
    data: { status: 'ORPHANED', deletedAt: new Date() }
  })
}

/**
 * Remove a membership (webhook organizationMembership.deleted).
 */
export async function removeMembership(clerkOrgId: string, clerkUserId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { clerkOrgId },
    select: { id: true }
  })
  if (!org) return
  const user = await prisma.user.findUnique({
    where: { userId: clerkUserId },
    select: { id: true }
  })
  if (!user) return
  await prisma.orgMembership.deleteMany({
    where: { orgId: org.id, userId: user.id }
  })
}

/**
 * Assert the viewer may create content owned by this org (MANAGER+).
 * Used by the tasklists and projects routes when `ownerType: 'ORG'`.
 */
export async function assertOrgManagerRole(userInternalId: string, orgId: string): Promise<void> {
  const membership = await prisma.orgMembership.findUnique({
    where: { orgId_userId: { orgId, userId: userInternalId } },
    select: { role: true }
  })
  if (!membership || !['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'Requires MANAGER or higher in the organization')
  }
}

/**
 * Org creation: Clerk org + mirror + OWNER membership + default `general`
 * chat channel + org wallet (kind ORG). `viewerUserId` is the Clerk userId.
 */
export async function createOrganization(params: {
  viewerUserId: string
  name: string
  slug?: string | null
}): Promise<{ id: string; clerkOrgId: string }> {
  const user = await prisma.user.findUnique({
    where: { userId: params.viewerUserId },
    select: { id: true }
  })
  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found')
  }

  const { clerkClient } = await import('@clerk/nextjs/server')
  const client = await clerkClient()
  const clerkOrg = await client.organizations.createOrganization({
    name: params.name,
    slug: params.slug || slugify(params.name),
    createdBy: params.viewerUserId
  })

  // Mirror + OWNER membership + org wallet (sequential — MongoDB standalone
  // has no multi-document transactions; each step is idempotent)
  const mirror = await upsertOrganization({
    clerkOrgId: clerkOrg.id,
    name: clerkOrg.name,
    slug: clerkOrg.slug ?? null,
    imageUrl: clerkOrg.imageUrl ?? null
  })
  await upsertMembership({
    clerkOrgId: clerkOrg.id,
    clerkUserId: params.viewerUserId,
    role: 'OWNER'
  })

  // Org wallet (kind ORG, ownerType ORG)
  const existingWallet = await prisma.wallet.findFirst({
    where: { kind: 'ORG', orgId: mirror.id }
  })
  if (!existingWallet) {
    await prisma.wallet.create({
      data: {
        userId: user.id, // steward
        name: `${params.name} wallet`,
        kind: 'ORG',
        ownerType: 'ORG',
        orgId: mirror.id,
        balance: 0,
        pendingBalance: 0,
        address: null
      }
    })
  }

  // Default `general` chat channel (mirrors the legacy chat/orgs flow)
  const existingChannel = await prisma.chatChannel.findFirst({
    where: { clerkOrgId: clerkOrg.id, slug: 'general' }
  })
  if (!existingChannel) {
    await prisma.chatChannel.create({
      data: {
        clerkOrgId: clerkOrg.id,
        name: 'general',
        slug: 'general',
        createdByUserId: user.id
      }
    })
  }

  return { id: mirror.id, clerkOrgId: clerkOrg.id }
}

/**
 * Orgs the viewer belongs to, with role.
 */
export async function listOrgsForUser(userInternalId: string) {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId: userInternalId },
    include: { org: true },
    orderBy: { createdAt: 'asc' }
  })
  return memberships.map((m) => ({ ...m.org, viewerRole: m.role }))
}

/**
 * Public org payload (allowlist projection). 404 unless publicVisible and
 * ACTIVE. Stats computed per request.
 */
export async function getPublicOrg(username: string, viewerUserId: string | null) {
  const org = await prisma.organization.findUnique({ where: { username } })
  if (!org || !org.publicVisible || org.status !== 'ACTIVE') {
    throw new ApiError(404, 'NOT_FOUND', 'Organization not found')
  }

  const currentUser = await getCurrentUser(viewerUserId)
  const viewerInternalId = currentUser?.id ?? null

  const [publishedLists, publishedProjects, likeState, profiles] = await Promise.all([
    prisma.list.findMany({
      where: { ownerType: 'ORG', orgId: org.id, publicVisible: true, visibility: 'PUBLIC' },
      select: { id: true, name: true, publicUrl: true, publicTagline: true, profilePhoto: true },
      orderBy: { updatedAt: 'desc' },
      take: 50
    }),
    prisma.project.findMany({
      where: { ownerType: 'ORG', orgId: org.id, publicVisible: true },
      select: { id: true, name: true, username: true, photoDocumentId: true },
      orderBy: { updatedAt: 'desc' },
      take: 50
    }),
    getLikeState(viewerUserId, 'org', org.id),
    batchEnrichUserProfiles([org.createdByUserId].filter(Boolean), currentUser)
  ])

  const memberCount = await prisma.orgMembership.count({ where: { orgId: org.id } })

  return {
    id: org.id,
    username: org.username,
    name: org.name,
    imageUrl: org.imageUrl,
    bio: org.bio,
    links: org.links,
    location: org.location,
    verified: org.verified,
    stewardProfile: profiles.get(org.createdByUserId)?.profile ?? null,
    stats: {
      memberCount,
      listCount: publishedLists.length,
      projectCount: publishedProjects.length,
      likeCount: likeState.likeCount
    },
    publishedLists,
    publishedProjects,
    likeCount: likeState.likeCount,
    viewer: {
      isLiked: likeState.isLiked,
      isMember: viewerInternalId
        ? Boolean(
            await prisma.orgMembership.findUnique({
              where: { orgId_userId: { orgId: org.id, userId: viewerInternalId } },
              select: { id: true }
            })
          )
        : false
    }
  }
}
