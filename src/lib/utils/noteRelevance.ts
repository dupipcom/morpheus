export type NoteSortBy = 'date' | 'most_relevant'

interface NoteInteractionUser {
  userId?: string | null
}

interface NoteWithInteractions {
  createdAt: string | Date
  likes?: NoteInteractionUser[]
  comments?: NoteInteractionUser[]
}

interface RelevanceContext {
  friendUserIds?: string[]
  closeFriendUserIds?: string[]
  /** The logged-in user's internal DB id; self-interactions are excluded from scoring. */
  currentUserId?: string | null
  /** Reference time used to compute recency; defaults to now. Useful for testing. */
  now?: Date
}

const FRIEND_WEIGHT = 1.5
const CLOSE_FRIEND_WEIGHT = 2
const BASE_WEIGHT = 1
const LIKE_WEIGHT = 0.3
const COMMENT_WEIGHT = 0.7
/** Hours at which the recency factor drops to 0.5 (half-life). */
const RECENCY_HALF_LIFE_HOURS = 4
/** Additive base added to the social score before applying recency, so that
 *  notes with no interactions are still ranked by recency rather than all
 *  collapsing to 0. */
const RECENCY_BASE = 1

function getInteractionWeight(
  interactionUserId: string | null | undefined,
  friendSet: Set<string>,
  closeFriendSet: Set<string>
): number {
  if (!interactionUserId) return BASE_WEIGHT
  if (closeFriendSet.has(interactionUserId)) return CLOSE_FRIEND_WEIGHT
  if (friendSet.has(interactionUserId)) return FRIEND_WEIGHT
  return BASE_WEIGHT
}

/** Returns a value in (0, 1] that decays as the note ages.
 *  Notes created within the last hour score ≥ 0.8; notes from a week ago ≈ 0.02.
 *  Future-dated notes (negative age) are clamped to 0 hours, giving them the
 *  maximum recency factor of 1.0 — same as a just-created note. */
function getRecencyFactor(createdAt: string | Date, now: Date): number {
  const ageMs = now.getTime() - new Date(createdAt).getTime()
  const ageHours = Math.max(0, ageMs) / (1000 * 60 * 60)
  return 1 / (1 + ageHours / RECENCY_HALF_LIFE_HOURS)
}

export function calculateNoteRelevanceScore(
  note: NoteWithInteractions,
  context: RelevanceContext = {}
): number {
  const friendSet = new Set(context.friendUserIds || [])
  const closeFriendSet = new Set(context.closeFriendUserIds || [])
  const currentUserId = context.currentUserId ?? null
  const now = context.now ?? new Date()

  const weightedLikes = (note.likes || []).reduce((total, like) => {
    // Exclude self-likes from the ranking signal
    if (currentUserId && like.userId === currentUserId) return total
    return total + getInteractionWeight(like.userId, friendSet, closeFriendSet)
  }, 0)

  const weightedComments = (note.comments || []).reduce((total, comment) => {
    // Exclude self-comments from the ranking signal
    if (currentUserId && comment.userId === currentUserId) return total
    return total + getInteractionWeight(comment.userId, friendSet, closeFriendSet)
  }, 0)

  const socialScore = (weightedLikes * LIKE_WEIGHT) + (weightedComments * COMMENT_WEIGHT)
  const recencyFactor = getRecencyFactor(note.createdAt, now)

  // Combine social engagement with recency: very recent content is ranked much
  // higher than older content even when the older content has more interactions.
  return (socialScore + RECENCY_BASE) * recencyFactor
}

export function normalizeNoteSortBy(rawSort: string | null | undefined): NoteSortBy {
  return rawSort === 'most_relevant' ? 'most_relevant' : 'date'
}

export function sortNotes<T extends { createdAt: string | Date; relevanceScore?: number }>(
  notes: T[],
  sortBy: NoteSortBy
): T[] {
  if (sortBy === 'most_relevant') {
    return [...notes].sort((a, b) => {
      const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0)
      if (scoreDiff !== 0) return scoreDiff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }

  return [...notes].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}
