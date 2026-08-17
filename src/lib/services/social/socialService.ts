import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { ApiError } from '@/lib/services/errors'

// Single registry of likeable/commentable entities. 'event' and 'task' are
// declared for Phase 8 / Phase 5 — no route enables them yet, and the routes
// must not start accepting them until those phases land. 'project' is live as
// of Phase 5 (likes only; comments on projects deferred).
const SOCIAL_ENTITIES = {
  note:     { model: 'note',     visibilityField: 'visibility' },
  template: { model: 'template', visibilityField: 'visibility' },
  tasklist: { model: 'list',     visibilityField: 'visibility' },
  comment:  { model: 'comment',  visibilityField: null },
  project:  { model: 'project',  visibilityField: null },           // Phase 5 — likes only (publicVisible gates reads, not visibility)
  org:      { model: 'organization', visibilityField: null },       // Phase 7 — likes only (publicVisible gates reads, not visibility)
  event:    { model: 'event',    visibilityField: 'visibility' },   // enabled in Phase 8 — do NOT enable routes for it now
  task:     { model: 'task',     visibilityField: 'visibility' },   // enabled in Phase 5 — do NOT enable routes for it now
} as const

type SocialEntityType = keyof typeof SOCIAL_ENTITIES

// 'list' is the historical API alias for tasklists (the comments route accepts
// both spellings today)
const ENTITY_TYPE_ALIASES: Record<string, SocialEntityType> = {
  list: 'tasklist',
}

// Entity types the likes route accepts today, with the legacy Like relation
// field set on create. `tasklist` has no relation field on the Like schema
// (noteId/templateId/commentId only), so the like persists with just
// entityType/entityId — the @@unique([userId, entityType, entityId]) index
// makes the toggle work. (Previously tasklist likes wrote a nonexistent
// taskListId field and every create failed at the DB layer.)
const LIKEABLE_ENTITIES: Record<string, { model: string; relationField: string | null }> = {
  note:     { model: 'note',     relationField: 'noteId' },
  template: { model: 'template', relationField: 'templateId' },
  tasklist: { model: 'list',     relationField: null },
  comment:  { model: 'comment',  relationField: 'commentId' },
  project:  { model: 'project',  relationField: null },   // like tasklist: persists with entityType/entityId only
  org:      { model: 'organization', relationField: null },
}

// Entity types the comments route accepts today (canonical keys after
// normalizeEntityType). 'profile' is commentable but not likeable.
const COMMENTABLE_ENTITIES: Record<string, { model: string; relationField: string }> = {
  note:     { model: 'note',     relationField: 'noteId' },
  template: { model: 'template', relationField: 'templateId' },
  tasklist: { model: 'list',     relationField: 'listId' },
  profile:  { model: 'profile',  relationField: 'profileId' },
  event:    { model: 'event',    relationField: 'eventId' },
}

type FindUniqueById = { findUnique: (args: { where: { id: string } }) => Promise<unknown> }

const MODEL_DELEGATES: Record<string, FindUniqueById> = {
  note: prisma.note,
  template: prisma.template,
  list: prisma.list,
  comment: prisma.comment,
  profile: prisma.profile,
  project: prisma.project,
  organization: prisma.organization,
  event: prisma.event,
  task: prisma.task,
}

/**
 * Normalize an API entity type to its canonical registry key.
 * 'list' → 'tasklist'; unknown types → null.
 */
export function normalizeEntityType(entityType: string): SocialEntityType | null {
  if (entityType in SOCIAL_ENTITIES) {
    return entityType as SocialEntityType
  }
  return ENTITY_TYPE_ALIASES[entityType] ?? null
}

async function assertEntityExists(model: string, entityId: string): Promise<void> {
  const delegate = MODEL_DELEGATES[model]
  const entity = await delegate.findUnique({ where: { id: entityId } })
  if (!entity) {
    throw new ApiError(404, 'NOT_FOUND', 'Entity not found')
  }
}

// Transform profiles[0] to profile and extract data values (same shape the
// routes returned before the service extraction)
function transformCommentProfile(comment: any): any {
  const profileData = comment.user.profiles?.[0]?.data
  const profile = profileData ? {
    userName: profileData.username?.value || null,
    profilePicture: profileData.profilePicture?.value || null,
    firstName: profileData.firstName?.value || null,
    lastName: profileData.lastName?.value || null
  } : null

  return {
    ...comment,
    user: {
      ...comment.user,
      profile
    }
  }
}

/**
 * Toggle a like for an entity (like if not liked, unlike if already liked).
 * `viewerUserId` is the Clerk userId; the internal User is resolved here.
 * Returns `{ liked, likeCount }` — same shape the route returned before.
 */
export async function toggleLike(
  viewerUserId: string,
  entityType: string | null | undefined,
  entityId: string | null | undefined
): Promise<{ liked: boolean; likeCount: number }> {
  if (!entityType || !entityId) {
    throw new ApiError(400, 'VALIDATION', 'entityType and entityId are required')
  }

  const likeEntity = LIKEABLE_ENTITIES[entityType]
  if (!likeEntity) {
    throw new ApiError(400, 'VALIDATION', 'Invalid entityType')
  }

  await assertEntityExists(likeEntity.model, entityId)

  // Get user from database
  const user = await prisma.user.findUnique({
    where: { userId: viewerUserId }
  })

  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found')
  }

  // Check if like already exists
  const existingLike = await prisma.like.findUnique({
    where: {
      userId_entityType_entityId: {
        userId: user.id,
        entityType,
        entityId
      }
    }
  })

  if (existingLike) {
    // Unlike - delete the like
    await prisma.like.delete({
      where: { id: existingLike.id }
    })

    // Get updated like count
    const likeCount = await prisma.like.count({
      where: {
        entityType,
        entityId
      }
    })

    return { liked: false, likeCount }
  }

  // Like - create the like
  const likeData: any = {
    entityType,
    entityId,
    userId: user.id
  }

  // Set the appropriate relation field for backward compatibility
  if (likeEntity.relationField) {
    likeData[likeEntity.relationField] = entityId
  }

  try {
    await prisma.like.create({
      data: likeData
    })
  } catch (error: any) {
    // Handle unique constraint violation (already liked)
    if (error?.code === 'P2002') {
      throw new ApiError(409, 'P2002', 'Already liked')
    }
    throw error
  }

  // Get updated like count
  const likeCount = await prisma.like.count({
    where: {
      entityType,
      entityId
    }
  })

  return { liked: true, likeCount }
}

/**
 * Get like status and count for an entity. `viewerUserId` may be null
 * (anonymous GET); isLiked is false in that case.
 */
export async function getLikeState(
  viewerUserId: string | null,
  entityType: string | null | undefined,
  entityId: string | null | undefined
): Promise<{ isLiked: boolean; likeCount: number }> {
  if (!entityType || !entityId) {
    throw new ApiError(400, 'VALIDATION', 'entityType and entityId are required')
  }

  // Get like count
  const likeCount = await prisma.like.count({
    where: {
      entityType,
      entityId
    }
  })

  // Check if current user has liked this entity
  let isLiked = false
  if (viewerUserId) {
    const user = await prisma.user.findUnique({
      where: { userId: viewerUserId }
    })

    if (user) {
      const existingLike = await prisma.like.findUnique({
        where: {
          userId_entityType_entityId: {
            userId: user.id,
            entityType,
            entityId
          }
        }
      })
      isLiked = !!existingLike
    }
  }

  return { isLiked, likeCount }
}

/**
 * Batched like counts for many entities of the same type (kills the N+1 in feeds).
 * Returns a map of entityId → like count (0 for ids with no likes).
 */
export async function getCounts(entityType: string, entityIds: string[]): Promise<Record<string, number>> {
  if (entityIds.length === 0) {
    return {}
  }

  // Like documents store the canonical type; honor the 'list' → 'tasklist' alias
  const normalized = normalizeEntityType(entityType) ?? entityType

  const grouped = await prisma.like.groupBy({
    by: ['entityId'],
    where: {
      entityType: normalized,
      entityId: { in: entityIds }
    },
    _count: { _all: true }
  })

  const counts: Record<string, number> = {}
  for (const entityId of entityIds) {
    counts[entityId] = 0
  }
  for (const group of grouped) {
    counts[group.entityId] = group._count._all
  }
  return counts
}

/**
 * List comments for an entity, sorted by like count desc then createdAt desc,
 * with author profile and like count (same shape the route returned before).
 */
export async function listComments(
  entityType: string | null | undefined,
  entityId: string | null | undefined
): Promise<any[]> {
  if (!entityType || !entityId) {
    throw new ApiError(400, 'VALIDATION', 'entityType and entityId are required')
  }

  const commentEntity = COMMENTABLE_ENTITIES[normalizeEntityType(entityType) ?? '']
  if (!commentEntity) {
    throw new ApiError(400, 'VALIDATION', 'Invalid entityType')
  }

  // Build where clause based on entity type
  const whereClause: any = {}
  whereClause[commentEntity.relationField] = entityId

  // Fetch comments for the entity with like counts
  const comments = await prisma.comment.findMany({
    where: whereClause,
    include: {
      user: {
        include: {
          profiles: {
            select: {
              data: true
            }
          }
        }
      },
      _count: {
        select: {
          likes: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  // Sort by like count (descending), then by creation date (descending)
  return comments
    .map(transformCommentProfile)
    .sort((a: any, b: any) => {
      const likeDiff = (b._count?.likes || 0) - (a._count?.likes || 0)
      if (likeDiff !== 0) return likeDiff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
}

/**
 * Create a comment for an entity. `viewerUserId` is the Clerk userId.
 * Content is sanitized with sanitizeText before persistence.
 * Returns the created comment (with author profile) — same shape as before.
 */
export async function createComment(
  viewerUserId: string,
  content: string | null | undefined,
  entityType: string | null | undefined,
  entityId: string | null | undefined
): Promise<any> {
  if (!content || !content.trim()) {
    throw new ApiError(400, 'VALIDATION', 'Content is required')
  }

  // Sanitize content to prevent XSS attacks
  const sanitizedContent = sanitizeText(content.trim())

  if (!entityType || !entityId) {
    throw new ApiError(400, 'VALIDATION', 'entityType and entityId are required')
  }

  const commentEntity = COMMENTABLE_ENTITIES[normalizeEntityType(entityType) ?? '']
  if (!commentEntity) {
    throw new ApiError(400, 'VALIDATION', 'Invalid entityType')
  }

  await assertEntityExists(commentEntity.model, entityId)

  // Get user from database
  const user = await prisma.user.findUnique({
    where: { userId: viewerUserId }
  })

  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found')
  }

  // Build comment data based on entity type
  const commentData: any = {
    content: sanitizedContent,
    userId: user.id
  }

  // Set the appropriate relation field based on entity type
  commentData[commentEntity.relationField] = entityId

  // Create comment
  const comment = await prisma.comment.create({
    data: commentData,
    include: {
      user: {
        include: {
          profiles: {
            select: {
              data: true
            }
          }
        }
      }
    }
  })

  return transformCommentProfile(comment)
}

/**
 * Delete a comment. `viewerUserId` is the Clerk userId; ownership is enforced
 * (comment.userId must match the internal user). Same checks and error strings
 * as the DELETE /api/v1/comments/[commentId] route.
 */
export async function deleteComment(viewerUserId: string, commentId: string): Promise<void> {
  // Get user from database
  const user = await prisma.user.findUnique({
    where: { userId: viewerUserId }
  })

  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found')
  }

  // Verify comment exists and user owns it
  const comment = await prisma.comment.findUnique({
    where: { id: commentId }
  })

  if (!comment) {
    throw new ApiError(404, 'NOT_FOUND', 'Comment not found')
  }

  if (comment.userId !== user.id) {
    throw new ApiError(403, 'FORBIDDEN', 'Forbidden')
  }

  // Delete comment
  await prisma.comment.delete({
    where: { id: commentId }
  })
}
