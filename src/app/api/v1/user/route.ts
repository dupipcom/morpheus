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
    user = await prisma.user.create({
      data: {
        userId,
        entries: {},
        settings: {
          dailyTemplate: [],
          weeklyTemplate: []
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

  if (!user.settings?.weeklyTemplate?.length && !user.settings?.dailyTemplate?.length) {
    await prisma.user.update({
      data: {
        settings: {
          ...user?.settings,
          weeklyTemplate: WEEKLY_ACTIONS,
          dailyTemplate: DAILY_ACTIONS,
        }
      },
      where: { id: user.id }, 
    })
    user = await getUser()
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
                  tasks: user?.settings?.weeklyTemplate?.length ? user.settings.weeklyTemplate : WEEKLY_ACTIONS,
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
                  tasks: user?.settings?.dailyTemplate?.length ? user.settings.dailyTemplate : DAILY_ACTIONS,
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

  if (data.weekActions?.length && user) {
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
                  tasks: tasksWithContacts.sort((a: any, b: any) => a.status === "Done" ? 1 : -1),
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
  } else if (data.weekActions) {
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
                  tasks: (user?.settings?.weeklyTemplate?.length ? user?.settings?.weeklyTemplate : WEEKLY_ACTIONS).sort((a, b) => a.status === "Done" ? 1 : -1),
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

  if (data.dayActions?.length && user) {
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
                  tasksNumber: dayTasks.length,
                  tasks: tasksWithContacts.sort((a: any, b: any) => a.status === "Done" ? 1 : -1),
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
  } else if (data.dayActions) {
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
                  tasks: (user?.settings?.dailyTemplate.length ? user?.settings?.dailyTemplate : DAILY_ACTIONS).sort((a, b) => a.status === "Done" ? 1 : -1),
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