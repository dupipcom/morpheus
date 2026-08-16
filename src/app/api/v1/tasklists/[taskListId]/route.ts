/**
 * TaskList detail API Route Handler
 *
 * GET: Fetch a single task list (members only; owners also get pending join requests)
 * PUT: Update a task list (OWNER/MANAGER)
 * DELETE: Delete a task list (OWNER)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { Visibility } from '@/generated/prisma'
import { authorizeListAccess } from '@/lib/services/auth/authService'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getViewerRole } from '@/lib/services/ownership'
import { updateTaskList, deleteTaskList, getTaskListWithTasks } from '@/lib/services/list'
import { notifyUser } from '@/lib/services/notification'

const ALLOWED_VISIBILITIES: Visibility[] = ['PUBLIC', 'PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS', 'HIDDEN']

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

/**
 * GET /api/v1/tasklists/[taskListId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskListId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskListId } = await params

    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const authorization = await authorizeListAccess(user.id, taskListId)
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.error }, { status: 403 })
    }

    const taskList = await getTaskListWithTasks(taskListId)
    if (!taskList) {
      return NextResponse.json({ error: 'Task list not found' }, { status: 404 })
    }

    // Owners and managers see pending join requests
    let pendingRequests: unknown[] | undefined
    if (authorization.role === 'OWNER' || authorization.role === 'MANAGER') {
      pendingRequests = await prisma.listRequest.findMany({
        where: { listId: taskListId, status: 'PENDING' },
        include: {
          user: {
            select: { id: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      })
    }

    return NextResponse.json({ taskList, pendingRequests })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in GET /api/v1/tasklists/[taskListId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/v1/tasklists/[taskListId]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskListId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskListId } = await params

    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const role = await getViewerRole(user.id, 'list', taskListId)
    if (role !== 'OWNER' && role !== 'MANAGER') {
      return NextResponse.json({ error: 'Only owners and managers can update a list' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      name, role: newRole, visibility, categories, area, collaborators,
      budget, budgetType, budgetPercent, budgetSourceIds,
      bio, profilePhoto, links
    } = body as Record<string, unknown>

    if (name !== undefined && typeof name !== 'string') {
      return NextResponse.json({ error: 'Name must be a string' }, { status: 400 })
    }

    if (visibility !== undefined) {
      if (typeof visibility !== 'string' || !ALLOWED_VISIBILITIES.includes(visibility as Visibility)) {
        return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 })
      }
    }

    if (budgetType !== undefined && budgetType !== null && !['FIAT', 'PERCENT'].includes(String(budgetType))) {
      return NextResponse.json({ error: 'Invalid budgetType' }, { status: 400 })
    }

    const parsedBudgetPercent = typeof budgetPercent === 'number' ? budgetPercent : undefined
    if (parsedBudgetPercent !== undefined && (parsedBudgetPercent < 0 || parsedBudgetPercent > 100)) {
      return NextResponse.json({ error: 'budgetPercent must be between 0 and 100' }, { status: 400 })
    }

    let parsedCollaborators: string[] | undefined
    if (collaborators !== undefined) {
      if (!Array.isArray(collaborators) || !collaborators.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v))) {
        return NextResponse.json({ error: 'Collaborators must be an array of user IDs' }, { status: 400 })
      }
      parsedCollaborators = collaborators as string[]
    }

    let parsedBudgetSourceIds: string[] | undefined
    if (budgetSourceIds !== undefined) {
      if (!Array.isArray(budgetSourceIds) || !budgetSourceIds.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v))) {
        return NextResponse.json({ error: 'budgetSourceIds must be an array of budget IDs' }, { status: 400 })
      }
      parsedBudgetSourceIds = budgetSourceIds as string[]
    }

    // Track current collaborators so newly added ones can be notified after the update
    const existingList = await prisma.list.findUnique({
      where: { id: taskListId },
      select: { users: true }
    })
    const existingCollaboratorIds = new Set(
      (existingList?.users || [])
        .filter((ref) => ref.role === 'COLLABORATOR')
        .map((ref) => ref.userId)
    )

    const taskList = await updateTaskList({
      taskListId,
      role: typeof newRole === 'string' ? newRole : undefined,
      name: name !== undefined ? sanitizeText(name) : undefined,
      visibility: typeof visibility === 'string' ? (visibility as Visibility) : undefined,
      categories: Array.isArray(categories) && categories.every((c) => typeof c === 'string') ? categories as string[] : undefined,
      area: typeof area === 'string' ? area : undefined,
      collaborators: parsedCollaborators,
      budget: typeof budget === 'number' ? budget : undefined,
      budgetType: budgetType !== undefined ? (budgetType as string | null) : undefined,
      budgetPercent: parsedBudgetPercent,
      budgetSourceIds: parsedBudgetSourceIds,
      bio: typeof bio === 'string' ? sanitizeText(bio) : undefined,
      profilePhoto: typeof profilePhoto === 'string' ? sanitizeText(profilePhoto) : undefined,
      links: links !== undefined ? (typeof links === 'object' ? links : null) : undefined
    })

    // Notify newly added collaborators (list invite)
    if (parsedCollaborators) {
      const addedCollaboratorIds = parsedCollaborators.filter((id) => !existingCollaboratorIds.has(id))
      for (const collaboratorId of addedCollaboratorIds) {
        void notifyUser({
          userId: collaboratorId,
          type: 'LIST_INVITE',
          actorId: user.id,
          resourceId: taskListId
        }).catch((error) => console.error('Error creating list invite notification:', error))
      }
    }

    return NextResponse.json({ taskList })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in PUT /api/v1/tasklists/[taskListId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/v1/tasklists/[taskListId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskListId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskListId } = await params

    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const role = await getViewerRole(user.id, 'list', taskListId)
    if (role !== 'OWNER') {
      return NextResponse.json({ error: 'Only the owner can delete a list' }, { status: 403 })
    }

    await deleteTaskList({ taskListId, userInternalId: user.id })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in DELETE /api/v1/tasklists/[taskListId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
