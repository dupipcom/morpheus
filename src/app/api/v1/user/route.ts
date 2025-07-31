import { getServerSession } from "next-auth/next"
import prisma from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { getWeekNumber } from "@/app/helpers"
import { WEEKLY_ACTIONS, DAILY_ACTIONS } from "@/app/constants"

export async function GET(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(authOptions);

  const getUser = async () => await prisma.user.findUnique({
       where: { name: session?.user?.name }
    })

  let user = await getUser()

  return Response.json(user)
}

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const data = await req.json()
  const session = await getServerSession(authOptions);

  const getUser = async () => await prisma.user.findUnique({
       where: { name: session?.user?.name  }
    })

  let user = await getUser()

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const month = Number(date.split('-')[1])
  const day = Number(date.split('-')[2])
  const weekNumber = getWeekNumber(fullDate)[1]

  const dayDone = data.dayActions?.filter((action) => action.status === "Done")
  const weekDone = data.weekActions?.filter((action) => action.status === "Done")

  const dayProgress = data.dayActions?.length ? dayDone.length / data.dayActions.length : undefined
  const weekProgress = data.weekActions?.length ? weekDone.length / data.weekActions.length : undefined

  const dayEarnings = user.availableBalance * dayProgress / 30
  const weekEarnings = user.availableBalance * weekProgress / 4

  if (data.availableBalance) {
    await prisma.user.update({
      data: {
        availableBalance: data.availableBalance
      },
      where: { name: user.name },
    })
    user = await getUser()
  }

  if (!user.entries) {
    await prisma.user.update({
      data: {
        entries: {},
      },
      where: { name: user.name }, 
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
      where: { name: user.name }, 
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
                  earnings: weekEarnings,
                  tasks: WEEKLY_ACTIONS,
                  status: "Open"
                }
              }
            },
          }
        },
      where: { name: user.name }, 
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
                  earnings: dayEarnings,
                  tasks: DAILY_ACTIONS,
                  status: "Open"
                }
              }
            },
          }
      },
      where: { name: user.name }, 
    })
    user = await getUser()
  }

  if (data.weekActions?.length) {
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
                  earnings: weekEarnings,
                  tasks: data.weekActions,
                  status: "Open"
                }
              }
          }
        },
      },
      where: { name: user.name },
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
                  tasks: data.dayActions,
                  status: "Open"
                }
              }
            }
          }
      },
      where: { name: user.name },
    })
    user = await getUser()
  }

  console.log({ data })

  if (data.mood) {
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
                  }
                }
              }
            }
          }
        },
      where: { name: user.name },
    })
    user = await getUser()
  }

  if (data.settings) {
    await prisma.user.update({
      data: {
        settings: {
          ...user.settings,
          ...data.settings
        },
      },
      where: { name: user.name },
    })
    user = await getUser()
  }



  
  return Response.json(user)
}