/**
 * Visibility Service Types
 * Shared types for visibility-aware queries and profile enrichment
 */

export type VisibilityLevel = 'PRIVATE' | 'FRIENDS' | 'CLOSE_FRIENDS' | 'PUBLIC' | 'HIDDEN' | 'AI_ENABLED' | 'DOC_ENABLED'

export interface CurrentUser {
  id: string
  clerkUserId: string
  friends: string[]
  closeFriends: string[]
}

export interface RelationshipInfo {
  isOwner: boolean
  isFriend: boolean
  isCloseFriend: boolean
}

export interface ProfileData {
  userName: string | null
  firstName: string | null
  lastName: string | null
  bio: string | null
  profilePicture: string | null
  firstNameVisibility: string
  lastNameVisibility: string
  userNameVisibility: string
  bioVisibility: string
  profilePictureVisibility: string
}

export interface FilteredProfile {
  userName: string | null
  firstName?: string | null
  lastName?: string | null
  bio?: string | null
  profilePicture?: string | null
}

export interface UserWithProfile {
  id: string
  profile: FilteredProfile | null
}

export interface EntityWithOwner {
  id: string
  userId?: string
  users?: Array<{ userId: string; role: string }>
}

export interface VisibilityWhereClause {
  OR: Array<Record<string, unknown>>
}
