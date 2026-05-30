/**
 * TaskList API Route Handler
 * Refactored to use service layer for business logic
 *
 * GET: Fetch task lists for authenticated user
 * POST: Handle various task list operations (create, update, delete, completions, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import {
  getUserLocale,
  loadTranslationsForLocale,
  translateTemplateTasks,
  ensureUniqueTaskIds,
  parseBudget,
  getUserBalanceValues,
  getYearFromISO,
  getTodayISO,
  getLocalizedListName,
  Task,
  TaskListPostBody
} from '@/lib/services/tasklist'
import {
  getTaskListsForUser,
  calculateCollaboratorEarnings,
  ensureDefaultTaskLists,
  deleteTaskList,
  createTaskList,
  updateTaskList,
  updateTemplateWithTasks,
  getTaskListWithTemplate,
  getListCompletionData
} from '@/lib/services/tasklist'
import { recordCompletions } from '@/lib/services/tasklist'
import { updateTaskStatus, updateTaskRedacted } from '@/lib/services/tasklist'
import { processEphemeralTasks } from '@/lib/services/tasklist'
import { updateTaskCompletionHandler } from './handlers/updateTaskCompletion'

/**
 * GET /api/v1/tasklists
 * Fetch task lists for the authenticated user
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')

    // Find user by userId
    const user = await prisma.user.findUnique({
      where: { userId: userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get user's locale and translations
    const userLocale = getUserLocale(request)
    const translations = loadTranslationsForLocale(userLocale)

    // Ensure default daily/weekly lists exist for the owner
    await ensureDefaultTaskLists({
      userId: userId,
      userInternalId: user.id,
      translations
    })

    // Get task lists
    const taskLists = await getTaskListsForUser({
      userId: userId,
      role: role
    })

    // Calculate collaborator earnings for each task list
    const taskListsWithEarnings = await calculateCollaboratorEarnings(taskLists)

    // Add job-based completion data to each list
    const taskListsWithCompletion = await Promise.all(
      taskListsWithEarnings.map(async (list: any) => {
        try {
          const jobCompletionData = await getListCompletionData(list.id)
          return {
            ...list,
            jobCompletedTasks: jobCompletionData  // Separate field to not overwrite legacy data
          }
        } catch (error) {
          console.error(`Error getting completion data for list ${list.id}:`, error)
          return {
            ...list,
            jobCompletedTasks: {}
          }
        }
      })
    )

    return NextResponse.json({ taskLists: taskListsWithCompletion })
  } catch (error) {
    console.error('Error fetching task lists:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/tasklists
 * Handle various task list operations
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: TaskListPostBody = await request.json()
    const {
      role,
      tasks,
      templateId,
      updateTemplate,
      name,
      budget: budgetRaw,
      budgetPercentage,
      dueDate,
      create,
      collaborators
    } = body

    // Parse budget as float
    const budget = parseBudget(budgetRaw)

    // Find user by userId
    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: { id: true, availableBalance: true, stash: true, equity: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get user's locale and translations
    const userLocale = getUserLocale(request)
    const translations = loadTranslationsForLocale(userLocale)

    // Translate tasks if provided
    let translatedTasks = tasks
    if (Array.isArray(tasks) && tasks.length > 0) {
      translatedTasks = translateTemplateTasks(tasks as Task[], translations)
      translatedTasks = ensureUniqueTaskIds(translatedTasks, !!templateId)
    }

    // Get localized name if not provided and creating a default list
    let localizedName = name
    if (!localizedName && role && role.endsWith('.default')) {
      localizedName = getLocalizedListName(role, translations, name)
    }

    // Handle delete task list
    if (body.deleteTaskList && body.taskListId) {
      await deleteTaskList({
        taskListId: body.taskListId,
        userId: user.id
      })
      return NextResponse.json({ ok: true })
    }

    // Handle record completions
    if (body.recordCompletions && body.taskListId && (body.dayActions?.length || body.weekActions?.length || Array.isArray(body.justUncompletedNames))) {
      const incomingTasks: Task[] = (body.dayActions?.length ? body.dayActions : body.weekActions) || []
      const justCompletedNames: string[] = Array.isArray(body.justCompletedNames) ? body.justCompletedNames : []
      const justUncompletedNames: string[] = Array.isArray(body.justUncompletedNames) ? body.justUncompletedNames : []
      const dateISO = (body.date || getTodayISO()) as string

      const result = await recordCompletions({
        taskListId: body.taskListId,
        user: user,
        incomingTasks,
        justCompletedNames,
        justUncompletedNames,
        dateISO
      })

      return NextResponse.json({ taskList: result.taskList, earnings: result.earnings })
    }

    // Handle update task completion
    if (body.updateTaskCompletion && body.taskListId && body.taskId) {
      return updateTaskCompletionHandler(body, user)
    }

    // Handle ephemeral tasks operations
    if (body.ephemeralTasks && body.taskListId) {
      const taskList = await processEphemeralTasks({
        taskListId: body.taskListId,
        operations: body.ephemeralTasks
      })
      return NextResponse.json({ taskList })
    }

    // Handle update task status
    if (body.updateTaskStatus && body.taskListId) {
      const taskId = body.taskId
      const taskKey = body.taskKey
      const newStatus = body.status || body.taskStatus || 'open'
      const newCount = body.count !== undefined ? Number(body.count) : undefined
      const newTimes = body.times !== undefined ? Number(body.times) : undefined
      const dateISO = body.date || getTodayISO()
      const userBalanceValues = getUserBalanceValues(user)

      const taskList = await updateTaskStatus({
        taskListId: body.taskListId,
        userId: user.id,
        taskId,
        taskKey,
        newStatus,
        newCount,
        newTimes,
        dateISO,
        userBalanceValues
      })

      return NextResponse.json({ taskList })
    }

    // Handle update task redacted status
    if (body.updateTaskRedacted && body.taskListId) {
      const taskKey = body.taskKey
      const redacted = body.redacted === true

      if (!taskKey) {
        return NextResponse.json({ error: 'taskKey is required' }, { status: 400 })
      }

      const taskList = await updateTaskRedacted({
        taskListId: body.taskListId,
        taskKey,
        redacted
      })

      return NextResponse.json({ taskLists: [taskList] })
    }

    // Handle update existing task list by ID
    if (body.taskListId && create === false) {
      const taskList = await updateTaskList({
        taskListId: body.taskListId,
        userId: user.id,
        role,
        name,
        budget,
        budgetPercentage,
        dueDate,
        templateId,
        tasks: translatedTasks as Task[],
        collaborators
      })

      return NextResponse.json({ taskList })
    }

    // Handle create or update task list by role
    const existingTaskList = await prisma.list?.findFirst({
      where: {
        users: {
          some: {
            userId: user.id,
            role: 'OWNER'
          }
        },
        role: role
      }
    })

    let taskList

    if (create) {
      // Create new TaskList
      taskList = await createTaskList({
        userId: user.id,
        role,
        name: localizedName,
        budget,
        budgetPercentage,
        dueDate,
        templateId,
        tasks: translatedTasks as Task[],
        collaborators
      })
    } else if (existingTaskList) {
      // Update existing TaskList
      taskList = await updateTaskList({
        taskListId: existingTaskList.id,
        userId: user.id,
        role,
        name,
        budget,
        budgetPercentage,
        dueDate,
        templateId,
        tasks: translatedTasks as Task[],
        collaborators
      })
    } else {
      // Create new TaskList
      taskList = await createTaskList({
        userId: user.id,
        role,
        name: localizedName,
        budget,
        budgetPercentage,
        dueDate,
        templateId,
        tasks: translatedTasks as Task[],
        collaborators
      })
    }

    // Optionally update the linked Template
    if (updateTemplate && taskList?.templateId && translatedTasks) {
      await updateTemplateWithTasks({
        templateId: taskList.templateId,
        tasks: translatedTasks as Task[]
      })

      // Re-fetch task list to include refreshed template relation
      taskList = await getTaskListWithTemplate(taskList.id)
    }

    return NextResponse.json({ taskList })
  } catch (error) {
    console.error('Error updating task list:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
