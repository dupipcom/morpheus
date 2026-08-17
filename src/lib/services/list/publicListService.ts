/**
 * Public List Service
 *
 * Public face of a List (Phase 5): allowlist-projected payload for the
 * `/list/[publicUrl]` page and the job-board discovery feed. Hard rule: the
 * public payload is built here by projection — private tasks, budgets,
 * earnings, member financials, jobs and history never enter it.
 *
 * A list is publicly visible when `publicVisible: true` AND
 * `visibility: 'PUBLIC'`. Its tasks are job posts when their own visibility is
 * PUBLIC and the list has `jobBoardEnabled`.
 */

import prisma from '@/lib/prisma'
import { ApiError } from '@/lib/services/errors'
import { getLikeState, getCounts } from '@/lib/services/social'
import { getCurrentUser, batchEnrichUserProfiles } from '@/lib/services/visibility'

/** Embedded List.users reference shape (UserReference in the Prisma schema). */
interface ListUserRef {
  userId: string
  role: string
}

/**
 * Public payload for one list. `viewerUserId` is the Clerk userId or null for
 * anonymous viewers. 404 unless published.
 */
export async function getPublicTaskList(publicUrl: string, viewerUserId: string | null) {
  const list = await prisma.list.findUnique({
    where: { publicUrl },
    include: { tasks: true }
  })

  if (!list || !list.publicVisible || list.visibility !== 'PUBLIC') {
    throw new ApiError(404, 'NOT_FOUND', 'List not found')
  }

  const currentUser = await getCurrentUser(viewerUserId)
  const viewerInternalId = currentUser?.id ?? null

  const memberRefs = (list.users as ListUserRef[]) || []
  const ownerUserId = memberRefs.find((u) => u.role === 'OWNER')?.userId ?? null
  const collaboratorIds = memberRefs
    .filter((u) => u.role !== 'OWNER' && u.role !== 'FOLLOWER')
    .map((u) => u.userId)

  // Allowlist projection of the public tasks (job posts carry their job fields)
  const publicTasks = list.tasks
    .filter((task) => task.visibility === 'PUBLIC')
    .map((task) => ({
      id: task.id,
      name: task.name,
      jobDescription: task.jobDescription,
      requirements: task.requirements,
      openings: task.openings ?? 1,
      applyBy: task.applyBy,
      premium: task.premium, // display only — never trust client numbers
      area: task.area,
      categories: task.categories,
      location: task.location
    }))

  const [profiles, likeState, project, pendingRequest, applied] = await Promise.all([
    batchEnrichUserProfiles(
      [ownerUserId, ...collaboratorIds].filter((id): id is string => Boolean(id)),
      currentUser
    ),
    getLikeState(viewerUserId, 'tasklist', list.id),
    list.projectId
      ? prisma.project.findUnique({
          where: { id: list.projectId },
          select: { username: true, name: true, publicVisible: true }
        })
      : Promise.resolve(null),
    viewerInternalId
      ? prisma.listRequest.findFirst({
          where: { listId: list.id, userId: viewerInternalId, status: 'PENDING' },
          select: { id: true }
        })
      : Promise.resolve(null),
    viewerInternalId
      ? prisma.taskApplication.findFirst({
          where: { listId: list.id, userId: viewerInternalId },
          select: { id: true }
        })
      : Promise.resolve(null)
  ])

  return {
    name: list.name,
    publicTagline: list.publicTagline,
    bio: list.bio,
    profilePhoto: list.profilePhoto,
    cover: list.coverDocumentId,
    links: list.links,
    location: list.location,
    jobBoardEnabled: list.jobBoardEnabled,
    ownerProfile: ownerUserId ? (profiles.get(ownerUserId)?.profile ?? null) : null,
    collaboratorProfiles: collaboratorIds
      .map((id) => profiles.get(id)?.profile ?? null)
      .filter(Boolean),
    project: project && project.publicVisible
      ? { publicUrl: project.username, name: project.name }
      : null,
    publicTasks,
    likeCount: likeState.likeCount,
    viewer: {
      isLiked: likeState.isLiked,
      isMember: viewerInternalId ? memberRefs.some((u) => u.userId === viewerInternalId) : false,
      hasPendingRequest: !!pendingRequest,
      hasApplied: !!applied
    }
  }
}

/**
 * Job-board discovery feed across every published list. Cursor pagination by
 * list id; `q`/`area`/`category` filter the feed.
 */
export async function listPublicTaskLists(params: {
  cursor?: string | null
  q?: string | null
  area?: string | null
  category?: string | null
  limit?: number
}): Promise<{ taskLists: unknown[]; nextCursor: string | null }> {
  const { cursor, q, area, category, limit = 20 } = params
  const take = Math.min(limit, 50)

  const where: Record<string, unknown> = {
    publicVisible: true,
    visibility: 'PUBLIC'
  }
  if (q?.trim()) where.name = { contains: q.trim() }
  if (area) where.area = area
  if (category) where.categories = { has: category }

  const lists = await prisma.list.findMany({
    where,
    select: {
      id: true,
      name: true,
      publicUrl: true,
      publicTagline: true,
      bio: true,
      profilePhoto: true,
      coverDocumentId: true,
      location: true,
      users: true,
      projectId: true
    },
    orderBy: { updatedAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  })

  const hasMore = lists.length > take
  const items = hasMore ? lists.slice(0, take) : lists

  const ownerIds = items
    .map((l) => (l.users as ListUserRef[]).find((u) => u.role === 'OWNER')?.userId)
    .filter((id): id is string => Boolean(id))
  const projectIds = items.map((l) => l.projectId).filter((id): id is string => Boolean(id))

  const [profiles, likeCounts, projects] = await Promise.all([
    batchEnrichUserProfiles(ownerIds, await getCurrentUser(null)),
    getCounts('tasklist', items.map((l) => l.id)),
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds }, publicVisible: true },
          select: { id: true, username: true, name: true }
        })
      : Promise.resolve([])
  ])

  const projectMap = new Map(projects.map((p) => [p.id, p]))

  return {
    taskLists: items.map((list) => {
      const ownerId = (list.users as ListUserRef[]).find((u) => u.role === 'OWNER')?.userId
      return {
        id: list.id,
        name: list.name,
        publicUrl: list.publicUrl,
        publicTagline: list.publicTagline,
        bio: list.bio,
        profilePhoto: list.profilePhoto,
        cover: list.coverDocumentId,
        location: list.location,
        ownerProfile: ownerId ? (profiles.get(ownerId)?.profile ?? null) : null,
        project: list.projectId
          ? (projectMap.get(list.projectId) ?? null)
          : null,
        likeCount: likeCounts[list.id] ?? 0
      }
    }),
    nextCursor: hasMore ? items[items.length - 1].id : null
  }
}
