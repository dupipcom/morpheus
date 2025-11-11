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
        { owners: { has: user.id } },
        { collaborators: { has: user.id } },
        { managers: { has: user.id } }
      ]
    }

    const whereClause: any = role ? { role, ...membershipClause } : membershipClause

    // Ensure default daily/weekly lists exist for the owner
    const ownerUser = await prisma.user.findUnique({ where: { userId } })
    if (ownerUser) {
      const userLocale = getUserLocale(request)
      const translations = loadTranslationsSync(userLocale)

      const ensureDefault = async (r: string) => {
        const existing = await prisma.taskList.findFirst({ where: { owners: { has: ownerUser.id }, role: r } })
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

          await prisma.taskList.create({
            data: {
              role: r,
              name: localizedName,
              visibility: 'PRIVATE',
              owners: [ownerUser.id],
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

    const taskLists = await prisma.taskList?.findMany({
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
      if (Array.isArray(taskList.collaborators) && taskList.collaborators.length > 0) {
        const completedTasks = (taskList.completedTasks as any) || {}
        const allOwners = taskList.owners || []
        const allCollaborators = [...allOwners, ...taskList.collaborators]
        
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
      const existing = await prisma.taskList.findUnique({ where: { id: body.taskListId } })
      if (!existing) return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })
      await prisma.taskList.delete({ where: { id: body.taskListId } })
      
      // Recalculate user's budget after deleting a list
      await recalculateUserBudget(user.id)
      
      return NextResponse.json({ ok: true })
    }

    // Lightweight path: record completions into completedTasks and Task.completers
    if (body.recordCompletions && body.taskListId && (body.dayActions?.length || body.weekActions?.length || Array.isArray(body.justUncompletedNames))) {
      const taskList = await prisma.taskList.findUnique({ where: { id: body.taskListId } })
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

      const saved = await prisma.taskList.update({
        where: { id: taskList.id },
        data: ({ 
          completedTasks: nextCompleted,
          ephemeralTasks: updatedEphemeralTasks,
          remainingBudget: newRemainingBudget
        } as any),
        include: { template: true }
      })

      // Update user entries with earnings data (backend calculation for security)
      if (userRecord) {
        const entries = userRecord.entries as any
        const rolePrefix = taskList.role?.split('.')[0] || ''
        const isDailyRole = rolePrefix === 'daily'
        const isWeeklyRole = rolePrefix === 'weekly'
        const isOneOffRole = rolePrefix === 'one-off' || rolePrefix === 'oneoff'
        const listId = taskList.id // Get the listId for grouping entries
        
        // Helper to get week number
        const getWeekNumber = (date: Date): number => {
          const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
          const dayNum = d.getUTCDay() || 7
          d.setUTCDate(d.getUTCDate() + 4 - dayNum)
          const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
          return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
        }

        // Initialize year structure if needed
        const ensureStructure = (e: any, y: number) => {
          const copy = { ...(e || {}) }
          if (!copy[y]) copy[y] = { days: {}, weeks: {}, months: {}, quarters: {}, semesters: {}, oneOffs: {}, year: { tasks: [] } }
          if (!copy[y].days) copy[y].days = {}
          if (!copy[y].weeks) copy[y].weeks = {}
          if (!copy[y].months) copy[y].months = {}
          if (!copy[y].quarters) copy[y].quarters = {}
          if (!copy[y].semesters) copy[y].semesters = {}
          if (!copy[y].oneOffs) copy[y].oneOffs = {}
          if (!copy[y].year) copy[y].year = { tasks: [] }
          return copy
        }

        const updated = ensureStructure(entries, year)
        let entriesModified = false
        
        // Helper to migrate old structure (without listId) to new structure (with listId)
        const migrateToNewStructure = (yearData: any, listId: string, isDaily: boolean, isWeekly: boolean, isOneOff: boolean) => {
          let migrated = false
          
          if (isDaily && yearData.days) {
            for (const dateKey in yearData.days) {
              const dateEntry = yearData.days[dateKey]
              // Check if it's old format (has tasks directly, not an object with listId keys)
              if (dateEntry && !dateEntry[listId] && (Array.isArray(dateEntry.tasks) || dateEntry.earnings !== undefined || dateEntry.prize !== undefined || dateEntry.profit !== undefined)) {
                // Migrate: move old structure to new structure under listId
                const oldData = { ...dateEntry }
                yearData.days[dateKey] = {
                  [listId]: oldData
                }
                migrated = true
              }
            }
          }
          
          if (isWeekly && yearData.weeks) {
            for (const weekKey in yearData.weeks) {
              const weekEntry = yearData.weeks[weekKey]
              // Check if it's old format
              if (weekEntry && !weekEntry[listId] && (Array.isArray(weekEntry.tasks) || weekEntry.earnings !== undefined || weekEntry.prize !== undefined || weekEntry.profit !== undefined)) {
                // Migrate: move old structure to new structure under listId
                const oldData = { ...weekEntry }
                yearData.weeks[weekKey] = {
                  [listId]: oldData
                }
                migrated = true
              }
            }
          }
          
          if (isOneOff && yearData.oneOffs) {
            for (const dateKey in yearData.oneOffs) {
              const oneOffEntry = yearData.oneOffs[dateKey]
              // Check if it's old format
              if (oneOffEntry && !oneOffEntry[listId] && (Array.isArray(oneOffEntry.tasks) || oneOffEntry.earnings !== undefined || oneOffEntry.prize !== undefined || oneOffEntry.profit !== undefined)) {
                // Migrate: move old structure to new structure under listId
                const oldData = { ...oneOffEntry }
                yearData.oneOffs[dateKey] = {
                  [listId]: oldData
                }
                migrated = true
              }
            }
          }
          
          return migrated
        }
        
        // Migrate any old structure entries to new structure
        if (migrateToNewStructure(updated[year], listId, isDailyRole, isWeeklyRole, isOneOffRole)) {
          entriesModified = true
        }
        
        // Track stash and profit changes separately
        // Stash only contains prize, profit is tracked separately in user.profit
        let stashDelta = 0  // Prize only
        let totalProfitDelta = 0  // Profit only

        // Helper function to aggregate completer earnings from taskList collection, filtering by logged-in user
        const aggregateCompleterEarningsFromTaskList = async (taskListId: string, userId: string, year: number, dateISO: string) => {
          try {
            const taskList = await prisma.taskList.findUnique({ where: { id: taskListId } })
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

        // Helper function to get tasks without completers metadata
        const sanitizeTaskForEntries = (task: any) => {
          const { completers, ...taskWithoutCompleters } = task
          return taskWithoutCompleters
        }

        // Helper function to check if there are any completed tasks (regular or ephemeral)
        const hasAnyCompletedTasks = (tasks: any[], taskList: any, year: number, dateISO: string, isWeekly: boolean = false): boolean => {
          // Check regular tasks
          const hasRegularCompleted = tasks.length > 0 && tasks.some((t: any) => t.status === 'Done')
          
          // Check ephemeral tasks
          const ephemeralTasks = (taskList as any)?.ephemeralTasks || { open: [], closed: [] }
          const closedEphemerals = Array.isArray(ephemeralTasks.closed) ? ephemeralTasks.closed : []
          
          let hasEphemeralCompleted = false
          
          if (isWeekly) {
            // For weekly lists, check all dates in the week
            const weekStart = new Date(dateISO)
            weekStart.setDate(weekStart.getDate() - weekStart.getDay())
            const weekEnd = new Date(weekStart)
            weekEnd.setDate(weekEnd.getDate() + 6)
            
            const weekDates = new Set<string>()
            for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
              weekDates.add(d.toISOString().split('T')[0])
            }
            
            hasEphemeralCompleted = closedEphemerals.some((t: any) => {
              // Check if task was completed within the week
              return t.completedOn && weekDates.has(t.completedOn) ||
                     (t.status === 'Done' && (!t.completedOn || weekDates.has(t.completedOn)))
            })
          } else {
            // For daily/one-off lists, check only the specific date
            hasEphemeralCompleted = closedEphemerals.some((t: any) => {
              // Check if task was completed on this date (completedOn field in YYYY-MM-DD format)
              return t.completedOn === dateISO || 
                     (t.status === 'Done' && (!t.completedOn || t.completedOn === dateISO))
            })
          }
          
          return hasRegularCompleted || hasEphemeralCompleted
        }

        // Handle completions
        if (justCompletedNames.length > 0) {
          // Prepare completed tasks to append (from closedTasks)
          const completedTasks = finalClosedTasks.filter((t: any) => {
            const nm = typeof t?.name === 'string' ? t.name.toLowerCase() : ''
            return justCompletedNames.some(jc => typeof jc === 'string' && jc.toLowerCase() === nm)
          })

          // Calculate total earnings from all new completers in this completion
          const numNewCompleters = justCompletedNames.length

          // Update daily entries
          if (isDailyRole && completedTasks.length > 0) {
            // Initialize date structure if needed
            if (!updated[year].days[dateISO]) {
              updated[year].days[dateISO] = {}
            }
            // Migrate old format if exists, or initialize listId entry
            if (!updated[year].days[dateISO][listId]) {
              const dateEntry = updated[year].days[dateISO]
              // Check if old format exists and migrate it
              if (dateEntry && !dateEntry[listId] && (Array.isArray(dateEntry.tasks) || dateEntry.earnings !== undefined || dateEntry.prize !== undefined || dateEntry.profit !== undefined)) {
                const oldData = { ...dateEntry }
                updated[year].days[dateISO] = {
                  [listId]: oldData
                }
                entriesModified = true
              } else {
                // Initialize new structure
                updated[year].days[dateISO][listId] = { year, date: dateISO, tasks: [] }
              }
            }
            const existing = updated[year].days[dateISO][listId].tasks || []
            const names = new Set(existing.map((t: any) => t.name))
            const toAppend = completedTasks.filter((t: any) => !names.has(t.name))

            // Store tasks without completers metadata
            const finalTasks = [...existing]
            for (const newTask of toAppend) {
              const existingIndex = finalTasks.findIndex((t: any) => t.name === newTask.name)
              if (existingIndex >= 0) {
                // Update existing task without completers
                finalTasks[existingIndex] = sanitizeTaskForEntries({
                  ...finalTasks[existingIndex],
                  ...newTask
                })
              } else {
                // Append new task without completers
                finalTasks.push(sanitizeTaskForEntries(newTask))
              }
            }

            // Aggregate completer earnings from taskList collection, filtering by logged-in user
            const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateISO)
            // Helper to convert to number (handles both string and number for backward compatibility)
            const toNumber = (val: any): number => {
              if (typeof val === 'number') return val
              if (typeof val === 'string') return parseFloat(val) || 0
              return 0
            }
            const currentPrize = toNumber(updated[year].days[dateISO][listId].prize)
            const currentProfit = toNumber(updated[year].days[dateISO][listId].profit)
            const currentEarnings = toNumber(updated[year].days[dateISO][listId].earnings)

            // Calculate deltas based on aggregated completer values
            const prizeDelta = aggregated.prize - currentPrize
            const profitDelta = aggregated.profit - currentProfit

            // If there are no completed tasks (regular or ephemeral), set all values to 0
            const hasCompletedTasks = hasAnyCompletedTasks(finalTasks, taskList, year, dateISO, false)
            const newPrize = hasCompletedTasks ? aggregated.prize : 0
            const newProfit = hasCompletedTasks ? aggregated.profit : 0
            const newEarnings = hasCompletedTasks ? aggregated.earnings : 0

            // Accumulate stash and profit deltas separately (only for new completers)
            const deltas = calculateStashAndProfitDeltas(prizeDelta, profitDelta, true)
            stashDelta += deltas.stashDelta
            totalProfitDelta += deltas.profitDelta

            updated[year].days[dateISO][listId] = {
              ...updated[year].days[dateISO][listId],
              tasks: finalTasks,
              prize: newPrize,
              profit: newProfit,
              earnings: newEarnings
            }
            entriesModified = true
          }

          // Update weekly entries
          if (isWeeklyRole && completedTasks.length > 0) {
            const week = getWeekNumber(completionDate)
            // Initialize week structure if needed
            if (!updated[year].weeks[week]) {
              updated[year].weeks[week] = {}
            }
            // Migrate old format if exists, or initialize listId entry
            if (!updated[year].weeks[week][listId]) {
              const weekEntry = updated[year].weeks[week]
              // Check if old format exists and migrate it
              if (weekEntry && !weekEntry[listId] && (Array.isArray(weekEntry.tasks) || weekEntry.earnings !== undefined || weekEntry.prize !== undefined || weekEntry.profit !== undefined)) {
                const oldData = { ...weekEntry }
                updated[year].weeks[week] = {
                  [listId]: oldData
                }
                entriesModified = true
              } else {
                // Initialize new structure
                updated[year].weeks[week][listId] = { year, week, tasks: [] }
              }
            }
            const existing = updated[year].weeks[week][listId].tasks || []
            const names = new Set(existing.map((t: any) => t.name))
            const toAppend = completedTasks.filter((t: any) => !names.has(t.name))

            // Store tasks without completers metadata
            const finalTasks = [...existing]
            for (const newTask of toAppend) {
              const existingIndex = finalTasks.findIndex((t: any) => t.name === newTask.name)
              if (existingIndex >= 0) {
                // Update existing task without completers
                finalTasks[existingIndex] = sanitizeTaskForEntries({
                  ...finalTasks[existingIndex],
                  ...newTask
                })
              } else {
                // Append new task without completers
                finalTasks.push(sanitizeTaskForEntries(newTask))
              }
            }

            // Aggregate completer earnings from completedTasks structure
            // For weekly, we need to aggregate all dates in that week
            // Merge nextCompleted with priorCompleted to get complete week data (nextCompleted has current date, priorCompleted has other dates)
            const mergedCompletedTasks = {
              ...priorCompleted,
              [year]: {
                ...(priorCompleted[year] || {}),
                ...nextCompleted[year]
              }
            }
            
            const weekStart = new Date(completionDate)
            weekStart.setDate(weekStart.getDate() - weekStart.getDay())
            const weekEnd = new Date(weekStart)
            weekEnd.setDate(weekEnd.getDate() + 6)
            
            let totalEarnings = 0
            let totalPrize = 0
            let totalProfit = 0
            
            for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
              const dateStr = d.toISOString().split('T')[0]
              const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateStr)
              totalEarnings += aggregated.earnings
              totalPrize += aggregated.prize
              totalProfit += aggregated.profit
            }
            
            const aggregated = { earnings: totalEarnings, prize: totalPrize, profit: totalProfit }
            // Helper to convert to number (handles both string and number for backward compatibility)
            const toNumber = (val: any): number => {
              if (typeof val === 'number') return val
              if (typeof val === 'string') return parseFloat(val) || 0
              return 0
            }
            const currentPrize = toNumber(updated[year].weeks[week][listId].prize)
            const currentProfit = toNumber(updated[year].weeks[week][listId].profit)
            const currentEarnings = toNumber(updated[year].weeks[week][listId].earnings)

            // Calculate deltas based on aggregated completer values
            const prizeDelta = aggregated.prize - currentPrize
            const profitDelta = aggregated.profit - currentProfit

            // If there are no completed tasks (regular or ephemeral), set all values to 0
            // For weekly lists, check all dates in the week
            const hasCompletedTasks = hasAnyCompletedTasks(finalTasks, taskList, year, dateISO, true)
            const newPrize = hasCompletedTasks ? aggregated.prize : 0
            const newProfit = hasCompletedTasks ? aggregated.profit : 0
            const newEarnings = hasCompletedTasks ? aggregated.earnings : 0

            // Accumulate stash and profit deltas separately (only for new completers)
            const deltas = calculateStashAndProfitDeltas(prizeDelta, profitDelta, true)
            stashDelta += deltas.stashDelta
            totalProfitDelta += deltas.profitDelta

            updated[year].weeks[week][listId] = {
              ...updated[year].weeks[week][listId],
              tasks: finalTasks,
              prize: newPrize,
              profit: newProfit,
              earnings: newEarnings
            }
            entriesModified = true
          }

          // Update one-off entries (use full action earnings, no division)
          if (isOneOffRole && completedTasks.length > 0) {
            // Initialize date structure if needed
            if (!updated[year].oneOffs[dateISO]) {
              updated[year].oneOffs[dateISO] = {}
            }
            // Migrate old format if exists, or initialize listId entry
            if (!updated[year].oneOffs[dateISO][listId]) {
              const oneOffEntry = updated[year].oneOffs[dateISO]
              // Check if old format exists and migrate it
              if (oneOffEntry && !oneOffEntry[listId] && (Array.isArray(oneOffEntry.tasks) || oneOffEntry.earnings !== undefined || oneOffEntry.prize !== undefined || oneOffEntry.profit !== undefined)) {
                const oldData = { ...oneOffEntry }
                updated[year].oneOffs[dateISO] = {
                  [listId]: oldData
                }
                entriesModified = true
              } else {
                // Initialize new structure
                updated[year].oneOffs[dateISO][listId] = { year, date: dateISO, tasks: [] }
              }
            }
            const existing = updated[year].oneOffs[dateISO][listId].tasks || []
            const names = new Set(existing.map((t: any) => t.name))
            const toAppend = completedTasks.filter((t: any) => !names.has(t.name))

            // Store tasks without completers metadata
            const finalTasks = [...existing]
            for (const newTask of toAppend) {
              const existingIndex = finalTasks.findIndex((t: any) => t.name === newTask.name)
              if (existingIndex >= 0) {
                // Update existing task without completers
                finalTasks[existingIndex] = sanitizeTaskForEntries({
                  ...finalTasks[existingIndex],
                  ...newTask
                })
              } else {
                // Append new task without completers
                finalTasks.push(sanitizeTaskForEntries(newTask))
              }
            }

            // Aggregate completer earnings from taskList collection, filtering by logged-in user
            const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateISO)

            // Helper to convert to number (handles both string and number for backward compatibility)
            const toNumber = (val: any): number => {
              if (typeof val === 'number') return val
              if (typeof val === 'string') return parseFloat(val) || 0
              return 0
            }
            const currentPrize = toNumber(updated[year].oneOffs[dateISO][listId].prize)
            const currentProfit = toNumber(updated[year].oneOffs[dateISO][listId].profit)
            const currentEarnings = toNumber(updated[year].oneOffs[dateISO][listId].earnings)

            // Calculate deltas based on aggregated completer values
            const prizeDelta = aggregated.prize - currentPrize
            const profitDelta = aggregated.profit - currentProfit

            // If there are no completed tasks (regular or ephemeral), set all values to 0
            const hasCompletedTasks = hasAnyCompletedTasks(finalTasks, taskList, year, dateISO, false)
            const newPrize = hasCompletedTasks ? aggregated.prize : 0
            const newProfit = hasCompletedTasks ? aggregated.profit : 0
            const newEarnings = hasCompletedTasks ? aggregated.earnings : 0

            // Accumulate stash and profit deltas separately (only for new completers)
            const deltas = calculateStashAndProfitDeltas(prizeDelta, profitDelta, true)
            stashDelta += deltas.stashDelta
            totalProfitDelta += deltas.profitDelta

            updated[year].oneOffs[dateISO][listId] = {
              ...updated[year].oneOffs[dateISO][listId],
              tasks: finalTasks,
              prize: newPrize,
              profit: newProfit,
              earnings: newEarnings
            }
            entriesModified = true
          }
        }

        // Handle uncompletion - remove tasks from user entries and recalculate earnings
        if (justUncompletedNames.length > 0) {
          const removeSet = new Set(justUncompletedNames.map((s: string) => typeof s === 'string' ? s.toLowerCase() : s))

          // Remove from daily entries and recalculate earnings from TaskList
          if (isDailyRole && updated[year]?.days?.[dateISO]) {
            // Ensure new structure exists (migrate if needed)
            if (!updated[year].days[dateISO][listId]) {
              // Check if old format exists and migrate it
              const dateEntry = updated[year].days[dateISO]
              if (dateEntry && !dateEntry[listId] && (Array.isArray(dateEntry.tasks) || dateEntry.earnings !== undefined)) {
                const oldData = { ...dateEntry }
                updated[year].days[dateISO] = {
                  [listId]: oldData
                }
                entriesModified = true
              } else {
                // Initialize new structure
                updated[year].days[dateISO][listId] = { year, date: dateISO, tasks: [] }
              }
            }
            
            const existing = updated[year].days[dateISO][listId].tasks || []
            const remainingTasks = existing.filter((t: any) => !removeSet.has((t?.name || '').toLowerCase()))
            updated[year].days[dateISO][listId].tasks = remainingTasks
            
            // Recalculate earnings from taskList collection, filtering by logged-in user
            const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateISO)
            // Helper to convert to number (handles both string and number for backward compatibility)
            const toNumber = (val: any): number => {
              if (typeof val === 'number') return val
              if (typeof val === 'string') return parseFloat(val) || 0
              return 0
            }
            const currentPrize = toNumber(updated[year].days[dateISO][listId].prize)
            const currentProfit = toNumber(updated[year].days[dateISO][listId].profit)
            const currentEarnings = toNumber(updated[year].days[dateISO][listId].earnings)

            const prizeDelta = aggregated.prize - currentPrize
            const profitDelta = aggregated.profit - currentProfit

            // If there are no completed tasks (regular or ephemeral), set all values to 0
            const tasksForCheck = updated[year].days[dateISO][listId].tasks || []
            const hasCompletedTasks = hasAnyCompletedTasks(tasksForCheck, taskList, year, dateISO, false)
            const newPrize = hasCompletedTasks ? aggregated.prize : 0
            const newProfit = hasCompletedTasks ? aggregated.profit : 0
            const newEarnings = hasCompletedTasks ? aggregated.earnings : 0

            // Subtract from stash and profit deltas separately (only negative changes)
            const deltas = calculateStashAndProfitDeltas(prizeDelta, profitDelta, false)
            stashDelta += deltas.stashDelta
            totalProfitDelta += deltas.profitDelta

            updated[year].days[dateISO][listId] = {
              ...updated[year].days[dateISO][listId],
              prize: newPrize,
              profit: newProfit,
              earnings: newEarnings
            }
            entriesModified = true
          }

          // Remove from weekly entries and recalculate earnings from TaskList
          if (isWeeklyRole) {
            const week = getWeekNumber(completionDate)
            if (updated[year]?.weeks?.[week]) {
              // Ensure new structure exists (migrate if needed)
              if (!updated[year].weeks[week][listId]) {
                // Check if old format exists and migrate it
                const weekEntry = updated[year].weeks[week]
                if (weekEntry && !weekEntry[listId] && (Array.isArray(weekEntry.tasks) || weekEntry.earnings !== undefined)) {
                  const oldData = { ...weekEntry }
                  updated[year].weeks[week] = {
                    [listId]: oldData
                  }
                  entriesModified = true
                } else {
                  // Initialize new structure
                  updated[year].weeks[week][listId] = { year, week, tasks: [] }
                }
              }
              
              const existing = updated[year].weeks[week][listId].tasks || []
              const remainingTasks = existing.filter((t: any) => !removeSet.has((t?.name || '').toLowerCase()))
              updated[year].weeks[week][listId].tasks = remainingTasks
              
              // Recalculate earnings from saved.completedTasks for the week (after uncompletion update)
              const weekStart = new Date(completionDate)
              weekStart.setDate(weekStart.getDate() - weekStart.getDay())
              const weekEnd = new Date(weekStart)
              weekEnd.setDate(weekEnd.getDate() + 6)
              
              let totalEarnings = 0
              let totalPrize = 0
              let totalProfit = 0
              
              for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0]
                const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateStr)
                totalEarnings += aggregated.earnings
                totalPrize += aggregated.prize
                totalProfit += aggregated.profit
              }
              
              const aggregated = { earnings: totalEarnings, prize: totalPrize, profit: totalProfit }
              // Helper to convert to number (handles both string and number for backward compatibility)
              const toNumber = (val: any): number => {
                if (typeof val === 'number') return val
                if (typeof val === 'string') return parseFloat(val) || 0
                return 0
              }
              const currentPrize = toNumber(updated[year].weeks[week][listId].prize)
              const currentProfit = toNumber(updated[year].weeks[week][listId].profit)
              const currentEarnings = toNumber(updated[year].weeks[week][listId].earnings)

              const prizeDelta = aggregated.prize - currentPrize
              const profitDelta = aggregated.profit - currentProfit

              // If there are no completed tasks (regular or ephemeral), set all values to 0
              // For weekly lists, check all dates in the week
              const tasksForCheck = updated[year].weeks[week][listId].tasks || []
              const hasCompletedTasks = hasAnyCompletedTasks(tasksForCheck, taskList, year, dateISO, true)
              const newPrize = hasCompletedTasks ? aggregated.prize : 0
              const newProfit = hasCompletedTasks ? aggregated.profit : 0
              const newEarnings = hasCompletedTasks ? aggregated.earnings : 0

              // Subtract from stash and profit deltas separately (only negative changes)
              const deltas = calculateStashAndProfitDeltas(prizeDelta, profitDelta, false)
              stashDelta += deltas.stashDelta
              totalProfitDelta += deltas.profitDelta

              updated[year].weeks[week][listId] = {
                ...updated[year].weeks[week][listId],
                prize: newPrize,
                profit: newProfit,
                earnings: newEarnings
              }
              entriesModified = true
            }
          }

          // Remove from one-off entries and recalculate earnings from TaskList
          if (isOneOffRole && updated[year]?.oneOffs?.[dateISO]) {
            // Ensure new structure exists (migrate if needed)
            if (!updated[year].oneOffs[dateISO][listId]) {
              // Check if old format exists and migrate it
              const oneOffEntry = updated[year].oneOffs[dateISO]
              if (oneOffEntry && !oneOffEntry[listId] && (Array.isArray(oneOffEntry.tasks) || oneOffEntry.earnings !== undefined)) {
                const oldData = { ...oneOffEntry }
                updated[year].oneOffs[dateISO] = {
                  [listId]: oldData
                }
                entriesModified = true
              } else {
                // Initialize new structure
                updated[year].oneOffs[dateISO][listId] = { year, date: dateISO, tasks: [] }
              }
            }
            
            const existing = updated[year].oneOffs[dateISO][listId].tasks || []
            const remainingTasks = existing.filter((t: any) => !removeSet.has((t?.name || '').toLowerCase()))
            updated[year].oneOffs[dateISO][listId].tasks = remainingTasks
            
            // Recalculate earnings from taskList collection, filtering by logged-in user
            const aggregated = await aggregateCompleterEarningsFromTaskList(taskList.id, user.id, year, dateISO)
            // Helper to convert to number (handles both string and number for backward compatibility)
            const toNumber = (val: any): number => {
              if (typeof val === 'number') return val
              if (typeof val === 'string') return parseFloat(val) || 0
              return 0
            }
            const currentPrize = toNumber(updated[year].oneOffs[dateISO][listId].prize)
            const currentProfit = toNumber(updated[year].oneOffs[dateISO][listId].profit)
            const currentEarnings = toNumber(updated[year].oneOffs[dateISO][listId].earnings)

            const prizeDelta = aggregated.prize - currentPrize
            const profitDelta = aggregated.profit - currentProfit

            // If there are no completed tasks (regular or ephemeral), set all values to 0
            const tasksForCheck = updated[year].oneOffs[dateISO][listId].tasks || []
            const hasCompletedTasks = hasAnyCompletedTasks(tasksForCheck, taskList, year, dateISO, false)
            const newPrize = hasCompletedTasks ? aggregated.prize : 0
            const newProfit = hasCompletedTasks ? aggregated.profit : 0
            const newEarnings = hasCompletedTasks ? aggregated.earnings : 0

            // Subtract from stash and profit deltas separately (only negative changes)
            const deltas = calculateStashAndProfitDeltas(prizeDelta, profitDelta, false)
            stashDelta += deltas.stashDelta
            totalProfitDelta += deltas.profitDelta

            updated[year].oneOffs[dateISO][listId] = {
              ...updated[year].oneOffs[dateISO][listId],
              prize: newPrize,
              profit: newProfit,
              earnings: newEarnings
            }
            entriesModified = true
          }
        }

        // Save updated entries, stash, and profit if modified
        if (entriesModified) {
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
              entries: updated as any,
              stash: updatedValues.newStash as number,
              profit: updatedValues.newProfit as number,
              equity: updatedValues.newEquity as number,
            } as any
          })
        }
      }

      return NextResponse.json({ taskList: saved, earnings })
    }

    // Ephemeral tasks operations scoped to a task list
    if (body.ephemeralTasks && body.taskListId) {
      const taskList = await prisma.taskList.findUnique({ where: { id: body.taskListId } })
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

      const saved = await prisma.taskList.update({
        where: { id: taskList.id },
        data: ({ ephemeralTasks: { open, closed } } as any)
      })

      return NextResponse.json({ taskList: saved })
    }

    // Update task status in completedTasks[year][date].openTasks/closedTasks (not taskList.tasks)
    if (body.updateTaskStatus && body.taskListId) {
      const taskList = await prisma.taskList.findUnique({ where: { id: body.taskListId } })
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

      const updated = await prisma.taskList.update({
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
      const existingById = await prisma.taskList.findUnique({ where: { id: body.taskListId } })
      if (!existingById) {
        return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })
      }

      // Translate tasks if provided
      const updatedTasks = translatedTasks || (Array.isArray(tasks) ? tasks : existingById.tasks)

      const updated = await prisma.taskList.update({
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
          collaborators: Array.isArray(collaborators) ? collaborators : existingById.collaborators,
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
    const existingTaskList = await prisma.taskList?.findFirst({
      where: {
        owners: {
          has: user.id
        },
        role: role
      }
    })

    let taskList

    if (create) {
      // If creating a new default list, demote existing default to custom
      if (role && role.endsWith('.default') && existingTaskList) {
        await prisma.taskList.update({
          where: { id: existingTaskList.id },
          data: { role: 'custom' }
        })
      }
      // Create new TaskList
      taskList = await prisma.taskList.create({
        data: ({
          role: role,
          name: localizedName,
          budget: typeof budget === 'number' ? budget : (budget ? parseFloat(String(budget)) : undefined),
          budgetPercentage: typeof budgetPercentage === 'number' ? budgetPercentage : 0,
          dueDate: dueDate,
          visibility: 'PRIVATE',
          owners: [user.id],
          templateTasks: translatedTasks,
          tasks: translatedTasks,
          templateId: templateId,
          collaborators: Array.isArray(collaborators) ? collaborators : [],
          managers: []
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
      taskList = await prisma.taskList?.update({
        where: { id: existingTaskList.id },
        data: ({
          templateTasks: updatedTasks ?? existingTaskList.tasks,
          tasks: updatedTasks,
          templateId: templateId,
          name: name ?? existingTaskList.name,
          budget: typeof budget === 'number' ? budget : (budget ? parseFloat(String(budget)) : existingTaskList.budget),
          budgetPercentage: typeof budgetPercentage === 'number' ? budgetPercentage : existingTaskList.budgetPercentage,
          dueDate: dueDate ?? existingTaskList.dueDate,
          collaborators: Array.isArray(collaborators) ? collaborators : existingTaskList.collaborators,
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
      taskList = await prisma.taskList.create({
        data: ({
          role: role,
          name: localizedName,
          budget: typeof budget === 'number' ? budget : (budget ? parseFloat(String(budget)) : undefined),
          budgetPercentage: typeof budgetPercentage === 'number' ? budgetPercentage : 0,
          dueDate: dueDate,
          visibility: 'PRIVATE',
          owners: [user.id],
          templateTasks: translatedTasks,
          tasks: translatedTasks,
          templateId: templateId,
          collaborators: Array.isArray(collaborators) ? collaborators : [],
          managers: []
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
      taskList = await prisma.taskList.findUnique({
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
