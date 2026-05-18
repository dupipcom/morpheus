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
}

const FRIEND_WEIGHT = 1.5
const CLOSE_FRIEND_WEIGHT = 2
const BASE_WEIGHT = 1
const LIKE_WEIGHT = 0.3
const COMMENT_WEIGHT = 0.7

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

export function calculateNoteRelevanceScore(
  note: NoteWithInteractions,
  context: RelevanceContext = {}
): number {
  const friendSet = new Set(context.friendUserIds || [])
  const closeFriendSet = new Set(context.closeFriendUserIds || [])

  const weightedLikes = (note.likes || []).reduce((total, like) => {
    return total + getInteractionWeight(like.userId, friendSet, closeFriendSet)
  }, 0)

  const weightedComments = (note.comments || []).reduce((total, comment) => {
    return total + getInteractionWeight(comment.userId, friendSet, closeFriendSet)
  }, 0)

  return (weightedLikes * LIKE_WEIGHT) + (weightedComments * COMMENT_WEIGHT)
}

export function normalizeNoteSortBy(rawSort: string | null | undefined): NoteSortBy {
  return rawSort === 'most_relevant' ? 'most_relevant' : 'date'
}

export function sortNotes(
  notes: Array<{ createdAt: string | Date; relevanceScore?: number }>,
  sortBy: NoteSortBy
) {
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
