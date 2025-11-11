import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { loadTranslationsSync, t } from '@/lib/i18n'
import { parseCookies } from '@/lib/localeUtils'
import { getBestLocale } from '@/lib/i18n'
import { recalculateUserBudget } from '@/lib/budgetUtils'
import { calculateTaskEarnings, calculateBudgetConsumption, initializeRemainingBudget, getPerCompleterPrize, getPerCompleterProfit, getProfitPerTask, calculateStashAndProfitDeltas, calculateUpdatedUserValues } from '@/lib/earningsUtils'
import { getWeekNumber } from '@/app/helpers'
import { randomBytes } from 'crypto'
import { Productivity, ListProductivity } from '@/lib/types'

// Helper function to generate a unique MongoDB ObjectId
function generateObjectId(): string {
  // Generate a 24-character hex string (MongoDB ObjectId format)
  return randomBytes(12).toString('hex')
}

// Helper function to ensure all tasks have unique ObjectIds
// When copying from template, always generate new IDs to ensure uniqueness
function ensureUniqueTaskIds(tasks: any[], fromTemplate: boolean = false): any[] {
  return tasks.map((task: any) => ({
    ...task,
    id: fromTemplate ? generateObjectId() : (task.id || generateObjectId()) // Always generate new ID when from template, otherwise only if missing
  }))
}

// Helper function to get user's locale from request
function getUserLocale(request: NextRequest): string {
  const cookieHeader = request.headers.get('cookie') || ''
  const cookies = parseCookies(cookieHeader)

  // First check for user preference cookie
  const userLocale = cookies['dpip_user_locale']
  if (userLocale) {
    return userLocale
  }

  // Fall back to browser locale
  const acceptLanguage = request.headers.get('accept-language') || ''
  return getBestLocale(acceptLanguage)
}

// Helper function to translate template tasks using localeKey
function translateTemplateTasks(tasks: any[], translations: any): any[] {
  return tasks.map((task: any) => {
    if (task.localeKey && translations) {
      const translatedName = t(translations, `actions.${task.localeKey}`)
      return {
        ...task,
        name: translatedName || task.name // fallback to original name if translation not found
      }
    }
    return task
  })
}

export async function GET(request: NextRequest) {
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

    // Build query for TaskLists where the user participates as owner, collaborator, or manager
    const membershipClause = {
      OR: [
        { users: { some: { userId: user.id, role: 'OWNER' } } },
        { users: { some: { userId: user.id, role: 'COLLABORATOR' } } },
        { users: { some: { userId: user.id, role: 'MANAGER' } } }
      ]
    }

    const whereClause: any = role ? { role, ...membershipClause } : membershipClause

    // Ensure default daily/weekly lists exist for the owner
    const ownerUser = await prisma.user.findUnique({ where: { userId } })
    if (ownerUser) {
      const userLocale = getUserLocale(request)
      const translations = loadTranslationsSync(userLocale)

      const ensureDefault = async (r: string) => {
        const existing = await prisma.list.findFirst({ where: { users: { some: { userId: ownerUser.id, role: 'OWNER' } }, role: r } })
        if (!existing) {
          const tpl = await prisma.template.findFirst({ where: { role: r } })

          // Get localized name for the tasklist
          let localizedName: string
          if (r === 'daily.default') {
            localizedName = t(translations, 'common.daily')
          } else if (r === 'weekly.default') {
            localizedName = t(translations, 'common.weekly')
          } else {
            localizedName = 'Default'
          }

          // Translate template tasks if they exist
          let translatedTasks = (tpl?.tasks as any) || []
          if (translatedTasks.length > 0) {
            translatedTasks = translateTemplateTasks(translatedTasks, translations)
            // Ensure all tasks have unique ObjectIds when copying from template
            translatedTasks = ensureUniqueTaskIds(translatedTasks, true)
          }

          await prisma.list.create({
            data: {
              role: r,
              name: localizedName,
              visibility: 'PRIVATE',
              users: [{ userId: ownerUser.id, role: 'OWNER' }],
              templateId: tpl?.id || null,
              templateTasks: translatedTasks,
              tasks: translatedTasks,
              ephemeralTasks: { open: [], closed: [] },
              completedTasks: {}
            } as any
          })
        }
      }
      await ensureDefault('daily.default')
      await ensureDefault('weekly.default')
    }

    const taskLists = await prisma.list?.findMany({
      where: whereClause,
      include: {
        template: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    })

    // Calculate collaborator earnings for each task list
    const taskListsWithEarnings = await Promise.all(taskLists.map(async (taskList) => {
      const collaboratorEarnings: Record<string, number> = {}
      
      // Only calculate if there are collaborators
      const users = (taskList.users as any[]) || []
      const collaborators = users.filter((u: any) => u.role === 'COLLABORATOR' || u.role === 'MANAGER').map((u: any) => u.userId)
      const owners = users.filter((u: any) => u.role === 'OWNER').map((u: any) => u.userId)
      if (collaborators.length > 0) {
        const completedTasks = (taskList.completedTasks as any) || {}
        const allCollaborators = [...owners, ...collaborators]
        
        // Get user profiles to map userId to userName
        const userProfiles = await prisma.user.findMany({
          where: {
            id: { in: allCollaborators }
          },
          include: {
            profiles: true
          }
        })
        
        const userIdToUserName: Record<string, string> = {}
        userProfiles.forEach(u => {
          const profile = Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null
          userIdToUserName[u.id] = profile?.data?.username?.value || u.id
        })
        
        // Calculate profit per task using earningsUtils formula
        const listBudget = taskList.budget
        const listRole = taskList.role
        const totalTasks = (taskList.tasks as any[])?.length || (taskList.templateTasks as any[])?.length || 1
        
        // Calculate profit per task based on cadence
        const profitPerTask = getProfitPerTask(listBudget, totalTasks, listRole)
        
        // Iterate through all completed tasks to sum earnings per user
        for (const year in completedTasks) {
          const yearData = completedTasks[year]
          for (const date in yearData) {
            const dateBucket = yearData[date]
            let tasksForDate: any[] = []
            
            // Support both old structure (array) and new structure (openTasks/closedTasks)
            if (Array.isArray(dateBucket)) {
              tasksForDate = dateBucket
            } else if (dateBucket && (dateBucket.openTasks || dateBucket.closedTasks)) {
              tasksForDate = [
                ...(Array.isArray(dateBucket.openTasks) ? dateBucket.openTasks : []),
                ...(Array.isArray(dateBucket.closedTasks) ? dateBucket.closedTasks : [])
              ]
            }
            
            tasksForDate.forEach((task: any) => {
              if (Array.isArray(task.completers)) {
                task.completers.forEach((completer: any) => {
                  const userId = completer.id
                  const userName = userIdToUserName[userId] || userId
                  
                  // Add profit for this completion
                  if (!collaboratorEarnings[userName]) {
                    collaboratorEarnings[userName] = 0
                  }
                  collaboratorEarnings[userName] += profitPerTask
                })
              }
            })
          }
        }
      }
      
      return {
        ...taskList,
        collaboratorEarnings
      }
    }))

    return NextResponse.json({ taskLists: taskListsWithEarnings })

  } catch (error) {
    console.error('Error fetching task lists:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { role, tasks, templateId, updateTemplate, name, budget: budgetRaw, budgetPercentage, dueDate, create, collaborators } = body
    
    // Parse budget as float, handling both string and number inputs
    const budget = typeof budgetRaw === 'number' 
      ? budgetRaw 
      : (typeof budgetRaw === 'string' && budgetRaw.trim() !== '' 
          ? parseFloat(budgetRaw) 
          : undefined)

    // Find user by userId
    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: { id: true, availableBalance: true, stash: true, equity: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Helper function to get current user balance values
    const getUserBalanceValues = () => {
      const userBalance = typeof user.availableBalance === 'number' 
        ? user.availableBalance 
        : (typeof user.availableBalance === 'string' ? parseFloat(user.availableBalance || '0') : 0)
      const userStash = typeof user.stash === 'number' 
        ? user.stash 
        : (typeof user.stash === 'string' ? parseFloat(user.stash || '0') : 0)
      const userEquity = typeof user.equity === 'number' 
        ? user.equity 
        : (typeof user.equity === 'string' ? parseFloat(user.equity || '0') : 0)
      return { userBalance, userStash, userEquity }
    }

    // Helper function to calculate productivity for a list
    // totalTasks: count from list tasks (all tasks in the list)
    // completedTasks: count from day tasks (only tasks stored in day.tasks that are done)
    const calculateListProductivity = (listId: string, totalTasksFromList: number, dayTasks: any[]): ListProductivity => {
      const totalTasks = totalTasksFromList || 1
      const completedTasks = dayTasks.filter((t: any) => t.status === 'done').length
      const percentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
      return {
        totalTasks,
        completedTasks,
        percentage
      }
    }

    // Helper function to calculate overall progress from productivity object
    const calculateOverallProgress = (productivity: Productivity | null | undefined): number => {
      if (!productivity || typeof productivity !== 'object') return 0
      
      const listIds = Object.keys(productivity)
      if (listIds.length === 0) return 0
      
      const totalPercentage = listIds.reduce((sum, listId) => {
        const listProd = productivity[listId]
        if (listProd && typeof listProd === 'object' && typeof listProd.percentage === 'number') {
          return sum + listProd.percentage
        }
        return sum
      }, 0)
      
      return totalPercentage / listIds.length
    }

    // Helper function to get task key for matching
    const getTaskKey = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')) as string

    // Helper function to update productivity for a list and recalculate overall progress
    // Uses dayTasks (tasks stored in day.tasks) filtered by matching tasks from the list
    const updateProductivityForList = (
      existingProductivity: Productivity | null | undefined,
      listId: string,
      listTasks: any[], // Tasks from the list (for total count and matching)
      dayTasks: any[] // Tasks stored in day.tasks for this day
    ): { productivity: Productivity; progress: number } => {
      // Total tasks count from the list
      const totalTasksFromList = listTasks.length || 1
      
      // Create a set of task keys from the list to match against day tasks
      const listTaskKeys = new Set(
        listTasks.map((t: any) => {
          const key = getTaskKey(t)
          return typeof key === 'string' ? key.toLowerCase() : key
        })
      )
      
      // Filter day tasks to only include those that match tasks from this list
      const tasksForThisList = dayTasks.filter((dayTask: any) => {
        const dayTaskKey = getTaskKey(dayTask)
        const dayTaskKeyLower = typeof dayTaskKey === 'string' ? dayTaskKey.toLowerCase() : dayTaskKey
        return listTaskKeys.has(dayTaskKeyLower)
      })
      
      // Calculate productivity: totalTasks from list, completedTasks from day tasks
      const listProductivity = calculateListProductivity(listId, totalTasksFromList, tasksForThisList)
      const updatedProductivity: Productivity = {
        ...(existingProductivity && typeof existingProductivity === 'object' ? existingProductivity : {}),
        [listId]: listProductivity
      }
      const overallProgress = calculateOverallProgress(updatedProductivity)
      return { productivity: updatedProductivity, progress: overallProgress }
    }

    // Helper function to aggregate completer earnings from taskList collection, filtering by logged-in user
    const aggregateCompleterEarningsFromTaskList = async (taskListId: string, userId: string, year: number, dateISO: string) => {
      try {
        const taskList = await prisma.list.findUnique({ where: { id: taskListId } })
        if (!taskList) return { earnings: 0, prize: 0, profit: 0 }

        const completedTasks = (taskList.completedTasks as any) || {}
        const yearData = completedTasks[year]
        if (!yearData) return { earnings: 0, prize: 0, profit: 0 }

        const dateBucket = yearData[dateISO]
        if (!dateBucket) return { earnings: 0, prize: 0, profit: 0 }

        // Support both old structure (array) and new structure (openTasks/closedTasks)
        let tasksForDate: any[] = []
        if (Array.isArray(dateBucket)) {
          tasksForDate = dateBucket
        } else if (dateBucket.openTasks || dateBucket.closedTasks) {
          tasksForDate = [
            ...(Array.isArray(dateBucket.openTasks) ? dateBucket.openTasks : []),
            ...(Array.isArray(dateBucket.closedTasks) ? dateBucket.closedTasks : [])
          ]
        }

        let totalEarnings = 0
        let totalPrize = 0
        let totalProfit = 0

        // Filter completers by logged-in user and sum their earnings/prize/profit
        for (const task of tasksForDate) {
          if (Array.isArray(task.completers)) {
            for (const completer of task.completers) {
              // Only count completers for the logged-in user
              if (completer.id === userId) {
                const completerEarnings = typeof completer.earnings === 'number' 
                  ? completer.earnings 
                  : (typeof completer.earnings === 'string' ? parseFloat(completer.earnings || '0') : 0)
                const completerPrize = typeof completer.prize === 'number' 
                  ? completer.prize 
                  : (typeof completer.prize === 'string' ? parseFloat(completer.prize || '0') : 0)
                
                totalEarnings += completerEarnings + completerPrize
                totalPrize += completerPrize
                totalProfit += completerEarnings
              }
            }
          }
        }

        return { earnings: totalEarnings, prize: totalPrize, profit: totalProfit }
      } catch (error) {
        console.error('Error aggregating completer earnings from taskList:', error)
        return { earnings: 0, prize: 0, profit: 0 }
      }
    }

    // Get user's locale and translations
    const userLocale = getUserLocale(request)
    const translations = loadTranslationsSync(userLocale)

    // Translate tasks if provided
    let translatedTasks = tasks
    if (Array.isArray(tasks) && tasks.length > 0) {
      translatedTasks = translateTemplateTasks(tasks, translations)
      // Ensure all tasks have unique ObjectIds when copying from template
      if (templateId) {
        translatedTasks = ensureUniqueTaskIds(translatedTasks, true)
      } else {
        // Even if not from template, ensure all tasks have IDs (generate for missing ones)
        translatedTasks = ensureUniqueTaskIds(translatedTasks, false)
      }
    }

    // Get localized name if not provided and creating a default list
    let localizedName = name
    if (!localizedName && role && role.endsWith('.default')) {
      if (role === 'daily.default') {
        localizedName = t(translations, 'common.daily')
      } else if (role === 'weekly.default') {
        localizedName = t(translations, 'common.weekly')
      }
    }

    // Delete a specific TaskList by ID
    if (body.deleteTaskList && body.taskListId) {
      const existing = await prisma.list.findUnique({ where: { id: body.taskListId } })
      if (!existing) return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })
      await prisma.list.delete({ where: { id: body.taskListId } })
      
      // Recalculate user's budget after deleting a list
      await recalculateUserBudget(user.id)
      
      return NextResponse.json({ ok: true })
    }

    // Lightweight path: record completions into completedTasks and Task.completers
    if (body.recordCompletions && body.taskListId && (body.dayActions?.length || body.weekActions?.length || Array.isArray(body.justUncompletedNames))) {
      const taskList = await prisma.list.findUnique({ where: { id: body.taskListId } })
      if (!taskList) {
        return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })
      }

      const incomingTasks: any[] = (body.dayActions?.length ? body.dayActions : body.weekActions) || []
      const blueprintTasks: any[] = Array.isArray(taskList.tasks) ? (taskList.tasks as any[]) : (Array.isArray((taskList as any).templateTasks) ? ((taskList as any).templateTasks as any[]) : [])

      const totalTasks = blueprintTasks.length || incomingTasks.length || 1
      
      // Get user's available balance for earnings calculation
      const userRecord = await prisma.user.findUnique({ where: { id: user.id } })
      
      // Calculate earnings for task completion
      const dateISO = (body.date || new Date().toISOString().split('T')[0]) as string
      const completionDate = new Date(dateISO)
      // Ensure budget is a float (handle both string and number for backward compatibility)
      const taskListBudget = typeof taskList.budget === 'number' 
        ? taskList.budget 
        : (taskList.budget ? parseFloat(String(taskList.budget)) : 0)
      
      const earnings = calculateTaskEarnings({
        listRole: taskList.role,
        budgetPercentage: (taskList as any).budgetPercentage,
        listBudget: taskListBudget != null ? String(taskListBudget) : null,
        userEquity: userRecord?.equity != null ? String(userRecord.equity) : null,
        numTasks: totalTasks,
        date: completionDate
      })
      
      // Calculate prize and earnings per completer based on cadence
      const perCompleterPrize = getPerCompleterPrize(earnings, taskList.role)
      const perCompleterEarnings = getPerCompleterProfit(earnings, taskList.role)


      const allowedKeys = new Set([
        'id', 'name', 'categories', 'area', 'status', 'cadence', 'times', 'count', 'localeKey', 'contacts', 'things', 'favorite', 'isEphemeral', 'createdAt', 'completers'
      ])

      const sanitizeTask = (task: any) => {
        const out: any = {}
        for (const k in task) {
          if (allowedKeys.has(k)) out[k] = task[k]
        }
        return out
      }

      // Extract justCompletedNames and justUncompletedNames early
      const justCompletedNames: string[] = Array.isArray(body.justCompletedNames) ? body.justCompletedNames : []
      const justUncompletedNames: string[] = Array.isArray(body.justUncompletedNames) ? body.justUncompletedNames : []

      // Build completedTasks map with new structure: completedTasks[year][date].openTasks and closedTasks
      const year = Number(dateISO.split('-')[0])
      const priorCompleted = (taskList as any).completedTasks || {}
      const yearBucket = priorCompleted[year] || {}
      const dateBucket = yearBucket[dateISO] || {}
      
      // Support both old structure (array) and new structure (openTasks/closedTasks)
      let openTasks: any[] = []
      let closedTasks: any[] = []
      
      if (Array.isArray(dateBucket)) {
        // Legacy structure: migrate to new structure
        openTasks = dateBucket.filter((t: any) => t.status !== 'done')
        closedTasks = dateBucket.filter((t: any) => t.status === 'done')
      } else if (dateBucket.openTasks || dateBucket.closedTasks) {
        // New structure
        openTasks = Array.isArray(dateBucket.openTasks) ? [...dateBucket.openTasks] : []
        closedTasks = Array.isArray(dateBucket.closedTasks) ? [...dateBucket.closedTasks] : []
      }
      
      // Check if this is the first completion for this date (no openTasks exist yet)
      const isFirstCompletion = openTasks.length === 0 && closedTasks.length === 0 && justCompletedNames.length > 0
      
      // If first completion, copy tasks from taskList.tasks to openTasks
      if (isFirstCompletion) {
        const blueprintTasks: any[] = Array.isArray(taskList.tasks) ? (taskList.tasks as any[]) : (Array.isArray((taskList as any).templateTasks) ? ((taskList as any).templateTasks as any[]) : [])
        openTasks = blueprintTasks.map((t: any) => sanitizeTask({ ...t, count: 0, status: 'open' }))
      }

      // Helpers to match tasks reliably even with localized names
      const getKey = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')) as string
      const byKey: Record<string, any> = {}
      openTasks.forEach((t: any) => {
        const key = getKey(t)
        byKey[key] = t
      })

      // For each incoming (localized) task, merge into completed map
      const nameSet = new Set(justCompletedNames.map((s) => typeof s === 'string' ? s.toLowerCase() : s))

      // Process all incoming tasks to update openTasks
      // First pass: add any new tasks from incomingTasks that don't exist in openTasks
      // This ensures new tasks are always saved to completedTasks, even if not being completed
      for (const incoming of incomingTasks) {
        const key = getKey(incoming)
        if (!key) continue
        const existing = byKey[key]
        
        // If task doesn't exist in openTasks, add it as a new task
        if (!existing) {
          byKey[key] = sanitizeTask({
            ...incoming,
            count: incoming.count || 0,
            status: incoming.status || 'open',
            completers: []
          })
        }
      }
      
      // Second pass: process tasks for completion/uncompletion logic
      for (const incoming of incomingTasks) {
        const key = getKey(incoming)
        if (!key) continue
        const existing = byKey[key]
        if (!existing) continue // Shouldn't happen after first pass, but safety check
        const prevCompletersLen = Array.isArray(existing?.completers) ? existing.completers.length : 0
        
        // Determine new count and delta
        let newCount: number
        let delta: number
        
        if (nameSet.size > 0) {
          // If filtering by justCompletedNames, only increment completers for those tasks
          const nm = typeof incoming?.name === 'string' ? incoming.name.toLowerCase() : ''
          if (!nameSet.has(nm)) {
            // Not in justCompletedNames, but still update the task with latest data
            byKey[key] = sanitizeTask({ ...existing, ...incoming })
            continue
          }
          newCount = prevCompletersLen + 1
          delta = 1
        } else {
          // Process all incoming tasks
          newCount = Number(incoming?.count || (incoming.status === 'done' ? 1 : 0))
          delta = Math.max(0, newCount - prevCompletersLen)
        }
        
        if (delta <= 0) {
          // Update task without incrementing completers
          byKey[key] = sanitizeTask({ ...existing, ...incoming })
          continue
        }

        const baseCompleters = Array.isArray(existing?.completers) ? existing.completers : []
        const appended: any[] = []
        for (let i = 0; i < delta; i++) {
          appended.push({ 
            id: user.id, 
            earnings: perCompleterEarnings, // Store as float
            prize: perCompleterPrize, // Store prize as float
            time: prevCompletersLen + i + 1, 
            completedAt: new Date() 
          })
        }
        const taskRecord = sanitizeTask({
          ...existing,
          ...incoming,
          // Preserve the status from incoming task (may be 'open' for partial completions or 'done' for full)
          status: incoming.status || 'done',
          completers: [...baseCompleters, ...appended],
          count: newCount
        })
        byKey[key] = taskRecord
      }

      // Handle uncompletions: remove last completer for provided task names
      if (justUncompletedNames.length > 0) {
        const unNames = new Set(justUncompletedNames.map((s: string) => (s || '').toLowerCase()))
        
        // Check closedTasks for tasks to reopen
        for (let i = closedTasks.length - 1; i >= 0; i--) {
          const t = closedTasks[i]
          const nm = typeof t?.name === 'string' ? t.name.toLowerCase() : ''
          if (unNames.has(nm)) {
            const comps: any[] = Array.isArray(t?.completers) ? [...t.completers] : []
            if (comps.length > 0) comps.pop()
            // Remove completedOn when reopening task
            const { completedOn, ...taskWithoutCompletedOn } = t
            const updatedTask = { ...taskWithoutCompletedOn, status: 'open', completers: comps, count: comps.length }
            // Move from closedTasks to openTasks
            closedTasks.splice(i, 1)
            const key = getKey(updatedTask)
            if (key) byKey[key] = updatedTask
          }
        }
        
        // Also handle tasks in openTasks
        const values = Object.values(byKey) as any[]
        for (const t of values) {
          const nm = typeof t?.name === 'string' ? t.name.toLowerCase() : ''
          if (!unNames.has(nm)) continue
          const comps: any[] = Array.isArray(t?.completers) ? [...t.completers] : []
          if (comps.length > 0) comps.pop()
          // Remove completedOn when reopening task
          const { completedOn, ...taskWithoutCompletedOn } = t
          const updatedTask = { ...taskWithoutCompletedOn, status: 'open', completers: comps, count: comps.length }
          const k = getKey(updatedTask)
          if (k) byKey[k] = updatedTask
        }
      }

      // Separate openTasks and closedTasks based on status
      const finalOpenTasks: any[] = []
      const finalClosedTasks: any[] = [...closedTasks] // Keep existing closed tasks
      
      // Format date as YYYY-MM-DD for completedOn
      const formatDateForCompletedOn = (d: Date): string => {
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      const completedOnDate = formatDateForCompletedOn(completionDate)
      
      for (const task of Object.values(byKey)) {
        const taskStatus = (task as any).status
        const taskCount = (task as any).count || 0
        const taskTimes = (task as any).times || 1
        
        // Task is done if status is 'done' or count >= times
        if (taskStatus === 'done' || taskCount >= taskTimes) {
          // Check if already in closedTasks
          const key = getKey(task as any)
          const alreadyClosed = finalClosedTasks.some((t: any) => getKey(t) === key)
          if (!alreadyClosed) {
            // Add completedOn when task is first closed
            finalClosedTasks.push({ ...task as any, completedOn: completedOnDate })
          } else {
            // Update existing closed task, preserve completedOn if it exists, otherwise set it
            const index = finalClosedTasks.findIndex((t: any) => getKey(t) === key)
            if (index >= 0) {
              const existingTask = finalClosedTasks[index]
              finalClosedTasks[index] = { 
                ...task as any, 
                completedOn: existingTask.completedOn || completedOnDate 
              }
            }
          }
        } else {
          finalOpenTasks.push(task as any)
        }
      }

      // Save new structure
      const nextCompleted = {
        ...priorCompleted,
        [year]: { 
          ...yearBucket, 
          [dateISO]: {
            openTasks: finalOpenTasks,
            closedTasks: finalClosedTasks
          }
        }
      }

      // Don't update taskList.tasks - all updates go to completedTasks[year][date].openTasks/closedTasks

      // Update status in ephemeral tasks to keep them in sync
      let updatedEphemeralTasks = (taskList as any).ephemeralTasks || { open: [], closed: [] }
      let ephemeralOpen = Array.isArray(updatedEphemeralTasks.open) ? updatedEphemeralTasks.open : []
      let ephemeralClosed = Array.isArray(updatedEphemeralTasks.closed) ? updatedEphemeralTasks.closed : []

      ephemeralOpen = ephemeralOpen.map((task: any) => {
        const key = getKey(task)
        const incomingTask = incomingTasks.find((t: any) => getKey(t) === key)
        if (incomingTask) {
          const updated = { ...task }
          if (incomingTask.status) updated.status = incomingTask.status
          if (incomingTask.count !== undefined) updated.count = incomingTask.count
          if (incomingTask.status) updated.status = incomingTask.status
          return updated
        }
        return task
      })

      ephemeralClosed = ephemeralClosed.map((task: any) => {
        const key = getKey(task)
        const incomingTask = incomingTasks.find((t: any) => getKey(t) === key)
        if (incomingTask) {
          const updated = { ...task }
          if (incomingTask.status) updated.status = incomingTask.status
          if (incomingTask.count !== undefined) updated.count = incomingTask.count
          if (incomingTask.status) updated.status = incomingTask.status
          return updated
        }
        return task
      })

      updatedEphemeralTasks = { open: ephemeralOpen, closed: ephemeralClosed }

      // Calculate budget consumption
      const numCompletedInThisCall = justCompletedNames.length
      let newRemainingBudget = (taskList as any).remainingBudget
      if (numCompletedInThisCall > 0) {
        // Initialize remainingBudget if not set
        // Ensure budget is a float (handle both string and number for backward compatibility)
        const taskListBudget = typeof taskList.budget === 'number' 
          ? taskList.budget 
          : (taskList.budget ? parseFloat(String(taskList.budget)) : 0)
        
        newRemainingBudget = initializeRemainingBudget((taskList as any).remainingBudget, taskListBudget != null ? String(taskListBudget) : null)
        // Calculate new remaining budget
        newRemainingBudget = calculateBudgetConsumption(newRemainingBudget, taskListBudget != null ? String(taskListBudget) : null, totalTasks)
      }

      const saved = await prisma.list.update({
        where: { id: taskList.id },
        data: ({ 
          completedTasks: nextCompleted,
          ephemeralTasks: updatedEphemeralTasks,
          remainingBudget: newRemainingBudget
        } as any),
        include: { template: true }
      })

      // Entries logic removed - earnings now tracked in Day model
      if (userRecord) {
        // Calculate stash and profit deltas from task completions (without entries)
        let stashDelta = 0  // Prize only
        let totalProfitDelta = 0  // Profit only

        // Calculate stash and profit deltas from completed tasks (without entries)
        if (justCompletedNames.length > 0 || justUncompletedNames.length > 0) {
          // Calculate earnings directly from completedTasks without storing in entries
          const rolePrefix = taskList.role?.split('.')[0] || ''
          const isDailyRole = rolePrefix === 'daily'
          const isWeeklyRole = rolePrefix === 'weekly'
          const isOneOffRole = rolePrefix === 'one-off' || rolePrefix === 'oneoff'
          
          // Helper to get week number
          const getWeekNumber = (date: Date): number => {
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
            const dayNum = d.getUTCDay() || 7
            d.setUTCDate(d.getUTCDate() + 4 - dayNum)
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
            return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
          }
          
          // Calculate earnings directly from completedTasks (entries removed)
          if (justCompletedNames.length > 0) {
            // Calculate earnings for newly completed tasks
            if (isDailyRole) {
              const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateISO)
              const deltas = calculateStashAndProfitDeltas(aggregated.prize, aggregated.profit, true)
              stashDelta += deltas.stashDelta
              totalProfitDelta += deltas.profitDelta
            } else if (isWeeklyRole) {
              const weekStart = new Date(completionDate)
              weekStart.setDate(weekStart.getDate() - weekStart.getDay())
              const weekEnd = new Date(weekStart)
              weekEnd.setDate(weekEnd.getDate() + 6)
              
              let totalPrize = 0
              let totalProfit = 0
              
              for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0]
                const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateStr)
                totalPrize += aggregated.prize
                totalProfit += aggregated.profit
              }
              
              const deltas = calculateStashAndProfitDeltas(totalPrize, totalProfit, true)
              stashDelta += deltas.stashDelta
              totalProfitDelta += deltas.profitDelta
            } else if (isOneOffRole) {
              const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateISO)
              const deltas = calculateStashAndProfitDeltas(aggregated.prize, aggregated.profit, true)
              stashDelta += deltas.stashDelta
              totalProfitDelta += deltas.profitDelta
            }
          }
          
          if (justUncompletedNames.length > 0) {
            // Calculate negative deltas for uncompleted tasks
            if (isDailyRole) {
              const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateISO)
              const deltas = calculateStashAndProfitDeltas(-aggregated.prize, -aggregated.profit, false)
              stashDelta += deltas.stashDelta
              totalProfitDelta += deltas.profitDelta
            } else if (isWeeklyRole) {
              const weekStart = new Date(completionDate)
              weekStart.setDate(weekStart.getDate() - weekStart.getDay())
              const weekEnd = new Date(weekStart)
              weekEnd.setDate(weekEnd.getDate() + 6)
              
              let totalPrize = 0
              let totalProfit = 0
              
              for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0]
                const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateStr)
                totalPrize += aggregated.prize
                totalProfit += aggregated.profit
              }
              
              const deltas = calculateStashAndProfitDeltas(-totalPrize, -totalProfit, false)
              stashDelta += deltas.stashDelta
              totalProfitDelta += deltas.profitDelta
            } else if (isOneOffRole) {
              const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateISO)
              const deltas = calculateStashAndProfitDeltas(-aggregated.prize, -aggregated.profit, false)
              stashDelta += deltas.stashDelta
              totalProfitDelta += deltas.profitDelta
            }
          }
          
          // Update stash and profit if there are any changes
          if (stashDelta !== 0 || totalProfitDelta !== 0) {
            // Get current values
            const currentStash = typeof userRecord.stash === 'number' 
              ? userRecord.stash 
              : (typeof userRecord.stash === 'string' ? parseFloat(userRecord.stash || '0') : 0)
            const currentProfit = typeof (userRecord as any).profit === 'number'
              ? (userRecord as any).profit
              : (typeof (userRecord as any).profit === 'string' ? parseFloat((userRecord as any).profit || '0') : 0)
            const availableBalance = typeof userRecord.availableBalance === 'number' 
              ? userRecord.availableBalance 
              : parseFloat(String(userRecord.availableBalance || '0'))
            
            // Calculate updated values using utility function (ensures all values >= 0)
            const updatedValues = calculateUpdatedUserValues({
              currentStash,
              currentProfit,
              currentAvailableBalance: availableBalance,
              stashDelta,
              profitDelta: totalProfitDelta
            })
            
            await prisma.user.update({
              where: { id: userRecord.id },
              data: { 
                stash: updatedValues.newStash as number,
                profit: updatedValues.newProfit as number,
                equity: updatedValues.newEquity as number,
              } as any
            })
          }
        }
      }

      // Update Day entry: remove uncompleted tasks, append/update completed tasks
      // First, remove tasks that were uncompleted (they should have status "open" now)
      if (justUncompletedNames.length > 0 && dateISO) {
        try {
          const existingDay = await prisma.day.findFirst({
            where: {
              userId: user.id,
              date: dateISO
            }
          })

          if (existingDay) {
            const existingTasks = Array.isArray(existingDay.tasks) ? existingDay.tasks : []
            const unNames = new Set(justUncompletedNames.map((s: string) => (s || '').toLowerCase()))
            
            // Remove uncompleted tasks from day.tasks using taskId (id, localeKey, or name)
            const tasksToRemove = existingTasks.filter((t: any) => {
              const taskKey = getTaskKey(t)
              const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey
              // Match by taskId (id or localeKey) first, then fallback to name
              if (t?.id || t?.localeKey) {
                // If task has id or localeKey, match by those
                return unNames.has(taskKeyLower)
              } else {
                // Fallback to name matching
                const taskName = typeof t?.name === 'string' ? t.name.toLowerCase() : ''
                return unNames.has(taskName)
              }
            })
            const updatedTasks = existingTasks.filter((t: any) => {
              const taskKey = getTaskKey(t)
              const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey
              // Match by taskId (id or localeKey) first, then fallback to name
              if (t?.id || t?.localeKey) {
                // If task has id or localeKey, match by those
                return !unNames.has(taskKeyLower)
              } else {
                // Fallback to name matching
                const taskName = typeof t?.name === 'string' ? t.name.toLowerCase() : ''
                return !unNames.has(taskName)
              }
            })

            // Calculate week, month, quarter, semester from date
            const dateObj = new Date(dateISO)
            const [_, weekNumberResult] = getWeekNumber(dateObj)
            const weekNumber = typeof weekNumberResult === 'number' ? weekNumberResult : Number(weekNumberResult) || 1
            const month = dateObj.getMonth() + 1
            const quarter = Math.ceil(month / 3)
            const semester = month <= 6 ? 1 : 2

            // Remove all ticker entries for uncompleted tasks
            const existingTickers = Array.isArray(existingDay.ticker) ? existingDay.ticker : []
            // Get task IDs for uncompleted tasks from the tasks that are being removed
            const uncompletedTaskIds = new Set(
              tasksToRemove
                .map((t: any) => t.id || t.localeKey || t.name)
                .filter(Boolean)
            )
            // Remove ticker entries matching uncompleted task IDs
            const updatedTickers = existingTickers.filter((t: any) => {
              // If ticker has taskId, only remove if it matches an uncompleted task
              if (t.taskId) {
                return !uncompletedTaskIds.has(t.taskId)
              }
              // If no taskId in ticker, remove all entries for this listId (backward compatibility)
              return t.listId !== taskList.id
            })

            // Update productivity for this list based on tasks in day.tasks
            const existingProductivity = (existingDay.productivity as Productivity | null) || null
            const { productivity: updatedProductivity, progress: newProgress } = updateProductivityForList(
              existingProductivity,
              taskList.id,
              taskList.tasks as any[], // List tasks for matching
              updatedTasks // Day tasks to count from
            )

            // Get current user balance values
            const { userBalance, userStash, userEquity } = getUserBalanceValues()
            
            await prisma.day.update({
              where: { id: existingDay.id },
              data: {
                tasks: updatedTasks as any,
                ticker: updatedTickers as any,
                productivity: updatedProductivity as any,
                progress: newProgress,
                balance: userBalance,
                stash: userStash,
                equity: userEquity,
                week: weekNumber,
                month: month,
                quarter: quarter,
                semester: semester
              }
            })
          }
        } catch (dayError) {
          // Log error but don't fail the request if Day update fails
          console.error('Error removing uncompleted tasks from Day entry:', dayError)
        }
      }

      // Filter to only include tasks whose status is not "open" or "ignored"
      const tasksToCopy = incomingTasks.filter((task: any) => {
        const status = task.status || 'open'
        return status !== 'open' && 
               status !== 'ignored'
      })
      
      if (tasksToCopy.length > 0 && dateISO) {
        try {
          // Find or create the day entry (ensure only one day per user per date)
          const existingDay = await prisma.day.findFirst({
            where: {
              userId: user.id,
              date: dateISO
            }
          })

          // Calculate week, month, quarter, semester from date
          const dateObj = new Date(dateISO)
          const [_, weekNumberResult] = getWeekNumber(dateObj)
          const weekNumber = typeof weekNumberResult === 'number' ? weekNumberResult : Number(weekNumberResult) || 1
          const month = dateObj.getMonth() + 1
          const quarter = Math.ceil(month / 3)
          const semester = month <= 6 ? 1 : 2

          // Helper to match tasks reliably
          const getTaskKey = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')) as string

          if (existingDay) {
            // Update existing day - append or update tasks in tasks array
            const existingTasks = Array.isArray(existingDay.tasks) ? existingDay.tasks : []
            const updatedTasks = [...existingTasks]

            // For each task to copy, update or append to day.tasks
            tasksToCopy.forEach((incomingTask: any) => {
              const taskKey = getTaskKey(incomingTask)
              const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey
              
              const taskIndex = updatedTasks.findIndex((t: any) => {
                const key = getTaskKey(t)
                return key === taskKeyLower || key === taskKey
              })

              // Build the task object for day.tasks
              // Use status field
              const status = incomingTask.status || 'open'
              const taskForDay: any = {
                id: incomingTask.id || undefined,
                name: incomingTask.name,
                categories: incomingTask.categories || [],
                area: incomingTask.area || 'self',
                status: status,
                cadence: incomingTask.cadence || 'daily',
                times: incomingTask.times || 1,
                count: incomingTask.count || 0,
                localeKey: incomingTask.localeKey || undefined,
                persons: incomingTask.persons || [],
                things: incomingTask.things || [],
                events: incomingTask.events || [],
                notes: incomingTask.notes || [],
                documents: incomingTask.documents || [],
                favorite: incomingTask.favorite || false,
                isEphemeral: incomingTask.isEphemeral || false,
                createdAt: incomingTask.createdAt || undefined,
                completedOn: incomingTask.completedOn || undefined,
                completers: incomingTask.completers || [],
                dueDate: incomingTask.dueDate || undefined,
                budget: incomingTask.budget || undefined,
                visibility: incomingTask.visibility || undefined,
                quality: incomingTask.quality || undefined
              }

              if (taskIndex >= 0) {
                // Update existing task
                updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], ...taskForDay }
              } else {
                // Append new task
                updatedTasks.push(taskForDay)
              }
            })

            // Get existing ticker array or create new one
            const existingTickers = Array.isArray(existingDay.ticker) ? existingDay.ticker : []
            
            // Only add ticker entries for tasks with status "done"
            const doneTasks = tasksToCopy.filter((task: any) => {
              const status = task.status || 'open'
              return status === 'done'
            })
            
            // Update productivity for this list based on tasks in day.tasks
            const existingProductivity = (existingDay.productivity as Productivity | null) || null
            const { productivity: updatedProductivity, progress: newProgress } = updateProductivityForList(
              existingProductivity,
              taskList.id,
              taskList.tasks as any[], // List tasks for matching
              updatedTasks // Day tasks to count from
            )
            
            if (doneTasks.length > 0) {
              // Calculate profit and prize from task completions for this date
              const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateISO)
              
              // Push new ticker entries for each done task, ensuring unique taskIds
              const newTickers = doneTasks.map((incomingTask: any) => {
                const taskId = incomingTask.id || incomingTask.localeKey || incomingTask.name || undefined
                return {
                  listId: taskList.id,
                  taskId: taskId,
                  profit: aggregated.profit || 0,
                  prize: aggregated.prize || 0
                }
              })
              
              // Remove existing ticker entries with the same taskIds to ensure uniqueness
              const newTaskIds = new Set(newTickers.map((t: any) => t.taskId).filter(Boolean))
              const filteredTickers = existingTickers.filter((t: any) => !t.taskId || !newTaskIds.has(t.taskId))
              const updatedTickers = [...filteredTickers, ...newTickers]
              
              // Get current user balance values
              const { userBalance, userStash, userEquity } = getUserBalanceValues()
              
              await prisma.day.update({
                where: { id: existingDay.id },
                data: {
                  tasks: updatedTasks as any,
                  ticker: updatedTickers as any,
                  productivity: updatedProductivity as any,
                  progress: newProgress,
                  balance: userBalance,
                  stash: userStash,
                  equity: userEquity,
                  week: weekNumber,
                  month: month,
                  quarter: quarter,
                  semester: semester
                }
              })
            } else {
              // No done tasks, but still update productivity if any tasks were added/updated
              // Update productivity for this list based on tasks in day.tasks
              const existingProductivity = (existingDay.productivity as Productivity | null) || null
              const { productivity: updatedProductivity, progress: newProgress } = updateProductivityForList(
                existingProductivity,
                taskList.id,
                taskList.tasks as any[], // List tasks for matching
                updatedTasks // Day tasks to count from
              )
              
              // Get current user balance values
              const { userBalance, userStash, userEquity } = getUserBalanceValues()
              
              await prisma.day.update({
                where: { id: existingDay.id },
                data: {
                  tasks: updatedTasks as any,
                  productivity: updatedProductivity as any,
                  progress: newProgress,
                  balance: userBalance,
                  stash: userStash,
                  equity: userEquity,
                  week: weekNumber,
                  month: month,
                  quarter: quarter,
                  semester: semester
                }
              })
            }
          } else {
            // Create new day with the tasks to copy
            // Use status field
            const tasksForDay = tasksToCopy.map((incomingTask: any) => {
              const status = incomingTask.status || 'open'
              return {
                id: incomingTask.id || undefined,
                name: incomingTask.name,
                categories: incomingTask.categories || [],
                area: incomingTask.area || 'self',
                status: status,
                cadence: incomingTask.cadence || 'daily',
                times: incomingTask.times || 1,
                count: incomingTask.count || 0,
                localeKey: incomingTask.localeKey || undefined,
                persons: incomingTask.persons || [],
                things: incomingTask.things || [],
                events: incomingTask.events || [],
                notes: incomingTask.notes || [],
                documents: incomingTask.documents || [],
                favorite: incomingTask.favorite || false,
                isEphemeral: incomingTask.isEphemeral || false,
                createdAt: incomingTask.createdAt || undefined,
                completedOn: incomingTask.completedOn || undefined,
                completers: incomingTask.completers || [],
                dueDate: incomingTask.dueDate || undefined,
                budget: incomingTask.budget || undefined,
                visibility: incomingTask.visibility || undefined,
                quality: incomingTask.quality || undefined
              }
            })

            // Only add ticker entries for tasks with status "done"
            const doneTasks = tasksForDay.filter((task: any) => task.status === 'done')
            let ticker: any[] = []
            
            // Calculate productivity for this list based on tasks in day.tasks
            const { productivity: newProductivity, progress: newProgress } = updateProductivityForList(
              null,
              taskList.id,
              taskList.tasks as any[], // List tasks for matching
              tasksForDay // Day tasks to count from
            )
            
            if (doneTasks.length > 0) {
              // Calculate profit and prize from task completions for this date
              const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateISO)
              
              // Create ticker array with profit and prize for each done task, ensuring unique taskIds
              const tickerEntries = doneTasks.map((task: any) => {
                const taskId = task.id || task.localeKey || task.name || undefined
                return {
                  listId: taskList.id,
                  taskId: taskId,
                  profit: aggregated.profit || 0,
                  prize: aggregated.prize || 0
                }
              })
              
              // Ensure unique taskIds (remove duplicates, keeping the last one)
              const taskIdMap = new Map()
              tickerEntries.forEach((entry: any) => {
                if (entry.taskId) {
                  taskIdMap.set(entry.taskId, entry)
                } else {
                  // If no taskId, keep it (shouldn't happen for done tasks, but for safety)
                  taskIdMap.set(`no-id-${taskIdMap.size}`, entry)
                }
              })
              ticker = Array.from(taskIdMap.values())
            }

            // Get user's availableBalance, stash, and equity for new day
            const userBalance = typeof user.availableBalance === 'number' 
              ? user.availableBalance 
              : (typeof user.availableBalance === 'string' ? parseFloat(user.availableBalance || '0') : 0)
            const userStash = typeof user.stash === 'number' 
              ? user.stash 
              : (typeof user.stash === 'string' ? parseFloat(user.stash || '0') : 0)
            const userEquity = typeof user.equity === 'number' 
              ? user.equity 
              : (typeof user.equity === 'string' ? parseFloat(user.equity || '0') : 0)
            
            await prisma.day.create({
              data: {
                userId: user.id,
                date: dateISO,
                tasks: tasksForDay as any,
                ticker: ticker as any,
                productivity: newProductivity as any,
                progress: newProgress,
                balance: userBalance,
                stash: userStash,
                equity: userEquity,
                week: weekNumber,
                month: month,
                quarter: quarter,
                semester: semester
              }
            })
          }
        } catch (dayError) {
          // Log error but don't fail the request if Day update fails
          console.error('Error updating Day entry:', dayError)
        }
      }

      return NextResponse.json({ taskList: saved, earnings })
    }

    // Ephemeral tasks operations scoped to a task list
    if (body.ephemeralTasks && body.taskListId) {
      const taskList = await prisma.list.findUnique({ where: { id: body.taskListId } })
      if (!taskList) return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })

      const current = (taskList as any).ephemeralTasks || { open: [], closed: [] }
      let open = Array.isArray(current.open) ? current.open : []
      let closed = Array.isArray(current.closed) ? current.closed : []

      if (body.ephemeralTasks.add) {
        const t = body.ephemeralTasks.add
        const withId = { id: t.id || `ephemeral_${Date.now()}_${Math.random().toString(36).slice(2,9)}`, name: t.name, status: t.status || 'open', area: t.area || 'self', categories: t.categories || ['custom'], cadence: t.cadence || 'ephemeral', times: t.times || 1, count: t.count || 0, contacts: t.contacts || [], things: t.things || [], favorite: !!t.favorite, isEphemeral: true, createdAt: new Date().toISOString() }
        open = [withId, ...open]
      }

      // Support both single and batch close operations
      if (body.ephemeralTasks.close) {
        const closeOps = Array.isArray(body.ephemeralTasks.close) ? body.ephemeralTasks.close : [body.ephemeralTasks.close]
        // Format date as YYYY-MM-DD for completedOn
        const formatDateForCompletedOn = (d: Date): string => {
          const year = d.getFullYear()
          const month = String(d.getMonth() + 1).padStart(2, '0')
          const day = String(d.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        }
        const completedOnDate = formatDateForCompletedOn(new Date())
        closeOps.forEach((closeOp: any) => {
          const id = closeOp.id
          const count = closeOp.count
          const item = open.find((x: any) => x.id === id)
          open = open.filter((x: any) => x.id !== id)
          if (item) {
            closed = [ 
              { 
                ...item, 
                status: 'done', 
                count: count || item.count, 
                completedAt: new Date().toISOString(),
                completedOn: completedOnDate
              }, 
              ...closed 
            ]
          }
        })
      }

      // Support both single and batch update operations
      if (body.ephemeralTasks.update) {
        const updateOps = Array.isArray(body.ephemeralTasks.update) ? body.ephemeralTasks.update : [body.ephemeralTasks.update]
        updateOps.forEach((updateOp: any) => {
          const { id, count, status } = updateOp
          open = open.map((x: any) => {
            if (x.id === id) {
              const updated = { ...x }
              if (count !== undefined) updated.count = count
              if (status) updated.status = status
              return updated
            }
            return x
          })
        })
      }

      // Support both single and batch reopen operations (move from closed back to open)
      if (body.ephemeralTasks.reopen) {
        const reopenOps = Array.isArray(body.ephemeralTasks.reopen) ? body.ephemeralTasks.reopen : [body.ephemeralTasks.reopen]
        reopenOps.forEach((reopenOp: any) => {
          const id = reopenOp.id
          const count = reopenOp.count
          const item = closed.find((x: any) => x.id === id)
          closed = closed.filter((x: any) => x.id !== id)
          if (item) {
            // Remove completedAt and completedOn, and reset status when reopening
            const { completedAt, completedOn, ...taskWithoutCompletedFields } = item
            open = [{ ...taskWithoutCompletedFields, status: 'open', count: count !== undefined ? count : (item.count || 0) }, ...open]
          }
        })
      }

      const saved = await prisma.list.update({
        where: { id: taskList.id },
        data: ({ ephemeralTasks: { open, closed } } as any)
      })

      return NextResponse.json({ taskList: saved })
    }

    // Update task status in completedTasks[year][date].openTasks/closedTasks (not taskList.tasks)
    if (body.updateTaskStatus && body.taskListId) {
      const taskListToUpdate = await prisma.list.findUnique({ where: { id: body.taskListId } })
      if (!taskListToUpdate) return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })

      const taskKey = body.taskKey // id, localeKey, or name
      const newStatus = body.status || body.taskStatus // Support both for backward compatibility
      const dateISO = body.date || new Date().toISOString().split('T')[0] // Use provided date or today

      // Helper to match tasks reliably
      const getKey = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')) as string
      const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey

      // Get task from templateTasks or tasks to use as base
      let baseTask: any = null
      const tasks = Array.isArray(taskListToUpdate.tasks) 
        ? taskListToUpdate.tasks 
        : (Array.isArray((taskListToUpdate as any).templateTasks) ? (taskListToUpdate as any).templateTasks : [])
      
      baseTask = tasks.find((task: any) => {
        const key = getKey(task)
        return key === taskKeyLower || key === taskKey
      })

      // If not found in tasks, check templateTasks
      if (!baseTask) {
        const templateTasks = Array.isArray((taskListToUpdate as any).templateTasks) ? (taskListToUpdate as any).templateTasks : []
        baseTask = templateTasks.find((task: any) => {
          const key = getKey(task)
          return key === taskKeyLower || key === taskKey
        })
      }

      // Also check and update ephemeral tasks
      let ephemeralTasks = (taskListToUpdate as any).ephemeralTasks || { open: [], closed: [] }
      let open = Array.isArray(ephemeralTasks.open) ? ephemeralTasks.open : []
      let closed = Array.isArray(ephemeralTasks.closed) ? ephemeralTasks.closed : []

      // Update status in open ephemeral tasks
      open = open.map((task: any) => {
        const key = getKey(task)
        if (key === taskKeyLower || key === taskKey) {
          if (!baseTask) baseTask = { ...task }
          return { ...task, status: newStatus }
        }
        return task
      })

      // Also update status in closed ephemeral tasks
      closed = closed.map((task: any) => {
        const key = getKey(task)
        if (key === taskKeyLower || key === taskKey) {
          if (!baseTask) baseTask = { ...task }
          return { ...task, status: newStatus }
        }
        return task
      })

      ephemeralTasks = { open, closed }

      // Update task in completedTasks[year][date].openTasks/closedTasks
      let completedTasks = (taskListToUpdate as any).completedTasks || {}
      const year = Number(dateISO.split('-')[0])
      const yearBucket = completedTasks[year] || {}
      const dateBucket = yearBucket[dateISO] || {}
      
      // Support both old structure (array) and new structure (openTasks/closedTasks)
      let openTasks: any[] = []
      let closedTasks: any[] = []
      
      if (Array.isArray(dateBucket)) {
        // Legacy structure: migrate to new structure
        openTasks = dateBucket.filter((t: any) => t.status !== 'done')
        closedTasks = dateBucket.filter((t: any) => t.status === 'done')
      } else if (dateBucket.openTasks || dateBucket.closedTasks) {
        // New structure
        openTasks = Array.isArray(dateBucket.openTasks) ? [...dateBucket.openTasks] : []
        closedTasks = Array.isArray(dateBucket.closedTasks) ? [...dateBucket.closedTasks] : []
      } else if (baseTask) {
        // First time - initialize from taskListToUpdate.tasks
        const blueprintTasks: any[] = Array.isArray(taskListToUpdate.tasks) ? (taskListToUpdate.tasks as any[]) : (Array.isArray((taskListToUpdate as any).templateTasks) ? ((taskListToUpdate as any).templateTasks as any[]) : [])
        openTasks = blueprintTasks.map((t: any) => ({ ...t, count: 0, status: 'open' }))
      }
      
      if (baseTask) {
        const updatedTask = { ...baseTask, status: newStatus }
        
        // Find task in openTasks or closedTasks
        const openIndex = openTasks.findIndex((t: any) => {
          const key = getKey(t)
          return key === taskKeyLower || key === taskKey
        })
        const closedIndex = closedTasks.findIndex((t: any) => {
          const key = getKey(t)
          return key === taskKeyLower || key === taskKey
        })
        
        if (openIndex >= 0) {
          // Update in openTasks
          openTasks[openIndex] = { ...openTasks[openIndex], ...updatedTask, status: newStatus }
        } else if (closedIndex >= 0) {
          // Update in closedTasks
          closedTasks[closedIndex] = { ...closedTasks[closedIndex], ...updatedTask, status: newStatus }
        } else {
          // Add to openTasks if not found
          openTasks.push(updatedTask)
        }
        
        yearBucket[dateISO] = {
          openTasks: openTasks,
          closedTasks: closedTasks
        }
        completedTasks[year] = yearBucket
      }

      const updated = await prisma.list.update({
        where: { id: taskListToUpdate.id },
        data: {
          ephemeralTasks: ephemeralTasks,
          completedTasks: completedTasks,
          updatedAt: new Date()
        } as any,
        include: { template: true }
      })

      // Update Day entry to append/update or remove the task in day.tasks when status changes
      if (baseTask && dateISO) {
        try {
          // Find or create the day entry (ensure only one day per user per date)
          const existingDay = await prisma.day.findFirst({
            where: {
              userId: user.id,
              date: dateISO
            }
          })

          // If status is "open" or "ignored", remove the task from day.tasks and remove ticker entries
          if (newStatus === 'open' || newStatus === 'ignored') {
            if (existingDay) {
              const existingTasks = Array.isArray(existingDay.tasks) ? existingDay.tasks : []
              
              // Find if task exists in day.tasks (by id, localeKey, or name)
              const getTaskKey = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')) as string
              const taskKey = getTaskKey(baseTask)
              const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey
              
              // Find the task being removed to check if it was "done"
              const taskBeingRemoved = existingTasks.find((t: any) => {
                const key = getTaskKey(t)
                return key === taskKeyLower || key === taskKey
              })
              
              // Remove task from day.tasks
              const updatedTasks = existingTasks.filter((t: any) => {
                const key = getTaskKey(t)
                return key !== taskKeyLower && key !== taskKey
              })

              // Calculate week, month, quarter, semester from date
              const dateObj = new Date(dateISO)
              const [_, weekNumberResult] = getWeekNumber(dateObj)
              const weekNumber = typeof weekNumberResult === 'number' ? weekNumberResult : Number(weekNumberResult) || 1
              const month = dateObj.getMonth() + 1
              const quarter = Math.ceil(month / 3)
              const semester = month <= 6 ? 1 : 2

              // Remove all ticker entries for this taskId
              const existingTickers = Array.isArray(existingDay.ticker) ? existingDay.ticker : []
              const taskId = baseTask.id || baseTask.localeKey || baseTask.name || undefined
              const updatedTickers = existingTickers.filter((t: any) => {
                // Remove if taskId matches, or if no taskId in ticker and we're removing by listId (backward compatibility)
                if (taskId) {
                  return t.taskId !== taskId
                }
                // If no taskId, remove all entries for this listId (backward compatibility)
                return t.listId !== taskListToUpdate.id
              })

              // Update productivity for this list based on tasks in day.tasks
              const existingProductivity = (existingDay.productivity as Productivity | null) || null
              const { productivity: updatedProductivity, progress: newProgress } = updateProductivityForList(
                existingProductivity,
                taskListToUpdate.id,
                taskListToUpdate.tasks as any[], // List tasks for matching
                updatedTasks // Day tasks to count from
              )

              // Get current user balance values
              const { userBalance, userStash, userEquity } = getUserBalanceValues()

              await prisma.day.update({
                where: { id: existingDay.id },
                data: {
                  tasks: updatedTasks as any,
                  ticker: updatedTickers as any,
                  productivity: updatedProductivity as any,
                  progress: newProgress,
                  balance: userBalance,
                  stash: userStash,
                  equity: userEquity,
                  week: weekNumber,
                  month: month,
                  quarter: quarter,
                  semester: semester
                }
              })
            }
            // Exit early if we're removing the task
            return NextResponse.json({ taskList: updated })
          }

          // Only copy tasks whose new status is not "open" or "ignored"
          if (newStatus && newStatus !== 'open' && newStatus !== 'ignored') {
            // Build the task object to add/update in day.tasks
            // Get the updated task status from openTasks or closedTasks to ensure we have the latest status
            const updatedTaskInList = openTasks.find((t: any) => {
              const key = getKey(t)
              return key === taskKeyLower || key === taskKey
            }) || closedTasks.find((t: any) => {
              const key = getKey(t)
              return key === taskKeyLower || key === taskKey
            })
            
            // Use the status from the updated task in the list, or fall back to newStatus
            const currentStatus = updatedTaskInList?.status || newStatus || 'open'
            
            const taskForDay: any = {
              id: baseTask.id || undefined,
              name: baseTask.name,
              categories: baseTask.categories || [],
              area: baseTask.area || 'self',
              status: currentStatus,
              cadence: baseTask.cadence || 'daily',
              times: baseTask.times || 1,
              count: updatedTaskInList?.count ?? baseTask.count ?? 0,
              localeKey: baseTask.localeKey || undefined,
              persons: baseTask.persons || [],
              things: baseTask.things || [],
              events: baseTask.events || [],
              notes: baseTask.notes || [],
              documents: baseTask.documents || [],
              favorite: baseTask.favorite || false,
              isEphemeral: baseTask.isEphemeral || false,
              createdAt: baseTask.createdAt || undefined,
              completedOn: updatedTaskInList?.completedOn || baseTask.completedOn || undefined,
              completers: updatedTaskInList?.completers || baseTask.completers || [],
              dueDate: baseTask.dueDate || undefined,
              budget: baseTask.budget || undefined,
              visibility: baseTask.visibility || undefined,
              quality: baseTask.quality || undefined
            }

            // Calculate week, month, quarter, semester from date
            const dateObj = new Date(dateISO)
            const [_, weekNumberResult] = getWeekNumber(dateObj)
            const weekNumber = typeof weekNumberResult === 'number' ? weekNumberResult : Number(weekNumberResult) || 1
            const month = dateObj.getMonth() + 1
            const quarter = Math.ceil(month / 3)
            const semester = month <= 6 ? 1 : 2

            if (existingDay) {
              // Update existing day - append or update task in tasks array
              const existingTasks = Array.isArray(existingDay.tasks) ? existingDay.tasks : []
              
              // Find if task already exists in day.tasks (by id, localeKey, or name)
              const getTaskKey = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')) as string
              const taskKey = getTaskKey(taskForDay)
              const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey
              
              const taskIndex = existingTasks.findIndex((t: any) => {
                const key = getTaskKey(t)
                return key === taskKeyLower || key === taskKey
              })

              let updatedTasks: any[]
              if (taskIndex >= 0) {
                // Update existing task
                updatedTasks = [...existingTasks]
                updatedTasks[taskIndex] = { ...existingTasks[taskIndex], ...taskForDay }
              } else {
                // Append new task
                updatedTasks = [...existingTasks, taskForDay]
              }

              // Only add ticker entry if status is "done"
              const existingTickers = Array.isArray(existingDay.ticker) ? existingDay.ticker : []
              let updatedTickers = existingTickers
              
              if (currentStatus === 'done') {
                // Calculate profit and prize from task completions for this date
                const aggregated = await aggregateCompleterEarningsFromTaskList(taskListToUpdate.id, user.id, year, dateISO)
                
                // Push new ticker entry with taskId, ensuring uniqueness
                const taskId = taskForDay.id || taskForDay.localeKey || taskForDay.name || undefined
                const newTicker = {
                  listId: taskListToUpdate.id,
                  taskId: taskId,
                  profit: aggregated.profit || 0,
                  prize: aggregated.prize || 0
                }
                
                // Remove existing ticker entry with the same taskId to ensure uniqueness
                const filteredTickers = existingTickers.filter((t: any) => !t.taskId || t.taskId !== taskId)
                updatedTickers = [...filteredTickers, newTicker]
              }

              // Update productivity for this list based on tasks in day.tasks
              const existingProductivity = (existingDay.productivity as Productivity | null) || null
              const { productivity: updatedProductivity, progress: newProgress } = updateProductivityForList(
                existingProductivity,
                taskListToUpdate.id,
                taskListToUpdate.tasks as any[], // List tasks for matching
                updatedTasks // Day tasks to count from
              )

              // Get current user balance values
              const { userBalance, userStash, userEquity } = getUserBalanceValues()

              await prisma.day.update({
                where: { id: existingDay.id },
                data: {
                  tasks: updatedTasks as any,
                  ticker: updatedTickers as any,
                  productivity: updatedProductivity as any,
                  progress: newProgress,
                  balance: userBalance,
                  stash: userStash,
                  equity: userEquity,
                  week: weekNumber,
                  month: month,
                  quarter: quarter,
                  semester: semester
                }
              })
            } else {
              // Only add ticker entry if status is "done"
              let ticker: any[] = []
              
              if (currentStatus === 'done') {
                // Calculate profit and prize from task completions for this date
                const aggregated = await aggregateCompleterEarningsFromTaskList(taskListToUpdate.id, user.id, year, dateISO)
                
                // Create ticker array with profit and prize (taskId is already unique for new day)
                const taskId = taskForDay.id || taskForDay.localeKey || taskForDay.name || undefined
                ticker = [{
                  listId: taskListToUpdate.id,
                  taskId: taskId,
                  profit: aggregated.profit || 0,
                  prize: aggregated.prize || 0
                }]
              }

              // Calculate productivity for this list based on tasks in day.tasks
              const { productivity: newProductivity, progress: newProgress } = updateProductivityForList(
                null,
                taskListToUpdate.id,
                taskListToUpdate.tasks as any[], // List tasks for matching
                [taskForDay] // Day tasks to count from (single task for new day)
              )

              // Get user's availableBalance, stash, and equity for new day
              const userBalance = typeof user.availableBalance === 'number' 
                ? user.availableBalance 
                : (typeof user.availableBalance === 'string' ? parseFloat(user.availableBalance || '0') : 0)
              const userStash = typeof user.stash === 'number' 
                ? user.stash 
                : (typeof user.stash === 'string' ? parseFloat(user.stash || '0') : 0)
              const userEquity = typeof user.equity === 'number' 
                ? user.equity 
                : (typeof user.equity === 'string' ? parseFloat(user.equity || '0') : 0)
              
              // Create new day with the task
              await prisma.day.create({
                data: {
                  userId: user.id,
                  date: dateISO,
                  tasks: [taskForDay] as any,
                  ticker: ticker as any,
                  productivity: newProductivity as any,
                  progress: newProgress,
                  balance: userBalance,
                  stash: userStash,
                  equity: userEquity,
                  week: weekNumber,
                  month: month,
                  quarter: quarter,
                  semester: semester
                }
              })
            }
          }
        } catch (dayError) {
          // Log error but don't fail the request if Day update fails
          console.error('Error updating Day entry:', dayError)
        }
      }

      return NextResponse.json({ taskList: updated })
    }

    // If editing a specific TaskList by ID, update directly
    if (body.taskListId && create === false) {
      const existingById = await prisma.list.findUnique({ where: { id: body.taskListId } })
      if (!existingById) {
        return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })
      }

      // Translate tasks if provided
      let updatedTasks = translatedTasks || (Array.isArray(tasks) ? tasks : existingById.tasks)
      // Ensure all tasks have unique ObjectIds
      if (Array.isArray(updatedTasks)) {
        // If updating from template, always generate new IDs; otherwise only for missing ones
        updatedTasks = ensureUniqueTaskIds(updatedTasks, !!templateId)
      }

      const updated = await prisma.list.update({
        where: { id: existingById.id },
        data: ({
          templateTasks: updatedTasks,
          tasks: updatedTasks,
          templateId: typeof templateId !== 'undefined' ? templateId : existingById.templateId,
          role: typeof role === 'string' ? role : existingById.role,
          name: typeof name !== 'undefined' ? name : existingById.name,
          budget: typeof budget === 'number' ? budget : (typeof budget !== 'undefined' ? parseFloat(String(budget)) : existingById.budget),
          budgetPercentage: typeof budgetPercentage === 'number' ? budgetPercentage : existingById.budgetPercentage,
          dueDate: typeof dueDate !== 'undefined' ? dueDate : existingById.dueDate,
          users: Array.isArray(collaborators) 
            ? [
                ...((existingById.users as any[]) || []).filter((u: any) => u.role === 'OWNER'),
                ...collaborators.map((id: string) => ({ userId: id, role: 'COLLABORATOR' as const }))
              ]
            : existingById.users,
          updatedAt: new Date()
        } as any),
        include: { template: true }
      })

      // Recalculate user's budget if budgetPercentage was updated
      if (typeof budgetPercentage === 'number') {
        await recalculateUserBudget(user.id)
      }

      return NextResponse.json({ taskList: updated })
    }

    // Check if TaskList with this role already exists for this user
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
      // If creating a new default list, demote existing default to custom
      if (role && role.endsWith('.default') && existingTaskList) {
        await prisma.list.update({
          where: { id: existingTaskList.id },
          data: { role: 'custom' }
        })
      }
      // Create new TaskList
      taskList = await prisma.list.create({
        data: ({
          role: role,
          name: localizedName,
          budget: typeof budget === 'number' ? budget : (budget ? parseFloat(String(budget)) : undefined),
          budgetPercentage: typeof budgetPercentage === 'number' ? budgetPercentage : 0,
          dueDate: dueDate,
          visibility: 'PRIVATE',
          users: [
            { userId: user.id, role: 'OWNER' },
            ...(Array.isArray(collaborators) ? collaborators.map((id: string) => ({ userId: id, role: 'COLLABORATOR' as const })) : [])
          ],
          templateTasks: translatedTasks,
          tasks: translatedTasks,
          templateId: templateId
        } as any),
        include: { template: true }
      })
      
      // Recalculate user's budget after creating a new list
      if (typeof budgetPercentage === 'number') {
        await recalculateUserBudget(user.id)
      }
    } else if (existingTaskList) {
      // Update existing TaskList
      let updatedTasks = translatedTasks || tasks
      // If updating from template, ensure all tasks have unique ObjectIds
      if (templateId && updatedTasks) {
        updatedTasks = ensureUniqueTaskIds(updatedTasks, true)
      } else if (updatedTasks) {
        // Even if not from template, ensure all tasks have IDs (generate for missing ones)
        updatedTasks = ensureUniqueTaskIds(updatedTasks, false)
      }
      taskList = await prisma.list?.update({
        where: { id: existingTaskList.id },
        data: ({
          templateTasks: updatedTasks ?? existingTaskList.tasks,
          tasks: updatedTasks,
          templateId: templateId,
          name: name ?? existingTaskList.name,
          budget: typeof budget === 'number' ? budget : (budget ? parseFloat(String(budget)) : existingTaskList.budget),
          budgetPercentage: typeof budgetPercentage === 'number' ? budgetPercentage : existingTaskList.budgetPercentage,
          dueDate: dueDate ?? existingTaskList.dueDate,
          users: Array.isArray(collaborators) 
            ? [
                ...((existingTaskList.users as any[]) || []).filter((u: any) => u.role === 'OWNER'),
                ...collaborators.map((id: string) => ({ userId: id, role: 'COLLABORATOR' as const }))
              ]
            : existingTaskList.users,
          updatedAt: new Date()
        } as any),
        include: { template: true }
      })
      
      // Recalculate user's budget if budgetPercentage was updated
      if (typeof budgetPercentage === 'number') {
        await recalculateUserBudget(user.id)
      }
    } else {
      // Create new TaskList
      taskList = await prisma.list.create({
        data: ({
          role: role,
          name: localizedName,
          budget: typeof budget === 'number' ? budget : (budget ? parseFloat(String(budget)) : undefined),
          budgetPercentage: typeof budgetPercentage === 'number' ? budgetPercentage : 0,
          dueDate: dueDate,
          visibility: 'PRIVATE',
          users: [
            { userId: user.id, role: 'OWNER' },
            ...(Array.isArray(collaborators) ? collaborators.map((id: string) => ({ userId: id, role: 'COLLABORATOR' as const })) : [])
          ],
          templateTasks: translatedTasks,
          tasks: translatedTasks,
          templateId: templateId
        } as any),
        include: { template: true }
      })
      
      // Recalculate user's budget after creating a new list
      if (typeof budgetPercentage === 'number') {
        await recalculateUserBudget(user.id)
      }
    }

    // Optionally update the linked Template with the same tasks
    if (updateTemplate && taskList?.templateId) {
      await prisma.template.update({
        where: { id: taskList.templateId },
        data: {
          tasks: translatedTasks,
          updatedAt: new Date()
        }
      })

      // Re-fetch task list to include refreshed template relation
      taskList = await prisma.list.findUnique({
        where: { id: taskList.id },
        include: { template: true }
      })
    }

    return NextResponse.json({ taskList })

  } catch (error) {
    console.error('Error updating task list:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
