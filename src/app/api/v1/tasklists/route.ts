import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { loadTranslationsSync, t } from '@/lib/i18n'
import { parseCookies } from '@/lib/localeUtils'
import { getBestLocale } from '@/lib/i18n'
import { recalculateUserBudget } from '@/lib/budgetUtils'
import { calculateTaskEarnings, calculateBudgetConsumption, initializeRemainingBudget } from '@/lib/earningsUtils'

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

    return NextResponse.json({ taskLists })

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
    const { role, tasks, templateId, updateTemplate, name, budget, budgetPercentage, dueDate, create, collaborators } = body

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
      const blueprintTasks: any[] = Array.isArray((taskList as any).templateTasks) ? ((taskList as any).templateTasks as any[]) : (Array.isArray(taskList.tasks) ? (taskList.tasks as any[]) : [])

      const totalTasks = blueprintTasks.length || incomingTasks.length || 1
      
      // Get user's available balance for earnings calculation
      const userRecord = await prisma.user.findUnique({ where: { id: user.id } })
      
      // Calculate earnings for task completion
      const dateISO = (body.date || new Date().toISOString().split('T')[0]) as string
      const completionDate = new Date(dateISO)
      const earnings = calculateTaskEarnings({
        listRole: taskList.role,
        budgetPercentage: (taskList as any).budgetPercentage,
        listBudget: taskList.budget,
        userAvailableBalance: userRecord?.availableBalance,
        numTasks: totalTasks,
        date: completionDate
      })
      
      const perTaskEarnings = earnings.actionProfit

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

      // Build completedTasks map
      const year = Number(dateISO.split('-')[0])
      const priorCompleted = (taskList as any).completedTasks || {}
      const yearBucket = priorCompleted[year] || {}
      const dayArr: any[] = Array.isArray(yearBucket[dateISO]) ? yearBucket[dateISO] : []

      // Helpers to match tasks reliably even with localized names
      const getKey = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')) as string
      const byKey: Record<string, any> = {}
      dayArr.forEach((t: any) => {
        const key = getKey(t)
        byKey[key] = t
      })

      // For each incoming (localized) task, merge into completed map
      const justCompletedNames: string[] = Array.isArray(body.justCompletedNames) ? body.justCompletedNames : []
      const justUncompletedNames: string[] = Array.isArray(body.justUncompletedNames) ? body.justUncompletedNames : []
      const nameSet = new Set(justCompletedNames.map((s) => typeof s === 'string' ? s.toLowerCase() : s))

      for (const incoming of incomingTasks) {
        // Skip tasks that did not just transition to done in this interaction, if a filter is provided
        if (nameSet.size > 0) {
          const nm = typeof incoming?.name === 'string' ? incoming.name.toLowerCase() : ''
          if (!nameSet.has(nm)) continue
        }
        const key = getKey(incoming)
        if (!key) continue
        const existing = byKey[key]
        const prevCompletersLen = Array.isArray(existing?.completers) ? existing.completers.length : 0
        const newCount = nameSet.size > 0 ? prevCompletersLen + 1 : Number(incoming?.count || (incoming.status === 'Done' ? 1 : 0))
        const delta = Math.max(0, newCount - prevCompletersLen)
        if (delta <= 0) {
          // still ensure we copy the latest snapshot of the task if it wasn't present
          if (!existing && newCount > 0) {
            byKey[key] = sanitizeTask({ ...incoming, status: 'Done', completers: [] })
          }
          continue
        }

        const baseCompleters = Array.isArray(existing?.completers) ? existing.completers : []
        const appended: any[] = []
        for (let i = 0; i < delta; i++) {
          appended.push({ id: user.id, earnings: perTaskEarnings.toString(), time: prevCompletersLen + i + 1, completedAt: new Date() })
        }
        const taskRecord = sanitizeTask({
          ...(existing || {}),
          ...incoming,
          // Preserve the status from incoming task (may be 'Open' for partial completions or 'Done' for full)
          status: incoming.status || 'Done',
          completers: [...baseCompleters, ...appended]
        })
        byKey[key] = taskRecord
      }

      // Handle uncompletions: remove last completer for provided task names
      if (justUncompletedNames.length > 0) {
        const unNames = new Set(justUncompletedNames.map((s: string) => (s || '').toLowerCase()))
        const values = Object.values(byKey) as any[]
        for (const t of values) {
          const nm = typeof t?.name === 'string' ? t.name.toLowerCase() : ''
          if (!unNames.has(nm)) continue
          const comps: any[] = Array.isArray(t?.completers) ? [...t.completers] : []
          if (comps.length > 0) comps.pop()
          if (comps.length === 0) {
            // remove the entry entirely
            const k = getKey(t)
            if (k) delete (byKey as any)[k]
          } else {
            const k = getKey(t)
            if (k) (byKey as any)[k] = { ...t, status: 'Open', completers: comps, count: comps.length }
          }
        }
      }

      const nextDayArr = Object.values(byKey)
      const nextCompleted = {
        ...priorCompleted,
        [year]: { ...yearBucket, [dateISO]: nextDayArr }
      }

      // Update taskStatus in templateTasks to keep them in sync
      let updatedTemplateTasks = (taskList as any).templateTasks || (taskList as any).tasks || []
      updatedTemplateTasks = updatedTemplateTasks.map((task: any) => {
        const key = getKey(task)
        const incomingTask = incomingTasks.find((t: any) => getKey(t) === key)
        if (incomingTask && incomingTask.taskStatus) {
          return { ...task, taskStatus: incomingTask.taskStatus }
        }
        return task
      })

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
        newRemainingBudget = initializeRemainingBudget((taskList as any).remainingBudget, taskList.budget)
        // Calculate new remaining budget
        newRemainingBudget = calculateBudgetConsumption(newRemainingBudget, taskList.budget, totalTasks)
      }

      const saved = await prisma.taskList.update({
        where: { id: taskList.id },
        data: ({ 
          completedTasks: nextCompleted,
          templateTasks: updatedTemplateTasks,
          tasks: updatedTemplateTasks,
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

        // Handle completions
        if (justCompletedNames.length > 0) {
          // Prepare completed tasks to append
          const completedTasks = nextDayArr.filter((t: any) => {
            const nm = typeof t?.name === 'string' ? t.name.toLowerCase() : ''
            return justCompletedNames.some(jc => typeof jc === 'string' && jc.toLowerCase() === nm)
          })

          // Calculate total earnings from all new completers in this completion
          const numNewCompleters = justCompletedNames.length

          // Update daily entries
          if (isDailyRole && completedTasks.length > 0) {
            if (!updated[year].days[dateISO]) {
              updated[year].days[dateISO] = { year, date: dateISO, tasks: [] }
            }
            const existing = updated[year].days[dateISO].tasks || []
            const names = new Set(existing.map((t: any) => t.name))
            const toAppend = completedTasks.filter((t: any) => !names.has(t.name))

            // Add earnings for EVERY new completer, not just new tasks
            const currentPrize = parseFloat(updated[year].days[dateISO].prize || '0')
            const currentProfit = parseFloat(updated[year].days[dateISO].profit || '0')
            const currentEarnings = parseFloat(updated[year].days[dateISO].earnings || '0')

            // Add earnings based on number of completions, not number of new tasks
            const newPrize = currentPrize + (earnings.dailyPrize || 0) * numNewCompleters
            const newProfit = currentProfit + (earnings.dailyProfit || 0) * numNewCompleters
            const newEarnings = currentEarnings + (earnings.dailyEarnings || 0) * numNewCompleters

            updated[year].days[dateISO] = {
              ...updated[year].days[dateISO],
              tasks: toAppend.length > 0 ? [...existing, ...toAppend] : existing,
              prize: newPrize.toString(),
              profit: newProfit.toString(),
              earnings: newEarnings.toString()
            }
            entriesModified = true
          }

          // Update weekly entries
          if (isWeeklyRole && completedTasks.length > 0) {
            const week = getWeekNumber(completionDate)
            if (!updated[year].weeks[week]) {
              updated[year].weeks[week] = { year, week, tasks: [] }
            }
            const existing = updated[year].weeks[week].tasks || []
            const names = new Set(existing.map((t: any) => t.name))
            const toAppend = completedTasks.filter((t: any) => !names.has(t.name))

            // Add earnings for EVERY new completer, not just new tasks
            const currentPrize = parseFloat(updated[year].weeks[week].prize || '0')
            const currentProfit = parseFloat(updated[year].weeks[week].profit || '0')
            const currentEarnings = parseFloat(updated[year].weeks[week].earnings || '0')

            // Add earnings based on number of completions, not number of new tasks
            const newPrize = currentPrize + (earnings.weeklyPrize || 0) * numNewCompleters
            const newProfit = currentProfit + (earnings.weeklyProfit || 0) * numNewCompleters
            const newEarnings = currentEarnings + (earnings.weeklyEarnings || 0) * numNewCompleters

            updated[year].weeks[week] = {
              ...updated[year].weeks[week],
              tasks: toAppend.length > 0 ? [...existing, ...toAppend] : existing,
              prize: newPrize.toString(),
              profit: newProfit.toString(),
              earnings: newEarnings.toString()
            }
            entriesModified = true
          }

          // Update one-off entries (use full action earnings, no division)
          if (isOneOffRole && completedTasks.length > 0) {
            if (!updated[year].oneOffs[dateISO]) {
              updated[year].oneOffs[dateISO] = { year, date: dateISO, tasks: [] }
            }
            const existing = updated[year].oneOffs[dateISO].tasks || []
            const names = new Set(existing.map((t: any) => t.name))
            const toAppend = completedTasks.filter((t: any) => !names.has(t.name))

            // Add earnings for EVERY new completer, not just new tasks
            const currentPrize = parseFloat(updated[year].oneOffs[dateISO].prize || '0')
            const currentProfit = parseFloat(updated[year].oneOffs[dateISO].profit || '0')
            const currentEarnings = parseFloat(updated[year].oneOffs[dateISO].earnings || '0')

            // Use full action values (no division by 30 or 4), multiplied by number of completions
            const newPrize = currentPrize + (earnings.actionPrize || 0) * numNewCompleters
            const newProfit = currentProfit + (earnings.actionProfit || 0) * numNewCompleters
            const newEarnings = currentEarnings + (earnings.actionValuation || 0) * numNewCompleters

            updated[year].oneOffs[dateISO] = {
              ...updated[year].oneOffs[dateISO],
              tasks: toAppend.length > 0 ? [...existing, ...toAppend] : existing,
              prize: newPrize.toString(),
              profit: newProfit.toString(),
              earnings: newEarnings.toString()
            }
            entriesModified = true
          }
        }

        // Handle uncompletion - remove tasks from user entries and subtract earnings
        if (justUncompletedNames.length > 0) {
          const removeSet = new Set(justUncompletedNames.map((s: string) => typeof s === 'string' ? s.toLowerCase() : s))
          const numUncompletions = justUncompletedNames.length

          // Remove from daily entries and subtract earnings
          if (isDailyRole && updated[year]?.days?.[dateISO]) {
            const existing = updated[year].days[dateISO].tasks || []
            updated[year].days[dateISO].tasks = existing.filter((t: any) => !removeSet.has((t?.name || '').toLowerCase()))
            
            // Subtract earnings for each uncompletion
            const currentPrize = parseFloat(updated[year].days[dateISO].prize || '0')
            const currentProfit = parseFloat(updated[year].days[dateISO].profit || '0')
            const currentEarnings = parseFloat(updated[year].days[dateISO].earnings || '0')

            const newPrize = Math.max(0, currentPrize - (earnings.dailyPrize || 0) * numUncompletions)
            const newProfit = Math.max(0, currentProfit - (earnings.dailyProfit || 0) * numUncompletions)
            const newEarnings = Math.max(0, currentEarnings - (earnings.dailyEarnings || 0) * numUncompletions)

            updated[year].days[dateISO] = {
              ...updated[year].days[dateISO],
              prize: newPrize.toString(),
              profit: newProfit.toString(),
              earnings: newEarnings.toString()
            }
            entriesModified = true
          }

          // Remove from weekly entries and subtract earnings
          if (isWeeklyRole) {
            const week = getWeekNumber(completionDate)
            if (updated[year]?.weeks?.[week]) {
              const existing = updated[year].weeks[week].tasks || []
              updated[year].weeks[week].tasks = existing.filter((t: any) => !removeSet.has((t?.name || '').toLowerCase()))
              
              // Subtract earnings for each uncompletion
              const currentPrize = parseFloat(updated[year].weeks[week].prize || '0')
              const currentProfit = parseFloat(updated[year].weeks[week].profit || '0')
              const currentEarnings = parseFloat(updated[year].weeks[week].earnings || '0')

              const newPrize = Math.max(0, currentPrize - (earnings.weeklyPrize || 0) * numUncompletions)
              const newProfit = Math.max(0, currentProfit - (earnings.weeklyProfit || 0) * numUncompletions)
              const newEarnings = Math.max(0, currentEarnings - (earnings.weeklyEarnings || 0) * numUncompletions)

              updated[year].weeks[week] = {
                ...updated[year].weeks[week],
                prize: newPrize.toString(),
                profit: newProfit.toString(),
                earnings: newEarnings.toString()
              }
              entriesModified = true
            }
          }

          // Remove from one-off entries and subtract earnings
          if (isOneOffRole && updated[year]?.oneOffs?.[dateISO]) {
            const existing = updated[year].oneOffs[dateISO].tasks || []
            updated[year].oneOffs[dateISO].tasks = existing.filter((t: any) => !removeSet.has((t?.name || '').toLowerCase()))
            
            // Subtract earnings for each uncompletion (use full action values)
            const currentPrize = parseFloat(updated[year].oneOffs[dateISO].prize || '0')
            const currentProfit = parseFloat(updated[year].oneOffs[dateISO].profit || '0')
            const currentEarnings = parseFloat(updated[year].oneOffs[dateISO].earnings || '0')

            const newPrize = Math.max(0, currentPrize - (earnings.actionPrize || 0) * numUncompletions)
            const newProfit = Math.max(0, currentProfit - (earnings.actionProfit || 0) * numUncompletions)
            const newEarnings = Math.max(0, currentEarnings - (earnings.actionValuation || 0) * numUncompletions)

            updated[year].oneOffs[dateISO] = {
              ...updated[year].oneOffs[dateISO],
              prize: newPrize.toString(),
              profit: newProfit.toString(),
              earnings: newEarnings.toString()
            }
            entriesModified = true
          }
        }

        // Save updated entries if modified
        if (entriesModified) {
          await prisma.user.update({
            where: { id: userRecord.id },
            data: { entries: updated as any }
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
        closeOps.forEach((closeOp: any) => {
          const id = closeOp.id
          const count = closeOp.count
          const item = open.find((x: any) => x.id === id)
          open = open.filter((x: any) => x.id !== id)
          if (item) closed = [ { ...item, status: 'Done', count: count || item.count, completedAt: new Date().toISOString() }, ...closed ]
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
            // Remove completedAt and reset status when reopening
            const { completedAt, ...taskWithoutCompletedAt } = item
            open = [{ ...taskWithoutCompletedAt, status: 'Open', count: count !== undefined ? count : (item.count || 0) }, ...open]
          }
        })
      }

      const saved = await prisma.taskList.update({
        where: { id: taskList.id },
        data: ({ ephemeralTasks: { open, closed } } as any)
      })

      return NextResponse.json({ taskList: saved })
    }

    // Update task status in templateTasks or ephemeralTasks
    if (body.updateTaskStatus && body.taskListId) {
      const taskList = await prisma.taskList.findUnique({ where: { id: body.taskListId } })
      if (!taskList) return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })

      const taskKey = body.taskKey // id, localeKey, or name
      const newStatus = body.taskStatus

      // Update task status in templateTasks
      let templateTasks = Array.isArray((taskList as any).templateTasks) 
        ? (taskList as any).templateTasks 
        : (Array.isArray(taskList.tasks) ? taskList.tasks : [])

      let taskFoundInTemplate = false
      templateTasks = templateTasks.map((task: any) => {
        const key = task?.id || task?.localeKey || task?.name
        if (key === taskKey) {
          taskFoundInTemplate = true
          return { ...task, taskStatus: newStatus }
        }
        return task
      })

      // Also check and update ephemeral tasks
      let ephemeralTasks = (taskList as any).ephemeralTasks || { open: [], closed: [] }
      let open = Array.isArray(ephemeralTasks.open) ? ephemeralTasks.open : []
      let closed = Array.isArray(ephemeralTasks.closed) ? ephemeralTasks.closed : []

      // Update status in open ephemeral tasks
      open = open.map((task: any) => {
        const key = task?.id || task?.localeKey || task?.name
        if (key === taskKey) {
          return { ...task, taskStatus: newStatus }
        }
        return task
      })

      // Also update status in closed ephemeral tasks
      closed = closed.map((task: any) => {
        const key = task?.id || task?.localeKey || task?.name
        if (key === taskKey) {
          return { ...task, taskStatus: newStatus }
        }
        return task
      })

      ephemeralTasks = { open, closed }

      const updated = await prisma.taskList.update({
        where: { id: taskList.id },
        data: {
          templateTasks: templateTasks,
          tasks: templateTasks,
          ephemeralTasks: ephemeralTasks,
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
          budget: typeof budget !== 'undefined' ? budget : existingById.budget,
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
          budget: budget,
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
          budget: budget ?? existingTaskList.budget,
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
          budget: budget,
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
