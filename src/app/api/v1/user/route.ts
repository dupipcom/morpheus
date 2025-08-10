import prisma from "@/lib/prisma";
import { currentUser, auth } from '@clerk/nextjs/server'
import { getWeekNumber } from "@/app/helpers"
import { WEEKLY_ACTIONS, DAILY_ACTIONS } from "@/app/constants"

export async function GET(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = await auth()

  const getUser = async () => await prisma.user.findUnique({
       where: { userId }
    })

  let user = await getUser()

  return Response.json(user)
}

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = await auth()
  const data = await req.json()


  const getUser = async () => await prisma.user.findUnique({
       where: { userId }
    })

  let user = await getUser()

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

  if (!user.weeklyTemplate && !user.dailyTemplate) {
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
                  tasks: user.settings.weekTemplate || WEEKLY_ACTIONS,
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
                  tasks: user.settings.dailyTemplate || DAILY_ACTIONS,
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

  const dayProgress = dayTasks?.length ? dayDone.length / dayTasks.length : undefined
  const weekProgress = weekTasks?.length ? weekDone.length / weekTasks.length : undefined

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


  const moodValues = user?.entries[year].days[date].mood  ? Object.values(user?.entries[year].days[date].mood ).splice(0, Object.values(user?.entries[year].days[date].mood ).length) : [0]


  const dayMoodAverage = moodValues.reduce((acc,cur) => acc + cur, 0) / moodValues.length

  const wantBudget = Number(user?.settings?.monthsFixedIncome) + Number(user?.settings?.monthsVariableIncome) - Number(user?.settings?.monthsNeedFixedExpenses) - Number(user?.settings?.monthsNeedVariableExpenses)

  const weekMoodValues = Object.values(user?.entries[year].days).length ? Object.values(user?.entries[year].days).sort().splice(0, 7).map((day) => {
    return Object.values(day?.mood)?.length ? Object.values(day?.mood) : [0].flat() 
    }).flat()
  : [0]

  const weekMoodAverage = weekMoodValues.reduce((acc, cur) => Number(acc) + Number(cur), 0) / weekMoodValues.length

  const dayEarnings = ((5 - dayMoodAverage)) * 0.2 + ((dayProgress * 0.80)) * user?.availableBalance / 30
  const weekEarnings = ((5 - weekMoodAverage)) * 0.2 + ((weekProgress * 0.80)) * user?.availableBalance / 4

  if (data.weekActions?.length) {
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
                  tasks: data.weekActions,
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

  if (data.dayActions?.length) {
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
                  tasks: data.dayActions,
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
                    [key]: data.mood[key],
                  },
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
                    status: "Closed",
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

  if (data?.weeksToClose) {
    for (const week of data?.weeksToClose) {
      await prisma.user.update({
        data: {
          entries: {
              ...user.entries,
              [week.year]: {
                ...user.entries[week.year],
                weeks: {
                  ...user.entries[week.year].weeks,
                  [week.week]: {
                    ...user.entries[week.year].weeks[week],
                    status: "Closed",
                  }
                }
            }
          },
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