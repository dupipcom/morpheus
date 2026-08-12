/**
 * TaskList API Route Handler
 *
 * GET: Fetch task lists for the authenticated user (ensures default lists)
 * POST: Create a task list (with optional initial tasks)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { Visibility } from '@/generated/prisma'
import {
  getTaskListsForUser,
  ensureDefaultTaskLists,
  createTaskList,
  getListCompletionData,
  getUserLocale,
  loadTranslationsForLocale,
  type NewTaskInput
} from '@/lib/services/tasklist'

const ALLOWED_VISIBILITIES: Visibility[] = ['PUBLIC', 'PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS', 'HIDDEN']

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

function parseVisibility(value: unknown): Visibility | null {
  if (typeof value !== 'string') return null
  return ALLOWED_VISIBILITIES.includes(value as Visibility) ? (value as Visibility) : null
}

function parseObjectIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v))) return null
  return value as string[]
}

function parseNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number' && !isNaN(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

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
      where: { userId: userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Ensure default daily/weekly lists exist for the owner (localized)
    const userLocale = getUserLocale(request)
    const translations = loadTranslationsForLocale(userLocale)
    await ensureDefaultTaskLists({
      userInternalId: user.id,
      translations
    })

    // Get task lists
    const taskLists = await getTaskListsForUser({
      userId: userId,
      role: role
    })

    // Add job-based completion data to each list
    const taskListsWithCompletion = await Promise.all(
      taskLists.map(async (list) => {
        try {
          const jobCompletionData = await getListCompletionData(list.id)
          return { ...list, jobCompletedTasks: jobCompletionData }
        } catch (error) {
          console.error(`Error getting completion data for list ${list.id}:`, error)
          return { ...list, jobCompletedTasks: {} }
        }
      })
    )

    return NextResponse.json({ taskLists: taskListsWithCompletion })
  } catch (error) {
    console.error('Error in GET /api/v1/tasklists:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/tasklists
 * Create a task list (create-only; updates go through /api/v1/tasklists/[taskListId])
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      name, role, visibility, categories, area, collaborators,
      budget, budgetType, budgetPercent, budgetSourceIds,
      bio, profilePhoto, links, tasks
    } = body as Record<string, unknown>

    // Validate name
    if (name !== undefined && typeof name !== 'string') {
      return NextResponse.json({ error: 'Name must be a string' }, { status: 400 })
    }
    const sanitizedName = name !== undefined ? sanitizeText(name) : null

    // Validate visibility
    let parsedVisibility: Visibility | null = null
    if (visibility !== undefined) {
      parsedVisibility = parseVisibility(visibility)
      if (!parsedVisibility) {
        return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 })
      }
    }

    // Validate collaborators (internal user ObjectIds)
    let parsedCollaborators: string[] | undefined
    if (collaborators !== undefined) {
      const parsed = parseObjectIds(collaborators)
      if (!parsed) {
        return NextResponse.json({ error: 'Collaborators must be an array of user IDs' }, { status: 400 })
      }
      parsedCollaborators = parsed
    }

    // Validate budget fields
    if (budgetType !== undefined && budgetType !== null && !['FIAT', 'PERCENT'].includes(String(budgetType))) {
      return NextResponse.json({ error: 'Invalid budgetType' }, { status: 400 })
    }
    const parsedBudget = parseNumber(budget)
    const parsedBudgetPercent = parseNumber(budgetPercent)
    if (parsedBudgetPercent != null && (parsedBudgetPercent < 0 || parsedBudgetPercent > 100)) {
      return NextResponse.json({ error: 'budgetPercent must be between 0 and 100' }, { status: 400 })
    }

    // Validate budget sources
    let parsedBudgetSourceIds: string[] | undefined
    if (budgetSourceIds !== undefined) {
      const parsed = parseObjectIds(budgetSourceIds)
      if (!parsed) {
        return NextResponse.json({ error: 'budgetSourceIds must be an array of budget IDs' }, { status: 400 })
      }
      parsedBudgetSourceIds = parsed
    }

    // Validate initial tasks
    let parsedTasks: NewTaskInput[] | undefined
    if (tasks !== undefined) {
      if (!Array.isArray(tasks)) {
        return NextResponse.json({ error: 'Tasks must be an array' }, { status: 400 })
      }
      parsedTasks = tasks.map((t: unknown) => {
        if (!t || typeof t !== 'object') {
          throw new Error('INVALID_TASK')
        }
        const task = t as Record<string, unknown>
        if (typeof task.name !== 'string' || !task.name.trim()) {
          throw new Error('INVALID_TASK')
        }
        return {
          name: sanitizeText(task.name),
          rrule: typeof task.rrule === 'string' ? task.rrule : null,
          dtstart: typeof task.dtstart === 'string' ? task.dtstart : null,
          times: typeof task.times === 'number' && task.times > 0 ? task.times : null,
          premium: typeof task.premium === 'number' ? task.premium : null,
          premiumType: typeof task.premiumType === 'string' && ['FIAT', 'PERCENT'].includes(task.premiumType) ? task.premiumType : null,
          localeKey: typeof task.localeKey === 'string' ? task.localeKey : null,
          categories: Array.isArray(task.categories) ? task.categories.filter((c): c is string => typeof c === 'string') : [],
          area: typeof task.area === 'string' ? task.area : null,
          visibility: parseVisibility(task.visibility),
          quality: typeof task.quality === 'number' ? task.quality : null,
          redacted: typeof task.redacted === 'boolean' ? task.redacted : false
        }
      }) as NewTaskInput[]
    }

    let categoriesParsed: string[] | undefined
    if (categories !== undefined) {
      if (!Array.isArray(categories) || !categories.every((c) => typeof c === 'string')) {
        return NextResponse.json({ error: 'Categories must be an array of strings' }, { status: 400 })
      }
      categoriesParsed = categories as string[]
    }

    const taskList = await createTaskList({
      userInternalId: user.id,
      role: typeof role === 'string' ? role : null,
      name: sanitizedName,
      visibility: parsedVisibility || undefined,
      categories: categoriesParsed,
      area: typeof area === 'string' ? area : null,
      collaborators: parsedCollaborators,
      budget: parsedBudget ?? null,
      budgetType: typeof budgetType === 'string' ? budgetType : null,
      budgetPercent: parsedBudgetPercent ?? null,
      budgetSourceIds: parsedBudgetSourceIds,
      bio: typeof bio === 'string' ? sanitizeText(bio) : null,
      profilePhoto: typeof profilePhoto === 'string' ? sanitizeText(profilePhoto) : null,
      links: links && typeof links === 'object' ? links : null,
      tasks: parsedTasks
    })

    return NextResponse.json({ taskList })
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_TASK') {
      return NextResponse.json({ error: 'Each task must include a non-empty name' }, { status: 400 })
    }
    console.error('Error in POST /api/v1/tasklists:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
