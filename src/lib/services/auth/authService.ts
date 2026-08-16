/**
 * Auth Service
 * Centralized authentication and authorization for API routes
 * Eliminates duplicate auth patterns across 40+ route files
 */

import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getViewerRole } from '@/lib/services/ownership'
import type { ViewerRole } from '@/lib/services/ownership'
import type {
  AuthResult,
  ListRole,
  AuthorizationResult
} from './types'

/**
 * Get authenticated user from Clerk + database lookup
 * Combines the two most common operations in every API route
 */
export async function getAuthenticatedUser(): Promise<AuthResult> {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return {
        user: null,
        error: 'Unauthorized',
        status: 401
      }
    }

    const user = await prisma.user.findUnique({
      where: { userId: clerkUserId },
      select: {
        id: true,
        userId: true,
        email: true,
        friends: true,
        closeFriends: true
      }
    })

    if (!user) {
      return {
        user: null,
        error: 'User not found',
        status: 404
      }
    }

    return {
      user: {
        id: user.id,
        clerkUserId: user.userId,
        email: user.email,
        friends: (user.friends || []).map((id: unknown) => String(id)),
        closeFriends: (user.closeFriends || []).map((id: unknown) => String(id))
      },
      error: null,
      status: 200
    }
  } catch (error) {
    console.error('Error in getAuthenticatedUser:', error)
    return {
      user: null,
      error: 'Internal server error',
      status: 500
    }
  }
}

/**
 * Get authenticated user with additional fields
 * Use when you need specific user data beyond the standard fields
 */
export async function getAuthenticatedUserWithFields<T extends Record<string, boolean>>(
  additionalSelect: T
): Promise<AuthResult & { userData?: Record<string, unknown> }> {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return {
        user: null,
        error: 'Unauthorized',
        status: 401
      }
    }

    const user = await prisma.user.findUnique({
      where: { userId: clerkUserId },
      select: {
        id: true,
        userId: true,
        email: true,
        friends: true,
        closeFriends: true,
        ...additionalSelect
      }
    })

    if (!user) {
      return {
        user: null,
        error: 'User not found',
        status: 404
      }
    }

    const { id, userId, email, friends, closeFriends, ...additionalData } = user

    return {
      user: {
        id,
        clerkUserId: userId,
        email,
        friends: (friends || []).map((id: unknown) => String(id)),
        closeFriends: (closeFriends || []).map((id: unknown) => String(id))
      },
      userData: additionalData,
      error: null,
      status: 200
    }
  } catch (error) {
    console.error('Error in getAuthenticatedUserWithFields:', error)
    return {
      user: null,
      error: 'Internal server error',
      status: 500
    }
  }
}

/**
 * The ownership kit canonicalises the legacy FOLLOWER list role to VIEWER; map back
 * to the legacy ListRole set so existing callers see unchanged values. MEMBER
 * (Phase 7 org role) is not a ListRole and maps to null.
 */
function viewerRoleToListRole(role: ViewerRole | null): ListRole | null {
  switch (role) {
    case 'OWNER':
    case 'MANAGER':
    case 'COLLABORATOR':
      return role
    case 'VIEWER':
      return 'FOLLOWER'
    default:
      return null
  }
}

/**
 * Get user's role in a specific list
 * Thin wrapper over the ownership kit (getViewerRole) keeping the legacy
 * ListRole return shape for existing callers.
 */
export async function getUserListRole(
  userId: string,
  listId: string
): Promise<ListRole | null> {
  return viewerRoleToListRole(await getViewerRole(userId, 'list', listId))
}

/**
 * Check if user has membership in a list with specific roles
 */
export async function checkListMembership(
  userId: string,
  listId: string,
  allowedRoles: ListRole[] = ['OWNER', 'MANAGER', 'COLLABORATOR']
): Promise<boolean> {
  const role = await getUserListRole(userId, listId)
  return role !== null && allowedRoles.includes(role)
}

/**
 * Authorize user for list operations
 * Returns detailed authorization result
 * Thin wrapper over the ownership kit preserving the legacy response shape.
 */
export async function authorizeListAccess(
  userId: string,
  listId: string,
  requiredRoles: ListRole[] = ['OWNER', 'MANAGER', 'COLLABORATOR']
): Promise<AuthorizationResult> {
  const role = viewerRoleToListRole(await getViewerRole(userId, 'list', listId))

  if (role === null) {
    return {
      authorized: false,
      role: null,
      error: 'List not found or user is not a member'
    }
  }

  if (!requiredRoles.includes(role)) {
    return {
      authorized: false,
      role,
      error: `Insufficient permissions. Required: ${requiredRoles.join(', ')}. Current: ${role}`
    }
  }

  return {
    authorized: true,
    role
  }
}

/**
 * Check if user owns a resource
 * Works with both direct userId field and users array pattern
 */
export function isResourceOwner(
  userId: string,
  resource: { userId?: string; users?: Array<{ userId: string; role: string }> }
): boolean {
  // Direct userId field
  if (resource.userId) {
    return resource.userId === userId
  }

  // Users array pattern (lists, templates)
  if (resource.users && Array.isArray(resource.users)) {
    return resource.users.some(
      (u) => u.userId === userId && u.role === 'OWNER'
    )
  }

  return false
}

/**
 * Check if user can modify a resource (owner or manager)
 */
export function canModifyResource(
  userId: string,
  resource: { userId?: string; users?: Array<{ userId: string; role: string }> }
): boolean {
  // Direct userId field - owner can modify
  if (resource.userId) {
    return resource.userId === userId
  }

  // Users array pattern - owner or manager can modify
  if (resource.users && Array.isArray(resource.users)) {
    return resource.users.some(
      (u) => u.userId === userId && ['OWNER', 'MANAGER'].includes(u.role)
    )
  }

  return false
}
