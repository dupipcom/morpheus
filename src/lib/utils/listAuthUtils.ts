import prisma from '@/lib/prisma'

export type UserRole = 'OWNER' | 'MANAGER' | 'COLLABORATOR' | 'FOLLOWER'

/**
 * Checks if a user is a member of a list (OWNER, MANAGER, COLLABORATOR, or FOLLOWER)
 * @param userId - The MongoDB ObjectId of the user
 * @param listId - The MongoDB ObjectId of the list
 * @returns boolean - true if user is a member, false otherwise
 */
export async function checkListMembership(
  userId: string,
  listId: string
): Promise<boolean> {
  try {
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: {
        users: true
      }
    })

    if (!list) {
      return false
    }

    const users = (list.users as any[]) || []
    return users.some((u: any) => u.userId === userId)
  } catch (error) {
    console.error('Error checking list membership:', error)
    return false
  }
}

/**
 * Gets the user's role in a list
 * @param userId - The MongoDB ObjectId of the user
 * @param listId - The MongoDB ObjectId of the list
 * @returns UserRole | null - The user's role or null if not a member
 */
export async function getUserListRole(
  userId: string,
  listId: string
): Promise<UserRole | null> {
  try {
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: {
        users: true
      }
    })

    if (!list) {
      return null
    }

    const users = (list.users as any[]) || []
    const userEntry = users.find((u: any) => u.userId === userId)
    
    if (!userEntry) {
      return null
    }

    return userEntry.role as UserRole
  } catch (error) {
    console.error('Error getting user list role:', error)
    return null
  }
}

/**
 * Checks if a user has permission to create tasks (OWNER or MANAGER only)
 * @param userId - The MongoDB ObjectId of the user
 * @param listId - The MongoDB ObjectId of the list
 * @returns boolean - true if user can create tasks, false otherwise
 */
export async function canCreateTask(
  userId: string,
  listId: string
): Promise<boolean> {
  const role = await getUserListRole(userId, listId)
  return role === 'OWNER' || role === 'MANAGER'
}

/**
 * Checks if a user has permission to update/delete tasks (OWNER or MANAGER only)
 * @param userId - The MongoDB ObjectId of the user
 * @param listId - The MongoDB ObjectId of the list
 * @returns boolean - true if user can update/delete tasks, false otherwise
 */
export async function canModifyTask(
  userId: string,
  listId: string
): Promise<boolean> {
  const role = await getUserListRole(userId, listId)
  return role === 'OWNER' || role === 'MANAGER'
}

/**
 * Checks if a user has permission to create jobs (OWNER, MANAGER, or COLLABORATOR)
 * @param userId - The MongoDB ObjectId of the user
 * @param listId - The MongoDB ObjectId of the list
 * @returns boolean - true if user can create jobs, false otherwise
 */
export async function canCreateJob(
  userId: string,
  listId: string
): Promise<boolean> {
  const role = await getUserListRole(userId, listId)
  return role === 'OWNER' || role === 'MANAGER' || role === 'COLLABORATOR'
}

/**
 * Checks if a user has permission to validate jobs (OWNER or MANAGER only, and not the worker)
 * @param userId - The MongoDB ObjectId of the user
 * @param listId - The MongoDB ObjectId of the list
 * @param workerId - The MongoDB ObjectId of the job worker
 * @returns boolean - true if user can validate the job, false otherwise
 */
export async function canValidateJob(
  userId: string,
  listId: string,
  workerId: string
): Promise<boolean> {
  // Worker cannot validate their own job
  if (userId === workerId) {
    return false
  }

  const role = await getUserListRole(userId, listId)
  return role === 'OWNER' || role === 'MANAGER'
}

/**
 * Checks if a user has permission to delete jobs (OWNER or MANAGER only)
 * @param userId - The MongoDB ObjectId of the user
 * @param listId - The MongoDB ObjectId of the list
 * @returns boolean - true if user can delete jobs, false otherwise
 */
export async function canDeleteJob(
  userId: string,
  listId: string
): Promise<boolean> {
  const role = await getUserListRole(userId, listId)
  return role === 'OWNER' || role === 'MANAGER'
}

