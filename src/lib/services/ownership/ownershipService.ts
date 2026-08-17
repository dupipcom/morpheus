/**
 * Ownership Service
 * The one place that answers "who owns this and what may the viewer do".
 *
 * Phase 3 implements USER ownership only, wrapping the legacy
 * getUserListRole / authorizeListAccess semantics (authService now re-exports thin
 * wrappers over this file). Phase 7 adds the ORG branch here, in one file, instead of
 * in every route.
 *
 * Kinds:
 * - 'list' | 'task' | 'job' — ownership lives on the owning List.users
 *   (task → Task.listId → List.users, job → Job.listId → List.users). Roles are the
 *   legacy ListRole set (OWNER, MANAGER, COLLABORATOR, FOLLOWER); FOLLOWER
 *   canonicalises to VIEWER.
 * - 'project' — ownership lives on Project.users (embedded UserReference, same role
 *   set as lists); fallback owner is Project.createdByUserId. Phase 5 adds USER
 *   ownership only; Phase 7 adds the ORG branch for projects.
 * - 'note' | 'event' | 'document' | 'profile' | 'wallet' — direct userId ownership
 *   (owner only for now; MEMBER/VIEWER semantics arrive with the Phase 7 org branch).
 */

import prisma from '@/lib/prisma'
import { ApiError } from '@/lib/services/errors'

export type OwnerRef = { type: 'USER' | 'ORG'; userId?: string; orgId?: string }
export type EntityKind = 'list' | 'task' | 'job' | 'project' | 'note' | 'event' | 'document' | 'profile' | 'wallet'
export type Capability = 'view' | 'edit' | 'manage' | 'delete' | 'moderate'
export type ViewerRole = 'OWNER' | 'MANAGER' | 'COLLABORATOR' | 'MEMBER' | 'VIEWER'

/** Embedded List.users reference shape (UserReference in the Prisma schema). */
interface ListUserRef {
  userId: string
  role: string
}

/** An already-fetched entity record, or its id. */
type EntityOrId = string | Record<string, unknown>

/**
 * Canonicalise a raw List.users role to the kit's viewer roles. Only the four legacy
 * ListRoles exist in the DB; anything else is treated as no role, matching the legacy
 * routes' explicit allow-lists (unknown roles were rejected there). MEMBER/VIEWER
 * outputs are reserved for the Phase 7 org branch.
 */
const ROLE_MAP: Record<string, ViewerRole | null> = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  COLLABORATOR: 'COLLABORATOR',
  FOLLOWER: 'VIEWER'
}

/**
 * Which roles satisfy each capability.
 * delete is kind-sensitive: list deletion is OWNER-only (DELETE /tasklists/[taskListId]),
 * task/job deletion also admits MANAGER (DELETE /tasks/[taskId], DELETE /jobs/[jobId]).
 */
const CAPABILITY_ROLES: Record<Capability, ViewerRole[]> = {
  view: ['OWNER', 'MANAGER', 'COLLABORATOR', 'MEMBER', 'VIEWER'],
  edit: ['OWNER', 'MANAGER', 'COLLABORATOR'],
  manage: ['OWNER', 'MANAGER'],
  delete: ['OWNER'],
  moderate: ['OWNER', 'MANAGER']
}

const DELETE_ROLES_BY_KIND: Partial<Record<EntityKind, ViewerRole[]>> = {
  task: ['OWNER', 'MANAGER'],
  job: ['OWNER', 'MANAGER']
}

/**
 * Resolve the entity's owner reference.
 * For 'task'/'job' the owner lives on the owning List.users (the records carry only
 * listId); pass the resolved list to resolveOwner, or use getViewerRole for full
 * resolution. Phase 7 fills the ORG branch.
 */
export function resolveOwner(kind: EntityKind, entity: Record<string, unknown>): OwnerRef {
  switch (kind) {
    case 'list': {
      const users = (entity.users as ListUserRef[] | undefined) || []
      const owner = users.find((u) => u.role === 'OWNER')
      return {
        type: 'USER',
        userId: owner?.userId ?? (typeof entity.userId === 'string' ? entity.userId : undefined)
      }
    }
    case 'task':
    case 'job':
      return { type: 'USER', userId: undefined }
    case 'project': {
      const users = (entity.users as ListUserRef[] | undefined) || []
      const owner = users.find((u) => u.role === 'OWNER')
      return {
        type: 'USER',
        userId: owner?.userId ?? (typeof entity.createdByUserId === 'string' ? entity.createdByUserId : undefined)
      }
    }
    case 'note':
    case 'event':
    case 'document':
    case 'profile':
    case 'wallet':
      return { type: 'USER', userId: typeof entity.userId === 'string' ? entity.userId : undefined }
  }
}

/**
 * Get the viewer's canonical role for an entity.
 * entityOrId may be the entity object (records fetched with their list embedded are
 * reused, avoiding extra queries) or its id.
 */
export async function getViewerRole(
  viewerUserId: string,
  kind: EntityKind,
  entityOrId: EntityOrId
): Promise<ViewerRole | null> {
  switch (kind) {
    case 'list':
    case 'task':
    case 'job':
    case 'project': {
      const users = await resolveListUsers(kind, entityOrId)
      if (!users) return null
      const ref = users.find((u) => u.userId === viewerUserId)
      if (!ref) return null
      return ROLE_MAP[ref.role] ?? null
    }
    case 'note':
    case 'event':
    case 'document':
    case 'profile':
    case 'wallet': {
      // Direct-owner kinds: the owner is the only role for now. Phase 7 adds
      // MEMBER/VIEWER semantics (org membership, visibility-service checks).
      const ownerUserId = await resolveDirectOwnerId(kind, entityOrId)
      return ownerUserId !== null && ownerUserId === viewerUserId ? 'OWNER' : null
    }
  }
}

/**
 * Can the viewer perform the capability on the entity?
 * view: OWNER/MANAGER/COLLABORATOR/MEMBER/VIEWER, edit: OWNER/MANAGER/COLLABORATOR,
 * manage/moderate: OWNER/MANAGER, delete: OWNER (MANAGER also for task/job).
 */
export async function can(
  viewerUserId: string,
  capability: Capability,
  kind: EntityKind,
  entityOrId: EntityOrId
): Promise<boolean> {
  const role = await getViewerRole(viewerUserId, kind, entityOrId)
  if (!role) return false
  if (CAPABILITY_ROLES[capability].includes(role)) return true
  return capability === 'delete' && (DELETE_ROLES_BY_KIND[kind]?.includes(role) ?? false)
}

/**
 * Like can(), but throws ApiError(403) when denied. Intended for route handlers:
 *   await assertCan(user.id, 'edit', 'task', taskId)
 */
export async function assertCan(
  viewerUserId: string,
  capability: Capability,
  kind: EntityKind,
  entityOrId: EntityOrId
): Promise<void> {
  if (!(await can(viewerUserId, capability, kind, entityOrId))) {
    throw new ApiError(403, 'FORBIDDEN', 'Forbidden')
  }
}

/** Owning list's users for list-backed kinds, reusing embedded data when possible. */
async function resolveListUsers(
  kind: 'list' | 'task' | 'job' | 'project',
  entityOrId: EntityOrId
): Promise<ListUserRef[] | null> {
  if (typeof entityOrId !== 'string') {
    if (kind === 'list' || kind === 'project') {
      if (Array.isArray(entityOrId.users)) return entityOrId.users as ListUserRef[]
      if (typeof entityOrId.id === 'string') return fetchOwnerUsers(kind, entityOrId.id)
      return null
    }
    const embeddedList = entityOrId.list as { users?: unknown } | undefined
    if (embeddedList && Array.isArray(embeddedList.users)) {
      return embeddedList.users as ListUserRef[]
    }
  }
  // For task/job the resolved id is the owning LIST id; for project it is the
  // project id itself.
  const ownerId = await resolveListId(kind, entityOrId)
  if (!ownerId) return null
  return fetchOwnerUsers(kind === 'project' ? 'project' : 'list', ownerId)
}

/** The owning list id for list-backed kinds ('project' resolves to the project id itself). */
async function resolveListId(
  kind: 'list' | 'task' | 'job' | 'project',
  entityOrId: EntityOrId
): Promise<string | null> {
  if (typeof entityOrId === 'string') {
    if (kind === 'list' || kind === 'project') return entityOrId
    if (kind === 'task') {
      const task = await prisma.task.findUnique({ where: { id: entityOrId }, select: { listId: true } })
      return task?.listId ?? null
    }
    const job = await prisma.job.findUnique({ where: { id: entityOrId }, select: { listId: true } })
    return job?.listId ?? null
  }
  if (kind === 'list' || kind === 'project') return typeof entityOrId.id === 'string' ? entityOrId.id : null
  return typeof entityOrId.listId === 'string' ? entityOrId.listId : null
}

async function fetchOwnerUsers(
  kind: 'list' | 'project',
  id: string
): Promise<ListUserRef[] | null> {
  if (kind === 'list') {
    const list = await prisma.list.findUnique({
      where: { id },
      select: { users: true }
    })
    return (list?.users as ListUserRef[] | undefined) || null
  }
  const project = await prisma.project.findUnique({
    where: { id },
    select: { users: true }
  })
  return (project?.users as ListUserRef[] | undefined) || null
}

/** Direct-owner kinds: resolve the owning user id from the entity or its record. */
async function resolveDirectOwnerId(kind: EntityKind, entityOrId: EntityOrId): Promise<string | null> {
  if (typeof entityOrId !== 'string') {
    return typeof entityOrId.userId === 'string' ? entityOrId.userId : null
  }
  switch (kind) {
    case 'note': {
      const note = await prisma.note.findUnique({ where: { id: entityOrId }, select: { userId: true } })
      return note?.userId ?? null
    }
    case 'event': {
      const event = await prisma.event.findUnique({ where: { id: entityOrId }, select: { userId: true } })
      return event?.userId ?? null
    }
    case 'document': {
      const document = await prisma.document.findUnique({ where: { id: entityOrId }, select: { userId: true } })
      return document?.userId ?? null
    }
    case 'profile': {
      const profile = await prisma.profile.findUnique({ where: { id: entityOrId }, select: { userId: true } })
      return profile?.userId ?? null
    }
    case 'wallet': {
      const wallet = await prisma.wallet.findUnique({ where: { id: entityOrId }, select: { userId: true } })
      return wallet?.userId ?? null
    }
    default:
      return null
  }
}
