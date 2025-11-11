import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { loadTranslationsSync, t } from '@/lib/i18n'
import { parseCookies } from '@/lib/localeUtils'
import { getBestLocale } from '@/lib/i18n'
import { recalculateUserBudget } from '@/lib/budgetUtils'
import { calculateTaskEarnings, calculateBudgetConsumption, initializeRemainingBudget, getPerCompleterPrize, getPerCompleterProfit, getProfitPerTask, calculateStashAndProfitDeltas, calculateUpdatedUserValues } from '@/lib/earningsUtils'

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
            profile: true
          }
        })
        
        const userIdToUserName: Record<string, string> = {}
        userProfiles.forEach(u => {
          userIdToUserName[u.id] = u.profile?.userName || u.id
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
      where: { userId: userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get user's locale and translations
    const userLocale = getUserLocale(request)
    const translations = loadTranslationsSync(userLocale)

    // Translate tasks if provided
    let translatedTasks = tasks
    if (Array.isArray(tasks) && tasks.length > 0) {
      translatedTasks = translateTemplateTasks(tasks, translations)
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
        'id', 'name', 'categories', 'area', 'status', 'cadence', 'times', 'count', 'localeKey', 'contacts', 'things', 'favorite', 'isEphemeral', 'createdAt', 'completers', 'taskStatus'
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
        openTasks = dateBucket.filter((t: any) => t.status !== 'Done')
        closedTasks = dateBucket.filter((t: any) => t.status === 'Done')
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
        openTasks = blueprintTasks.map((t: any) => sanitizeTask({ ...t, count: 0, status: 'Open' }))
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
            status: incoming.status || 'Open',
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
          newCount = Number(incoming?.count || (incoming.status === 'Done' ? 1 : 0))
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
          // Preserve the status from incoming task (may be 'Open' for partial completions or 'Done' for full)
          status: incoming.status || 'Done',
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
            const updatedTask = { ...taskWithoutCompletedOn, status: 'Open', completers: comps, count: comps.length }
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
          const updatedTask = { ...taskWithoutCompletedOn, status: 'Open', completers: comps, count: comps.length }
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
        
        // Task is done if status is 'Done' or count >= times
        if (taskStatus === 'Done' || taskCount >= taskTimes) {
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

      // Update taskStatus in ephemeral tasks to keep them in sync
      let updatedEphemeralTasks = (taskList as any).ephemeralTasks || { open: [], closed: [] }
      let ephemeralOpen = Array.isArray(updatedEphemeralTasks.open) ? updatedEphemeralTasks.open : []
      let ephemeralClosed = Array.isArray(updatedEphemeralTasks.closed) ? updatedEphemeralTasks.closed : []

      ephemeralOpen = ephemeralOpen.map((task: any) => {
        const key = getKey(task)
        const incomingTask = incomingTasks.find((t: any) => getKey(t) === key)
        if (incomingTask) {
          const updated = { ...task }
          if (incomingTask.taskStatus) updated.taskStatus = incomingTask.taskStatus
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
          if (incomingTask.taskStatus) updated.taskStatus = incomingTask.taskStatus
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
        const withId = { id: t.id || `ephemeral_${Date.now()}_${Math.random().toString(36).slice(2,9)}`, name: t.name, status: t.status || 'Not started', area: t.area || 'self', categories: t.categories || ['custom'], cadence: t.cadence || 'ephemeral', times: t.times || 1, count: t.count || 0, contacts: t.contacts || [], things: t.things || [], favorite: !!t.favorite, isEphemeral: true, createdAt: new Date().toISOString() }
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
                status: 'Done', 
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
          const { id, count, status, taskStatus } = updateOp
          open = open.map((x: any) => {
            if (x.id === id) {
              const updated = { ...x }
              if (count !== undefined) updated.count = count
              if (status) updated.status = status
              if (taskStatus) updated.taskStatus = taskStatus
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
            open = [{ ...taskWithoutCompletedFields, status: 'Open', count: count !== undefined ? count : (item.count || 0) }, ...open]
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
      const taskList = await prisma.list.findUnique({ where: { id: body.taskListId } })
      if (!taskList) return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })

      const taskKey = body.taskKey // id, localeKey, or name
      const newStatus = body.taskStatus
      const dateISO = body.date || new Date().toISOString().split('T')[0] // Use provided date or today

      // Helper to match tasks reliably
      const getKey = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')) as string
      const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey

      // Get task from templateTasks or tasks to use as base
      let baseTask: any = null
      const tasks = Array.isArray(taskList.tasks) 
        ? taskList.tasks 
        : (Array.isArray((taskList as any).templateTasks) ? (taskList as any).templateTasks : [])
      
      baseTask = tasks.find((task: any) => {
        const key = getKey(task)
        return key === taskKeyLower || key === taskKey
      })

      // If not found in tasks, check templateTasks
      if (!baseTask) {
        const templateTasks = Array.isArray((taskList as any).templateTasks) ? (taskList as any).templateTasks : []
        baseTask = templateTasks.find((task: any) => {
          const key = getKey(task)
          return key === taskKeyLower || key === taskKey
        })
      }

      // Also check and update ephemeral tasks
      let ephemeralTasks = (taskList as any).ephemeralTasks || { open: [], closed: [] }
      let open = Array.isArray(ephemeralTasks.open) ? ephemeralTasks.open : []
      let closed = Array.isArray(ephemeralTasks.closed) ? ephemeralTasks.closed : []

      // Update status in open ephemeral tasks
      open = open.map((task: any) => {
        const key = getKey(task)
        if (key === taskKeyLower || key === taskKey) {
          if (!baseTask) baseTask = { ...task }
          return { ...task, taskStatus: newStatus }
        }
        return task
      })

      // Also update status in closed ephemeral tasks
      closed = closed.map((task: any) => {
        const key = getKey(task)
        if (key === taskKeyLower || key === taskKey) {
          if (!baseTask) baseTask = { ...task }
          return { ...task, taskStatus: newStatus }
        }
        return task
      })

      ephemeralTasks = { open, closed }

      // Update task in completedTasks[year][date].openTasks/closedTasks
      let completedTasks = (taskList as any).completedTasks || {}
      const year = Number(dateISO.split('-')[0])
      const yearBucket = completedTasks[year] || {}
      const dateBucket = yearBucket[dateISO] || {}
      
      // Support both old structure (array) and new structure (openTasks/closedTasks)
      let openTasks: any[] = []
      let closedTasks: any[] = []
      
      if (Array.isArray(dateBucket)) {
        // Legacy structure: migrate to new structure
        openTasks = dateBucket.filter((t: any) => t.status !== 'Done')
        closedTasks = dateBucket.filter((t: any) => t.status === 'Done')
      } else if (dateBucket.openTasks || dateBucket.closedTasks) {
        // New structure
        openTasks = Array.isArray(dateBucket.openTasks) ? [...dateBucket.openTasks] : []
        closedTasks = Array.isArray(dateBucket.closedTasks) ? [...dateBucket.closedTasks] : []
      } else if (baseTask) {
        // First time - initialize from taskList.tasks
        const blueprintTasks: any[] = Array.isArray(taskList.tasks) ? (taskList.tasks as any[]) : (Array.isArray((taskList as any).templateTasks) ? ((taskList as any).templateTasks as any[]) : [])
        openTasks = blueprintTasks.map((t: any) => ({ ...t, count: 0, status: 'Open' }))
      }
      
      if (baseTask) {
        const updatedTask = { ...baseTask, taskStatus: newStatus }
        
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
          openTasks[openIndex] = { ...openTasks[openIndex], ...updatedTask, taskStatus: newStatus }
        } else if (closedIndex >= 0) {
          // Update in closedTasks
          closedTasks[closedIndex] = { ...closedTasks[closedIndex], ...updatedTask, taskStatus: newStatus }
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
        where: { id: taskList.id },
        data: {
          ephemeralTasks: ephemeralTasks,
          completedTasks: completedTasks,
          updatedAt: new Date()
        } as any,
        include: { template: true }
      })

      return NextResponse.json({ taskList: updated })
    }

    // If editing a specific TaskList by ID, update directly
    if (body.taskListId && create === false) {
      const existingById = await prisma.list.findUnique({ where: { id: body.taskListId } })
      if (!existingById) {
        return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })
      }

      // Translate tasks if provided
      const updatedTasks = translatedTasks || (Array.isArray(tasks) ? tasks : existingById.tasks)

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
      const updatedTasks = translatedTasks || tasks
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
