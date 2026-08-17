/**
 * Project Service
 *
 * Public container between users/orgs and lists. Phase 5 implements USER
 * ownership only (Project.users embedded UserReference); Phase 7 adds
 * ownerType/orgId + Organization.projects, Phase 8 adds eventIds/events.
 *
 * The `username` handle doubles as the /p/ URL segment and lives in the shared
 * /@ namespace with user and (Phase 7) org handles — global uniqueness is
 * enforced at creation by cross-checking the other collections.
 *
 * Privacy rule: the public payload is an allowlist projection built here — no
 * private field ever enters it (publicVisible gates reads, never a missing slug).
 */

import prisma from '@/lib/prisma'
import { ApiError } from '@/lib/services/errors'
import { slugify, ensureUniqueSlug } from '@/lib/public/slug'
import { getLikeState, getCounts } from '@/lib/services/social'
import { getCurrentUser, batchEnrichUserProfiles } from '@/lib/services/visibility'
import type { CreateProjectInput, UpdateProjectInput, PublicProjectCard } from './types'

/** Embedded Project.users reference shape (UserReference in the Prisma schema). */
interface ProjectUserRef {
  userId: string
  role: string
}

/**
 * Username handle for a project: slugify(name) + uniqueness retry across
 * Project.username and Profile.username (the shared /@ namespace). Phase 7 adds
 * Organization.username to the cross-check.
 */
export async function generateProjectUsername(name: string): Promise<string> {
  const base = slugify(name)
  return ensureUniqueSlug(base, async (candidate) => {
    const [project, profile] = await Promise.all([
      prisma.project.findUnique({ where: { username: candidate }, select: { id: true } }),
      prisma.profile.findUnique({ where: { username: candidate }, select: { id: true } })
    ])
    return Boolean(project || profile)
  })
}

/**
 * Create a project. Always unpublished (publicVisible: false — opt-in
 * publishing) with the creator as OWNER and optional collaborators.
 */
export async function createProject(input: CreateProjectInput) {
  const {
    userInternalId, name, bio, photoDocumentId, coverDocumentId,
    links, supportUrl, collaborators
  } = input

  const username = await generateProjectUsername(name)

  return prisma.project.create({
    data: {
      name,
      username,
      bio: bio ?? null,
      photoDocumentId: photoDocumentId ?? null,
      coverDocumentId: coverDocumentId ?? null,
      links: links ?? null,
      supportUrl: supportUrl ?? null,
      publicVisible: false,
      spotlight: false,
      createdByUserId: userInternalId,
      users: [
        { userId: userInternalId, role: 'OWNER' as const },
        ...(Array.isArray(collaborators)
          ? collaborators.map((id) => ({ userId: id, role: 'COLLABORATOR' as const }))
          : [])
      ] as never
    }
  })
}

/**
 * Update a project's public-profile fields. OWNER/MANAGER only (same manage
 * capability as list updates). `collaborators` replaces the non-owner member
 * set, preserving every OWNER entry.
 */
export async function updateProject(params: {
  viewerUserId: string
  input: UpdateProjectInput
}) {
  const { viewerUserId, input } = params

  const existing = await prisma.project.findUnique({ where: { id: input.projectId } })
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found')
  }

  const ref = (existing.users as ProjectUserRef[]).find((u) => u.userId === viewerUserId)
  if (!ref || !['OWNER', 'MANAGER'].includes(ref.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'Forbidden')
  }

  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.bio !== undefined) data.bio = input.bio
  if (input.photoDocumentId !== undefined) data.photoDocumentId = input.photoDocumentId
  if (input.coverDocumentId !== undefined) data.coverDocumentId = input.coverDocumentId
  if (input.links !== undefined) data.links = input.links
  if (input.supportUrl !== undefined) data.supportUrl = input.supportUrl
  if (input.spotlight !== undefined) data.spotlight = input.spotlight
  if (input.publicVisible !== undefined) data.publicVisible = input.publicVisible

  if (input.collaborators !== undefined) {
    const owners = (existing.users as ProjectUserRef[]).filter((u) => u.role === 'OWNER')
    data.users = [
      ...owners,
      ...input.collaborators.map((id) => ({ userId: id, role: 'COLLABORATOR' as const }))
    ]
  }

  return prisma.project.update({
    where: { id: input.projectId },
    data
  })
}

/**
 * Public project payload (allowlist projection). `viewerUserId` is the Clerk
 * userId or null for anonymous viewers. 404 unless published.
 */
export async function getPublicProject(username: string, viewerUserId: string | null) {
  const project = await prisma.project.findUnique({ where: { username } })
  if (!project || !project.publicVisible) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found')
  }

  const memberIds = (project.users as ProjectUserRef[]).map((u) => u.userId)
  const ownerUserId =
    (project.users as ProjectUserRef[]).find((u) => u.role === 'OWNER')?.userId ??
    project.createdByUserId

  const currentUser = await getCurrentUser(viewerUserId)
  const viewerInternalId = currentUser?.id ?? null

  const [publishedLists, listCount, likeState, profiles] = await Promise.all([
    prisma.list.findMany({
      where: { projectId: project.id, publicVisible: true, visibility: 'PUBLIC' },
      select: {
        id: true,
        name: true,
        publicUrl: true,
        publicTagline: true,
        profilePhoto: true,
        bio: true,
        location: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 50
    }),
    prisma.list.count({ where: { projectId: project.id, publicVisible: true } }),
    getLikeState(viewerUserId, 'project', project.id),
    batchEnrichUserProfiles([ownerUserId], currentUser)
  ])

  return {
    name: project.name,
    username: project.username,
    bio: project.bio,
    photo: project.photoDocumentId,
    cover: project.coverDocumentId,
    links: project.links,
    supportUrl: project.supportUrl,
    spotlight: project.spotlight,
    ownerProfile: profiles.get(ownerUserId)?.profile ?? null,
    stats: {
      listCount,
      likeCount: likeState.likeCount,
      memberCount: memberIds.length
    },
    publishedLists: publishedLists.map((list) => ({
      id: list.id,
      name: list.name,
      publicUrl: list.publicUrl,
      publicTagline: list.publicTagline,
      profilePhoto: list.profilePhoto,
      bio: list.bio,
      location: list.location
    })),
    likeCount: likeState.likeCount,
    viewer: {
      isLiked: likeState.isLiked,
      isMember: viewerInternalId ? memberIds.includes(viewerInternalId) : false
    }
  }
}

/**
 * Project discovery feed — spotlight first, then recently updated. Cursor
 * pagination by project id.
 */
export async function listPublicProjects(params: {
  cursor?: string | null
  q?: string | null
  limit?: number
}): Promise<{ projects: PublicProjectCard[]; nextCursor: string | null }> {
  const { cursor, q, limit = 20 } = params
  const take = Math.min(limit, 50)

  const projects = await prisma.project.findMany({
    where: {
      publicVisible: true,
      ...(q?.trim() ? { name: { contains: q.trim() } } : {})
    },
    select: {
      id: true,
      name: true,
      username: true,
      bio: true,
      photoDocumentId: true,
      coverDocumentId: true,
      spotlight: true,
      users: true
    },
    orderBy: [{ spotlight: 'desc' }, { updatedAt: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  })

  const hasMore = projects.length > take
  const items = hasMore ? projects.slice(0, take) : projects

  const likeCounts = await getCounts('project', items.map((p) => p.id))

  return {
    projects: items.map((p) => ({
      id: p.id,
      name: p.name,
      username: p.username,
      bio: p.bio,
      photo: p.photoDocumentId,
      cover: p.coverDocumentId,
      spotlight: p.spotlight,
      memberCount: (p.users as ProjectUserRef[]).length,
      likeCount: likeCounts[p.id] ?? 0
    })),
    nextCursor: hasMore ? items[items.length - 1].id : null
  }
}
