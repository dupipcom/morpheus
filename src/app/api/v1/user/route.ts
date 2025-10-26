import prisma from "@/lib/prisma";
import { currentUser, auth } from '@clerk/nextjs/server'
import { getWeekNumber } from "@/app/helpers"
import { WEEKLY_ACTIONS, DAILY_ACTIONS } from "@/app/constants"
import { safeUpdateWeekEntry, safeUpdateDayEntry, validateWeekData, validateDayData, logEntryData, ensureWeekDataIntegrity, ensureDayDataIntegrity, addEphemeralTaskToDay, addEphemeralTaskToWeek, updateEphemeralTaskInDay, updateEphemeralTaskInWeek, removeEphemeralTaskFromDay, removeEphemeralTaskFromWeek, calculateDayTicker, calculateWeekTicker, calculateDayTickers, calculateWeekTickers } from "@/lib/entryUtils"

export async function GET(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = await auth()

  // Check if user is authenticated
  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  const getUser = async () => await prisma.user.findUnique({
       where: { userId },
       include: { profile: true }
    })

  let user = await getUser()

  // If user doesn't exist in database, create them
  if (!user) {
    user = await prisma.user.create({
      data: {
        userId,
        entries: {},
        settings: {
          dailyTemplate: [],
          weeklyTemplate: []
        }
      },
      include: { profile: true }
    })
  }

  // Always sync username from Clerk if available - Clerk takes precedence
  try {
    const clerkUser = await currentUser()
    if (clerkUser && clerkUser.username && user) {
      if (user.profile) {
        // Always update existing profile with Clerk username (overwrites any manual username)
        await prisma.profile.update({
          where: { userId: user.id },
          data: { userName: clerkUser.username }
        })
      } else {
        // Create new profile with Clerk username
        await prisma.profile.create({
          data: {
            userId: user.id,
            userName: clerkUser.username,
            firstNameVisible: false,
            lastNameVisible: false,
            userNameVisible: false,
            bioVisible: false,
            profilePictureVisible: false,
            publicChartsVisible: false,
          }
        })
      }
      // Refetch user with updated profile
      user = await getUser()
    }
  } catch (error) {
    console.error('Error syncing username from Clerk:', error)
  }

  return Response.json(user)
}

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = await auth()
  const data = await req.json()

  // Check if user is authenticated
  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  const getUser = async () => await prisma.user.findUnique({
       where: { userId }
    })

  let user = await getUser()

  // If user doesn't exist in database, create them
  if (!user) {
    // Find the default templates
    const dailyDefaultTemplate = await prisma.template.findFirst({
      where: { role: 'daily.default' }
    })
    
    const weeklyDefaultTemplate = await prisma.template.findFirst({
      where: { role: 'weekly.default' }
    })
    
    user = await prisma.user.create({
      data: {
        userId,
        entries: {},
        settings: {
          dailyTemplate: dailyDefaultTemplate?.id || null,
          weeklyTemplate: weeklyDefaultTemplate?.id || null
        }
      }
    })
  }

  // Update lastLogin timestamp if requested
  if (data?.lastLogin === true) {
    await prisma.user.update({
      // Cast to any to tolerate generated client lag before prisma generate
      data: ({
        lastLogin: new Date()
      } as any),
      where: { id: (user as any).id },
    })
    user = await getUser()
  }

  const fullDate = data?.date ? new Date(data?.date) : new Date()

  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const month = Number(date.split('-')[1])
  const day = Number(date.split('-')[2])
  const weekNumber = getWeekNumber(fullDate)[1]

  if (data.availableBalance) {
    const newAvailableBalance = data.availableBalance
    const currentStash = parseFloat(user.stash || "0")
    const newEquity = (parseFloat(newAvailableBalance) - currentStash).toString()
    
    await prisma.user.update({
      data: {
        availableBalance: newAvailableBalance,
        equity: newEquity
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  if (!user.entries) {
    await prisma.user.update({
      data: {
        entries: {},
      },
      where: { id: user.id }, 
    })
    user = await getUser()
  }

  // Ensure user has template references
  if (!user.settings?.weeklyTemplate || !user.settings?.dailyTemplate) {
    // Find the default templates
    const dailyDefaultTemplate = await prisma.template.findFirst({
      where: { role: 'daily.default' }
    })
    
    const weeklyDefaultTemplate = await prisma.template.findFirst({
      where: { role: 'weekly.default' }
    })
    
    await prisma.user.update({
      data: {
        settings: {
          ...user?.settings,
          dailyTemplate: dailyDefaultTemplate?.id || null,
          weeklyTemplate: weeklyDefaultTemplate?.id || null
        }
      },
      where: { id: user.id }, 
    })
    user = await getUser()
  }

  // Helper function to get template tasks
  const getTemplateTasks = async (templateId) => {
    if (!templateId) return []
    const template = await prisma.template.findUnique({
      where: { id: templateId }
    })
    return template?.tasks || []
  }

  if (!user.entries[year]) {
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              days: {},
              weeks: {}
            },
          }
        },
      where: { id: user.id }, 
    })
    user = await getUser()
  }

  if (!user.entries[year].weeks[weekNumber]) {
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              weeks: {
                ...user.entries[year].weeks,
                [weekNumber]: {
                  ...user.entries[year].weeks[weekNumber],
                  year,
                  week: weekNumber,
                  status: "Open"
                }
              }
            },
          },
        },
      where: { id: user.id }, 
    })
    user = await getUser()
  }

  if (!user.entries[year].days[date]) {
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              days: {
                ...user.entries[year].days,
                [date]: {
                  year,
                  week: weekNumber,
                  month,
                  day,
                  date,
                  status: "Open",
                  moodAverage: 0,
                  mood: {
                    gratitude: 0,
                    optimism: 0,
                    restedness: 0,
                    tolerance: 0,
                    selfEsteem: 0,
                    trust: 0,
                  }
                }
              }
            },
          }
      },
      where: { id: user.id }, 
    })
    user = await getUser()
  }

  const dayTasks = data?.dayActions || user?.entries[year].days[date].tasks
  const weekTasks = data?.weekActions || user?.entries[year].weeks[weekNumber].tasks

  const dayDone = dayTasks?.filter((action) => action.status === "Done")
  const weekDone = weekTasks?.filter((action) => action.status === "Done")

  const dayProgress = dayTasks?.length ? dayDone.length / dayTasks.length : 0
  const weekProgress = weekTasks?.length ? weekDone.length / weekTasks.length : 0

    if(data?.mood) {
      if(user?.entries[year].days[date].mood) {
        user = {
          ...user,
          entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              days: {
                ...user.entries[year].days,
                [date]: {
                  ...user.entries[year].days[date],
                  mood: {
                    ...user.entries[year].days[date].mood,
                    ...data.mood
                  }
                }
              }
            }
          }
        }
      }
    }


  const moodValues = user?.entries[year].days[date].mood  ? Object.values(user?.entries[year].days[date].mood ).filter(val => val !== null && val !== undefined && !isNaN(val)) : [0]


  const dayMoodAverage = moodValues.length > 0 ? moodValues.reduce((acc,cur) => acc + cur, 0) / moodValues.length : 0

  const wantBudget = Number(user?.settings?.monthsFixedIncome) + Number(user?.settings?.monthsVariableIncome) - Number(user?.settings?.monthsNeedFixedExpenses) - Number(user?.settings?.monthsNeedVariableExpenses)

  const weekMoodValues = Object.values(user?.entries[year].days).length ? Object.values(user?.entries[year].days).sort().splice(0, 7).map((day) => {
    return Object.values(day?.mood)?.length ? Object.values(day?.mood).filter(val => val !== null && val !== undefined && !isNaN(val)) : [0].flat() 
    }).flat()
  : [0]

  const weekMoodAverage = weekMoodValues.length > 0 ? weekMoodValues.reduce((acc, cur) => Number(acc) + Number(cur), 0) / weekMoodValues.length : 0

  const userEquity = Number(user?.equity) || 0
  const dayEarnings = ((5 - dayMoodAverage)) * 0.2 + ((dayProgress * 0.80)) * userEquity / 30
  const weekEarnings = ((5 - weekMoodAverage)) * 0.2 + ((weekProgress * 0.80)) * userEquity / 4

  // List-scoped task updates: when a taskListKey is provided, write under entries[year][name+id]
  if ((data.taskListKey && (data.weekActions?.length || data.dayActions?.length)) && user) {
    const entries = user.entries as any
    const listKey = String(data.taskListKey)

    let updatedEntries = { ...entries }

    // Ensure year bucket
    if (!updatedEntries[year]) {
      updatedEntries[year] = { days: {}, weeks: {} }
    }

    // Ensure list bucket
    if (!updatedEntries[year][listKey]) {
      updatedEntries[year][listKey] = {}
    }

    // Try to resolve TaskList for earnings calculation (budget / task number)
    let perTaskEarnings = 0
    try {
      const maybeListId = listKey.split("__").pop()
      if (maybeListId) {
        const listRecord = await prisma.taskList.findUnique({ where: { id: maybeListId } })
        if (listRecord) {
          const listBudget = parseFloat(listRecord.budget || "0")
          const numTasks = (Array.isArray(listRecord.tasks) && listRecord.tasks.length) ? listRecord.tasks.length : ((data.dayActions?.length || data.weekActions?.length) || 1)
          perTaskEarnings = numTasks > 0 ? (listBudget / numTasks) : 0
        }
      }
    } catch (e) {
      // ignore earnings calc errors; default stays 0
    }

    const addCompletionsFor = (scopeKey: string, tasksWithContacts: any[], scopeId: string | number) => {
      // Prepare completions bucket under entries[year][listKey].completions[year][date]
      const listScope = updatedEntries[year][listKey]
      const completions = (listScope.completions || {})
      const yearBucket = (completions[year] || {})
      const dateKey = date
      const existingCompletionsArr: any[] = Array.isArray(yearBucket[dateKey]) ? yearBucket[dateKey] : []

      // Previous tasks to detect delta by name/id
      const prevTasks: any[] = (listScope?.[scopeKey]?.tasks) || []

      const toAppend: any[] = []
      for (const task of tasksWithContacts) {
        const identifier = task.id || task.name
        const prev = prevTasks.find((t: any) => (t.id && task.id ? t.id === task.id : t.name === task.name))
        const prevCount = Number(prev?.count || 0)
        const newCount = Number(task?.count || (task.status === "Done" ? 1 : 0))
        const delta = Math.max(0, newCount - prevCount)
        if (delta > 0) {
          for (let i = 0; i < delta; i++) {
            toAppend.push({
              ...task,
              times: Number(task?.times || 0) + 1,
              user: user.id,
              earnings: perTaskEarnings.toString()
            })
          }
        }
      }

      if (toAppend.length > 0) {
        updatedEntries[year][listKey] = {
          ...listScope,
          completions: {
            ...completions,
            [year]: {
              ...yearBucket,
              [dateKey]: [...existingCompletionsArr, ...toAppend]
            }
          },
          [scopeKey]: {
            ...(listScope?.[scopeKey] || {}),
            tasks: (tasksWithContacts || []).sort((a: any, b: any) => (a.status === "Done" ? 1 : -1))
          }
        }
      } else {
        updatedEntries[year][listKey] = {
          ...listScope,
          [scopeKey]: {
            ...(listScope?.[scopeKey] || {}),
            tasks: (tasksWithContacts || []).sort((a: any, b: any) => (a.status === "Done" ? 1 : -1))
          }
        }
      }
    }

    // Apply week-scoped tasks under list key (name+id)
    if (data.weekActions?.length) {
      const tasksWithContacts = data.weekActions.map((task: any) => ({
        ...task,
        contacts: data.taskContacts?.[task.name] || [],
        things: data.taskThings?.[task.name] || []
      }))
      const scopeId = (data.week ?? weekNumber)
      // Ensure the scope container exists before reading prev
      updatedEntries[year][listKey] = {
        ...updatedEntries[year][listKey],
        [scopeId]: {
          ...(updatedEntries[year][listKey]?.[scopeId] || {})
        }
      }
      addCompletionsFor(scopeId as any, tasksWithContacts, scopeId)
    }

    // Apply day-scoped tasks under list key (name+id)
    if (data.dayActions?.length) {
      const tasksWithContacts = data.dayActions.map((task: any) => ({
        ...task,
        contacts: data.taskContacts?.[task.name] || [],
        things: data.taskThings?.[task.name] || []
      }))
      // Ensure the scope container exists before reading prev
      updatedEntries[year][listKey] = {
        ...updatedEntries[year][listKey],
        [date]: {
          ...(updatedEntries[year][listKey]?.[date] || {})
        }
      }
      addCompletionsFor(date, tasksWithContacts, date)
    }

    await prisma.user.update({
      data: { entries: updatedEntries },
      where: { id: user.id },
    })
    user = await getUser()
  }

  if (data.weekActions?.length && user && !data.taskListKey) {
    // Add contacts to tasks if provided
    const entries = user.entries as any
    const tasksWithContacts = data.weekActions.map((task: any) => ({
      ...task,
      contacts: data.taskContacts?.[task.name] || [],
      things: data.taskThings?.[task.name] || []
    }))

    // Calculate ticker values for the week
    const availW = parseFloat(user.availableBalance || "0")
    const weekTickerSingle = calculateWeekTicker(entries, year, data.week, weekEarnings, availW)
    const weekTickerObj = calculateWeekTickers(entries, year, data.week, weekEarnings, availW, date)

    await prisma.user.update({
      data: {
        entries: {
            ...entries,
            [year]: {
              ...entries[year],
              weeks: {
                ...entries[year]?.weeks,
                [data.week]: {
                  ...entries[year]?.weeks?.[data.week],
                  year,
                  week: data.week,
                  earnings: weekEarnings,
                  ticker: { ...weekTickerObj },
                  tickerLegacy: weekTickerSingle,
                  status: "Open",
                  progress: weekProgress,
                  done: weekDone.length,
                  tasksNumber: weekTasks.length,
                  availableBalance: user.availableBalance,
                  contacts: data.weekContacts || []
                }
              }
          }
        },
      },
      where: { id: user.id },
    })
    user = await getUser()
  } else if (data.weekActions && !data.taskListKey) {
    // Calculate ticker values for the week
    const availW2 = parseFloat(user.availableBalance || "0")
    const weekTickerSingle2 = calculateWeekTicker(user.entries, year, data.week, weekEarnings, availW2)
    const weekTickerObj2 = calculateWeekTickers(user.entries, year, data.week, weekEarnings, availW2, date)
    
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              weeks: {
                ...user.entries[year].weeks,
                [data.week]: {
                  ...user.entries[year].weeks[data.week],
                  year,
                  week: data.week,
                  earnings: weekEarnings,
                  ticker: { ...weekTickerObj2 },
                  tickerLegacy: weekTickerSingle2,
                  status: "Open",
                  progress: weekProgress,
                  done: weekDone.length,
                  tasksNumber: weekTasks.length,
                  availableBalance: user.availableBalance
                }
              }
          }
        },
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  // Append only the tasks that were just completed to week entry (without replacing others)
  if (Array.isArray(data.weekTasksAppend) && data.weekTasksAppend.length && user) {
    const entries = user.entries as any
    const week = data.week || weekNumber
    const rolePrefix = typeof data.listRole === 'string' ? String(data.listRole).split('.')[0] : 'weekly'
    const ensureWeek = (e: any) => {
      const copy = { ...(e || {}) }
      if (!copy[year]) copy[year] = { days: {}, weeks: {} }
      if (!copy[year].weeks) copy[year].weeks = {}
      if (!copy[year].months) copy[year].months = {}
      if (!copy[year].quarters) copy[year].quarters = {}
      if (!copy[year].semesters) copy[year].semesters = {}
      if (!copy[year].oneOffs) copy[year].oneOffs = {}
      if (!copy[year].year) copy[year].year = { tasks: [] }
      if (!copy[year].weeks[week]) copy[year].weeks[week] = { year, week, tasks: [] }
      if (!Array.isArray(copy[year].weeks[week].tasks)) copy[year].weeks[week].tasks = []
      return copy
    }
    const updated = ensureWeek(entries)
    const existing = entries[year]?.weeks[week]?.tasks as any[] || []
    const names = new Set(existing.map((t:any) => t.name))
    const toAppend = data.weekTasksAppend.filter((t:any) => !names.has(t.name))
    console.log({ entries: entries[year]?.weeks[week]?.tasks })
    if (toAppend.length > 0) {
      // Route based on role prefix
      if (rolePrefix === 'weekly') {
        updated[year].weeks[week] = {
          ...updated[year].weeks[week],
          tasks: [...existing, ...toAppend]
        }
      } else if (rolePrefix === 'monthly') {
        const monthNum = Number(String(date).split('-')[1])
        const ex = (updated[year].months[monthNum]?.tasks || [])
        updated[year].months[monthNum] = { year, month: monthNum, tasks: [...ex, ...toAppend] }
      } else if (rolePrefix === 'quarterly') {
        const monthNum = Number(String(date).split('-')[1])
        const quarter = Math.ceil(monthNum / 3)
        const ex = (updated[year].quarters[quarter]?.tasks || [])
        updated[year].quarters[quarter] = { year, quarter, tasks: [...ex, ...toAppend] }
      } else if (rolePrefix === 'semester') {
        const monthNum = Number(String(date).split('-')[1])
        const semester = monthNum <= 6 ? 1 : 2
        const ex = (updated[year].semesters[semester]?.tasks || [])
        updated[year].semesters[semester] = { year, semester, tasks: [...ex, ...toAppend] }
      } else if (rolePrefix === 'yearly') {
        const ex = (updated[year].year?.tasks || [])
        updated[year].year = { year, tasks: [...ex, ...toAppend] }
      } else if (rolePrefix === 'one-off' || rolePrefix === 'oneoff' || rolePrefix === 'oneoff') {
        const key = String(date)
        const ex = (updated[year].oneOffs[key]?.tasks || [])
        updated[year].oneOffs[key] = { year, date: key, tasks: [...ex, ...toAppend] }
      } else {
        updated[year].weeks[week] = {
          ...updated[year].weeks[week],
          tasks: [...existing, ...toAppend]
        }
      }
      await prisma.user.update({
        data: { entries: updated },
        where: { id: user.id },
      })
      user = await getUser()
    }
  }

  // Remove tasks by name from week entry
  if (Array.isArray(data.weekTasksRemoveNames) && data.weekTasksRemoveNames.length && user) {
    const entries = user.entries as any
    const week = data.week || weekNumber
    const y = year
    const removeSet = new Set((data.weekTasksRemoveNames as any[]).map((s:any) => typeof s === 'string' ? s.toLowerCase() : s))
    const updated = { ...(entries || {}) }
    if (!updated[y]) updated[y] = { days: {}, weeks: {} }
    if (!updated[y].weeks) updated[y].weeks = {}
    if (!updated[y].weeks[week]) updated[y].weeks[week] = { tasks: [], earnings: '', date: '', status: 'Open', days: [] }
    const existing = Array.isArray(updated[y].weeks[week].tasks) ? updated[y].weeks[week].tasks : []
    updated[y].weeks[week].tasks = existing.filter((t:any) => !removeSet.has((t?.name || '').toLowerCase()))
    await prisma.user.update({ where: { id: user.id }, data: { entries: updated as any } })
  }

  // Append only the tasks that were just completed to day entry (without replacing others)
  if (Array.isArray(data.dayTasksAppend) && data.dayTasksAppend.length && user) {
    const entries = user.entries as any
    const dateISO = data.date || date
    const y = Number(String(dateISO).split('-')[0])
    const rolePrefix = typeof data.listRole === 'string' ? String(data.listRole).split('.')[0] : 'daily'
    const ensureDay = (e: any) => {
      const copy = { ...(e || {}) }
      if (!copy[y]) copy[y] = { days: {}, weeks: {} }
      if (!copy[y].days) copy[y].days = {}
      if (!copy[y].weeks) copy[y].weeks = {}
      if (!copy[y].months) copy[y].months = {}
      if (!copy[y].quarters) copy[y].quarters = {}
      if (!copy[y].semesters) copy[y].semesters = {}
      if (!copy[y].oneOffs) copy[y].oneOffs = {}
      if (!copy[y].year) copy[y].year = { tasks: [] }
      if (!copy[y].days[dateISO]) copy[y].days[dateISO] = { year: y, date: dateISO, tasks: [] }
      if (!Array.isArray(copy[y].days[dateISO].tasks)) copy[y].days[dateISO].tasks = []
      return copy
    }
    const updated = ensureDay(entries)
    const existing = updated[y].days[dateISO].tasks as any[]
    const names = new Set(existing.map((t:any) => t.name))
    const toAppend = data.dayTasksAppend.filter((t:any) => t.status === 'Done' && !names.has(t.name))
    if (toAppend.length > 0) {
      if (rolePrefix === 'daily') {
        updated[y].days[dateISO] = {
          ...updated[y].days[dateISO],
          tasks: [...existing, ...toAppend]
        }
      } else if (rolePrefix === 'weekly') {
        const w = getWeekNumber(new Date(dateISO))[1]
        const ex = (updated[y].weeks[w]?.tasks || [])
        updated[y].weeks[w] = { year: y, week: w, tasks: [...ex, ...toAppend] }
      } else if (rolePrefix === 'monthly') {
        const monthNum = Number(String(dateISO).split('-')[1])
        const ex = (updated[y].months[monthNum]?.tasks || [])
        updated[y].months[monthNum] = { year: y, month: monthNum, tasks: [...ex, ...toAppend] }
      } else if (rolePrefix === 'quarterly') {
        const monthNum = Number(String(dateISO).split('-')[1])
        const quarter = Math.ceil(monthNum / 3)
        const ex = (updated[y].quarters[quarter]?.tasks || [])
        updated[y].quarters[quarter] = { year: y, quarter, tasks: [...ex, ...toAppend] }
      } else if (rolePrefix === 'semester') {
        const monthNum = Number(String(dateISO).split('-')[1])
        const semester = monthNum <= 6 ? 1 : 2
        const ex = (updated[y].semesters[semester]?.tasks || [])
        updated[y].semesters[semester] = { year: y, semester, tasks: [...ex, ...toAppend] }
      } else if (rolePrefix === 'yearly') {
        const ex = (updated[y].year?.tasks || [])
        updated[y].year = { year: y, tasks: [...ex, ...toAppend] }
      } else if (rolePrefix === 'one-off' || rolePrefix === 'oneoff') {
        const key = String(dateISO)
        const ex = (updated[y].oneOffs[key]?.tasks || [])
        updated[y].oneOffs[key] = { year: y, date: key, tasks: [...ex, ...toAppend] }
      } else {
        updated[y].days[dateISO] = {
          ...updated[y].days[dateISO],
          tasks: [...existing, ...toAppend]
        }
      }
      await prisma.user.update({
        data: { entries: updated },
        where: { id: user.id },
      })
      user = await getUser()
    }
  }

  // Remove tasks by name from day entry
  if (Array.isArray(data.dayTasksRemoveNames) && data.dayTasksRemoveNames.length && user) {
    const entries = user.entries as any
    const dateISO = data.date || date
    const y = Number(String(dateISO).split('-')[0])
    const rolePrefix = typeof data.listRole === 'string' ? String(data.listRole).split('.')[0] : 'daily'
    const removeSet = new Set((data.dayTasksRemoveNames as any[]).map((s:any) => typeof s === 'string' ? s.toLowerCase() : s))
    const updated = { ...(entries || {}) }
    if (!updated[y]) updated[y] = { days: {}, weeks: {} }
    if (rolePrefix === 'daily') {
      if (!updated[y].days) updated[y].days = {}
      if (!updated[y].days[dateISO]) updated[y].days[dateISO] = { tasks: [], earnings: '', date: dateISO, status: 'Open' }
      const existing = Array.isArray(updated[y].days[dateISO].tasks) ? updated[y].days[dateISO].tasks : []
      updated[y].days[dateISO].tasks = existing.filter((t:any) => !removeSet.has((t?.name || '').toLowerCase()))
    } else if (rolePrefix === 'weekly') {
      const week = data.week || getWeekNumber(new Date(dateISO))[1]
      if (!updated[y].weeks) updated[y].weeks = {}
      if (!updated[y].weeks[week]) updated[y].weeks[week] = { tasks: [], earnings: '', date: '', status: 'Open', days: [] }
      const existing = Array.isArray(updated[y].weeks[week].tasks) ? updated[y].weeks[week].tasks : []
      updated[y].weeks[week].tasks = existing.filter((t:any) => !removeSet.has((t?.name || '').toLowerCase()))
    }
    await prisma.user.update({ where: { id: user.id }, data: { entries: updated as any } })
  }

  if (data?.availableBalance) {
    // Calculate ticker values for current day and week and multi-horizon tickers
    const avail = parseFloat(data.availableBalance)
    const dayTickerSingle = calculateDayTicker(user.entries, year, date, dayEarnings, avail)
    const weekTickerSingle = calculateWeekTicker(user.entries, year, weekNumber, weekEarnings, avail)
    const dayTickerObj = calculateDayTickers(user.entries, year, date, dayEarnings, avail)
    const weekTickerObj = calculateWeekTickers(user.entries, year, weekNumber, weekEarnings, avail, date)
    
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              days: {
                ...user.entries[year].days,
                [date]: {
                  ...user.entries[year].days[date],
                  earnings: dayEarnings,
                  ticker: { ...dayTickerObj },
                  tickerLegacy: dayTickerSingle,
                  availableBalance: data.availableBalance,
                }
              },
              weeks: {
                ...user.entries[year].weeks,
                [weekNumber]: {
                  ...user.entries[year].weeks[weekNumber],
                  earnings: weekEarnings,
                  ticker: { ...weekTickerObj },
                  tickerLegacy: weekTickerSingle,
                  availableBalance: data.availableBalance,
                }
              }
            }
          }
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  if (data.dayActions?.length && user && !data.taskListKey) {
    // Add contacts to tasks if provided
    const entries = user.entries as any
    const tasksWithContacts = data.dayActions.map((task: any) => ({
      ...task,
      contacts: data.taskContacts?.[task.name] || [],
      things: data.taskThings?.[task.name] || []
    }))

    // Calculate ticker values for the day
    const availD = parseFloat(user.availableBalance || "0")
    const dayTickerSingle = calculateDayTicker(entries, year, date, dayEarnings, availD)
    const dayTickerObj = calculateDayTickers(entries, year, date, dayEarnings, availD)
    // Also recalc week blended tickers so week horizons reflect daily changes
    const weekTickerSingleBlend = calculateWeekTicker(entries, year, weekNumber, weekEarnings, availD)
    const weekTickerObjBlend = calculateWeekTickers(entries, year, weekNumber, weekEarnings, availD, date, { dateISO: date, earnings: dayEarnings, availableBalance: availD })

    await prisma.user.update({
      data: {
        entries: {
            ...entries,
            [year]: {
              ...entries[year],
              days: {
                ...entries[year]?.days,
                [date]: {
                  ...entries[year]?.days?.[date],
                  year,
                  week: weekNumber,
                  month,
                  day,
                  earnings: dayEarnings,
                  ticker: { ...dayTickerObj },
                  tickerLegacy: dayTickerSingle,
                  progress: dayProgress,
                  done: dayDone.length,
                  status: "Open",
                  availableBalance: user.availableBalance,
                  contacts: data.dayContacts || entries[year]?.days?.[date]?.contacts || []
                }
              },
              weeks: {
                ...entries[year]?.weeks,
                [weekNumber]: {
                  ...entries[year]?.weeks?.[weekNumber],
                  earnings: weekEarnings,
                  ticker: { ...weekTickerObjBlend },
                  tickerLegacy: weekTickerSingleBlend,
                  availableBalance: user.availableBalance,
                }
              }
            }
          }
      },
      where: { id: user.id },
    })
    user = await getUser()
  } else if (data.dayActions && !data.taskListKey) {
    // Calculate ticker values for the day
    const availD2 = parseFloat(user.availableBalance || "0")
    const dayTickerSingle2 = calculateDayTicker(user.entries, year, date, dayEarnings, availD2)
    const dayTickerObj2 = calculateDayTickers(user.entries, year, date, dayEarnings, availD2)
    // Also recalc week blended tickers so week horizons reflect daily changes
    const weekTickerSingleBlend2 = calculateWeekTicker(user.entries, year, weekNumber, weekEarnings, availD2)
    const weekTickerObjBlend2 = calculateWeekTickers(user.entries, year, weekNumber, weekEarnings, availD2, date, { dateISO: date, earnings: dayEarnings, availableBalance: availD2 })
    
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              days: {
                ...user.entries[year].days,
                [date]: {
                  ...user.entries[year].days[date],
                  year,
                  week: weekNumber,
                  month,
                  day,
                  earnings: dayEarnings,
                  ticker: { ...dayTickerObj2 },
                  tickerLegacy: dayTickerSingle2,
                  progress: dayProgress,
                  done: dayDone.length,
                  tasksNumber: dayTasks.length,
                  status: "Open",
                  availableBalance: user.availableBalance
                }
              },
              weeks: {
                ...user.entries[year].weeks,
                [weekNumber]: {
                  ...user.entries[year].weeks[weekNumber],
                  earnings: weekEarnings,
                  ticker: { ...weekTickerObjBlend2 },
                  tickerLegacy: weekTickerSingleBlend2,
                  availableBalance: user.availableBalance,
                }
              }
            }
          }
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  // Handle task contacts and things updates (when sent separately from actions)
  if ((data?.taskContacts || data?.taskThings) && !data?.dayActions && !data?.weekActions && user) {
    // Update day taskContacts and taskThings if date is provided
    if (data.date) {
      const entries = user.entries as any
      const currentDayEntry = entries?.[year]?.days?.[date] || {}
      
      await prisma.user.update({
        data: {
          entries: {
            ...entries,
            [year]: {
              ...entries[year],
              days: {
                ...entries[year]?.days,
                [date]: {
                  ...currentDayEntry,
                  taskContacts: data.taskContacts || currentDayEntry.taskContacts || {},
                  taskThings: data.taskThings || currentDayEntry.taskThings || {}
                }
              }
            }
          }
        },
        where: { id: user.id },
      })
      user = await getUser()
    }
    
    // Update week taskContacts and taskThings if week is provided
    if (data.week) {
      const entries = user.entries as any
      const currentWeekEntry = entries?.[year]?.weeks?.[data.week] || {}
      
      await prisma.user.update({
        data: {
          entries: {
            ...entries,
            [year]: {
              ...entries[year],
              weeks: {
                ...entries[year]?.weeks,
                [data.week]: {
                  ...currentWeekEntry,
                  taskContacts: data.taskContacts || currentWeekEntry.taskContacts || {},
                  taskThings: data.taskThings || currentWeekEntry.taskThings || {}
                }
              }
            }
          }
        },
        where: { id: user.id },
      })
      user = await getUser()
    }
  }

  if (data?.mood) {
    const key = Object.keys(data.mood)[0]
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              days: {
                ...user.entries[year].days,
                [date]: {
                  ...user.entries[year].days[date],
                  mood: {
                    ...user.entries[year].days[date].mood,
                    [key]: data.mood[key]
                  },
                  contacts: data.moodContacts ?? user.entries[year].days[date].contacts ?? [],
                  things: data.moodThings ?? user.entries[year].days[date].things ?? [],
                  lifeEvents: data.moodLifeEvents ?? user.entries[year].days[date].lifeEvents ?? [],
                  moodAverage: dayMoodAverage
                }
              },
              weeks: {
                ...user.entries[year].weeks,
                [weekNumber]: {
                  ...user.entries[year].weeks[weekNumber],
                  moodAverage: weekMoodAverage
                }
              }
            }
          }
        },
      where: { id: user.id },
    })
    user = await getUser()
  }

  if ((data?.moodContacts || data?.moodThings || data?.moodLifeEvents) && !data?.mood && !data?.text) {
    // Handle mood contacts, things, and life events only (when field is 'contacts', 'things', or 'lifeEvents')
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              days: {
                ...user.entries[year].days,
                [date]: {
                  ...user.entries[year].days[date],
                  contacts: data.moodContacts ?? user.entries[year].days[date].contacts ?? [],
                  things: data.moodThings ?? user.entries[year].days[date].things ?? [],
                  lifeEvents: data.moodLifeEvents ?? user.entries[year].days[date].lifeEvents ?? []
                }
              }
            }
          }
        },
      where: { id: user.id },
    })
    user = await getUser()
  }

  if (data?.text) {
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              days: {
                ...user.entries[year].days,
                [date]: {
                  ...user.entries[year].days[date],
                  text: data?.text,
                  contacts: data.moodContacts ?? user.entries[year].days[date].contacts ?? [],
                  things: data.moodThings ?? user.entries[year].days[date].things ?? [],
                  lifeEvents: data.moodLifeEvents ?? user.entries[year].days[date].lifeEvents ?? [],
                  moodAverage: dayMoodAverage
                }
              },
              weeks: {
                ...user.entries[year].weeks,
                [weekNumber]: {
                  ...user.entries[year].weeks[weekNumber],
                  moodAverage: weekMoodAverage
                }
              }
            }
          }
        },
      where: { id: user.id },
    })
    user = await getUser()
  }

  if (data?.daysToClose) {
    for (const date of data?.daysToClose) {
      const year = Number(date.split('-')[0])
      
      // Log current state for debugging
      logEntryData(user.entries, year, undefined, date)
      
      // Get current day data
      const currentDayData = user.entries?.[year]?.days?.[date] || {}
      
      // Ensure day data integrity before closing
      const integrityDayData = ensureDayDataIntegrity(currentDayData, year, date, weekNumber)
      
      // Use safe update function to preserve existing data
      const updatedEntries = safeUpdateDayEntry(user.entries, year, date, { 
        ...integrityDayData,
        status: "Closed" 
      })
      
      // Calculate earnings for this day and update stash
      const dayEarnings = parseFloat(integrityDayData.earnings) || 0
      const currentStash = parseFloat(user.stash || "0")
      const newStash = (currentStash + dayEarnings).toString()
      const availableBalance = parseFloat(user.availableBalance || "0")
      const newEquity = (availableBalance - parseFloat(newStash)).toString()
      
      await prisma.user.update({
        data: {
          entries: updatedEntries,
          stash: newStash,
          equity: newEquity,
        },
        where: { id: user.id },
      })
      user = await getUser()
    }
  }

  if (data?.weeksToClose) {
    for (const week of data?.weeksToClose) {
      // Log current state for debugging
      logEntryData(user.entries, week.year, week.week)
      
      // Get current week data
      const currentWeekData = user.entries?.[week.year]?.weeks?.[week.week] || {}
      
      // Ensure week data integrity before closing
      const integrityWeekData = ensureWeekDataIntegrity(currentWeekData, week.year, week.week)
      
      // Use safe update function to preserve existing data
      const updatedEntries = safeUpdateWeekEntry(user.entries, week.year, week.week, { 
        ...integrityWeekData,
        status: "Closed" 
      })
      
      // Calculate earnings for this week and update stash
      const weekEarnings = parseFloat(integrityWeekData.earnings) || 0
      const currentStash = parseFloat(user.stash || "0")
      const newStash = (currentStash + weekEarnings).toString()
      const availableBalance = parseFloat(user.availableBalance || "0")
      const newEquity = (availableBalance - parseFloat(newStash)).toString()
      
      await prisma.user.update({
        data: {
          entries: updatedEntries,
          stash: newStash,
          equity: newEquity,
        },
        where: { id: user.id },
      })
      user = await getUser()
    }
  }

  if (data?.withdrawStash) {
    const currentStash = parseFloat(user.stash || "0")
    const currentTotalEarnings = parseFloat(user.totalEarnings || "0")
    const newTotalEarnings = (currentTotalEarnings + currentStash).toString()
    const availableBalance = parseFloat(user.availableBalance || "0")
    const newEquity = (availableBalance - 0).toString() // Equity becomes availableBalance since stash is 0
    
    await prisma.user.update({
      data: {
        stash: "0",
        totalEarnings: newTotalEarnings,
        equity: newEquity,
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  if (data?.settings) {
    await prisma.user.update({
      data: {
        settings: {
          ...user.settings,
          ...data.settings
        },
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  // Handle ephemeral tasks for day entries
  if (data?.dayEphemeralTasks) {
    const entries = user.entries as any
    let updatedEntries = entries

    if (data.dayEphemeralTasks.add) {
      const ephemeralTask = {
        id: data.dayEphemeralTasks.add.id || `ephemeral_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: data.dayEphemeralTasks.add.name,
        status: data.dayEphemeralTasks.add.status || "Not started",
        area: data.dayEphemeralTasks.add.area || "self",
        categories: data.dayEphemeralTasks.add.categories || ["custom"],
        cadence: "ephemeral",
        times: data.dayEphemeralTasks.add.times || 1,
        count: data.dayEphemeralTasks.add.count || 0,
        contacts: data.dayEphemeralTasks.add.contacts || [],
        things: data.dayEphemeralTasks.add.things || [],
        createdAt: new Date().toISOString(),
        isEphemeral: true
      }
      updatedEntries = addEphemeralTaskToDay(updatedEntries, year, date, ephemeralTask)
    }

    if (data.dayEphemeralTasks.update) {
      updatedEntries = updateEphemeralTaskInDay(
        updatedEntries, 
        year, 
        date, 
        data.dayEphemeralTasks.update.id, 
        data.dayEphemeralTasks.update.updates
      )
    }

    if (data.dayEphemeralTasks.remove) {
      updatedEntries = removeEphemeralTaskFromDay(
        updatedEntries, 
        year, 
        date, 
        data.dayEphemeralTasks.remove.id
      )
    }

    await prisma.user.update({
      data: {
        entries: updatedEntries,
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  // Handle ephemeral tasks for week entries
  if (data?.weekEphemeralTasks) {
    const entries = user.entries as any
    let updatedEntries = entries

    if (data.weekEphemeralTasks.add) {
      const ephemeralTask = {
        id: data.weekEphemeralTasks.add.id || `ephemeral_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: data.weekEphemeralTasks.add.name,
        status: data.weekEphemeralTasks.add.status || "Not started",
        area: data.weekEphemeralTasks.add.area || "self",
        categories: data.weekEphemeralTasks.add.categories || ["custom"],
        cadence: "ephemeral",
        times: data.weekEphemeralTasks.add.times || 1,
        count: data.weekEphemeralTasks.add.count || 0,
        contacts: data.weekEphemeralTasks.add.contacts || [],
        things: data.weekEphemeralTasks.add.things || [],
        createdAt: new Date().toISOString(),
        isEphemeral: true
      }
      updatedEntries = addEphemeralTaskToWeek(updatedEntries, year, weekNumber, ephemeralTask)
    }

    if (data.weekEphemeralTasks.update) {
      updatedEntries = updateEphemeralTaskInWeek(
        updatedEntries, 
        year, 
        weekNumber, 
        data.weekEphemeralTasks.update.id, 
        data.weekEphemeralTasks.update.updates
      )
    }

    if (data.weekEphemeralTasks.remove) {
      updatedEntries = removeEphemeralTaskFromWeek(
        updatedEntries, 
        year, 
        weekNumber, 
        data.weekEphemeralTasks.remove.id
      )
    }

    await prisma.user.update({
      data: {
        entries: updatedEntries,
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  
  return Response.json(user)
}