/**
 * Auth Service Types
 * Shared types for server-side authentication and authorization
 */

export interface AuthenticatedUser {
  id: string
  clerkUserId: string
  email?: string | null
  friends?: string[]
  closeFriends?: string[]
}

export interface AuthResult {
  user: AuthenticatedUser | null
  error: string | null
  status: number
}

export type ListRole = 'OWNER' | 'MANAGER' | 'COLLABORATOR' | 'FOLLOWER'

export interface ListMembership {
  userId: string
  role: ListRole
}

export interface AuthorizationResult {
  authorized: boolean
  role: ListRole | null
  error?: string
}
