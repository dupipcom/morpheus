import prisma from "@/lib/prisma";
import { currentUser, auth } from '@clerk/nextjs/server'
import { getWeekNumber } from "@/app/helpers"
import { WEEKLY_ACTIONS, DAILY_ACTIONS } from "@/app/constants"
import { safeUpdateWeekEntry, safeUpdateDayEntry, validateWeekData, validateDayData, logEntryData, ensureWeekDataIntegrity, ensureDayDataIntegrity } from "@/lib/entryUtils"

export async function GET(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = await auth()

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

  const fullDate = data?.date ? new Date(data?.date) : new Date()

  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const month = Number(date.split('-')[1])
  const day = Number(date.split('-')[2])
  const weekNumber = getWeekNumber(fullDate)[1]

  if (data.availableBalance) {
    await prisma.user.update({
      data: {
        availableBalance: data.availableBalance
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
      const key = Object.keys(data?.mood)[0]
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
                    [key]: data?.mood[key]
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

  const availableBalance = Number(user?.availableBalance) || 0
  const dayEarnings = ((5 - dayMoodAverage)) * 0.2 + ((dayProgress * 0.80)) * availableBalance / 30
  const weekEarnings = ((5 - weekMoodAverage)) * 0.2 + ((weekProgress * 0.80)) * availableBalance / 4

  if (data.weekActions?.length && user) {
    // Add contacts to tasks if provided
    const entries = user.entries as any
    const tasksWithContacts = data.weekActions.map((task: any) => ({
      ...task,
      contacts: data.taskContacts?.[task.name] || []
    }))

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
                }
              },
              weeks: {
                ...user.entries[year].weeks,
                [weekNumber]: {
                  ...user.entries[year].weeks[weekNumber],
                  earnings: weekEarnings,
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
      contacts: data.taskContacts?.[task.name] || []
    }))

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
                  progress: dayProgress,
                  done: dayDone.length,
                  tasksNumber: dayTasks.length,
                  tasks: tasksWithContacts.sort((a: any, b: any) => a.status === "Done" ? 1 : -1),
                  status: "Open",
                  availableBalance: user.availableBalance,
                  contacts: data.dayContacts || entries[year]?.days?.[date]?.contacts || []
                }
              }
            }
          }
      },
      where: { id: user.id },
    })
    user = await getUser()
  } else if (data.dayActions) {
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
                  progress: dayProgress,
                  done: dayDone.length,
                  tasksNumber: dayTasks.length,
                  tasks: (user?.settings?.dailyTemplate.length ? user?.settings?.dailyTemplate : DAILY_ACTIONS).sort((a, b) => a.status === "Done" ? 1 : -1),
                  status: "Open",
                  availableBalance: user.availableBalance
                }
              }
            }
          }
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  // Handle task contacts updates (when sent separately from actions)
  if (data?.taskContacts && !data?.dayActions && !data?.weekActions && user) {
    // Update day tasks if date is provided
    if (data.date) {
      // Update day tasks with contacts
      const entries = user.entries as any
      const currentTasks = entries?.[year]?.days?.[date]?.tasks || []
      const updatedTasks = currentTasks.map((task: any) => ({
        ...task,
        contacts: data.taskContacts[task.name] || task.contacts || []
      }))

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
                  tasks: updatedTasks
                }
              }
            }
          }
        },
        where: { id: user.id },
      })
      user = await getUser()
    }
    
    // Update week tasks if week is provided
    if (data.week) {
      // Update week tasks with contacts
      const entries = user.entries as any
      const currentTasks = entries?.[year]?.weeks?.[data.week]?.tasks || []
      const updatedTasks = currentTasks.map((task: any) => ({
        ...task,
        contacts: data.taskContacts[task.name] || task.contacts || []
      }))

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
                  tasks: updatedTasks
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
                  contacts: data.moodContacts || [],
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

  if (data?.moodContacts && !data?.mood && !data?.text) {
    // Handle mood contacts only (when field is 'contacts')
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
                  contacts: data.moodContacts
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
                  contacts: data.moodContacts || [],
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
      
      await prisma.user.update({
        data: {
          entries: updatedEntries,
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
      
      await prisma.user.update({
        data: {
          entries: updatedEntries,
        },
        where: { id: user.id },
      })
      user = await getUser()
    }
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



  
  return Response.json(user)
}