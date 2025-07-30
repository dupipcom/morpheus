import { getServerSession } from "next-auth/next"
import prisma from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { getWeekNumber } from "@/app/helpers"
import { WEEKLY_ACTIONS, DAILY_ACTIONS } from "@/app/constants"

export async function GET(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(authOptions);

  const getUser = async () => await prisma.user.findUnique({
       where: { email: session?.user?.email }
    })

  let user = await getUser()

  return Response.json(user)
}

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const data = await req.json()
  const session = await getServerSession(authOptions);

  const getUser = async () => await prisma.user.findUnique({
       where: { email: session?.user?.email  }
    })

  let user = await getUser()

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
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
      where: { email: user.email },
    })
    user = await getUser()
  }

  if (!user.entries) {
    await prisma.user.update({
      data: {
        entries: {},
      },
      where: { email: user.email }, 
    })
    user = await getUser()
  }

  if (!user.entries[year]) {
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
            },
          }
        },
      where: { email: user.email }, 
    })
    user = await getUser()
  }

  if (!user.entries[year][weekNumber]) {
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              [weekNumber]: {
                days: {},
                year,
                week: weekNumber,
                earnings: weekEarnings,
                tasks: WEEKLY_ACTIONS,
                status: "Open"
              }
            },
          }
        },
      where: { email: user.email }, 
    })
    user = await getUser()
  }

  if (!user.entries[year][weekNumber].days[date]) {
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              [weekNumber]: {
                ...user.entries[year][weekNumber],
                days: {
                  ...user.entries[year][weekNumber].days,
                  [date]: {
                    tasks: DAILY_ACTIONS,
                    status: "Open"
                  }
                },
              }
            },
          }
        },
      where: { email: user.email }, 
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
              [weekNumber]: {
                ...user.entries[year][weekNumber],
                week: weekNumber,
                status: "Open",
                tasks: data.weekActions,
                year,
                earnings: weekEarnings
            },
          }
        },
      },
      where: { email: user.email },
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
              [weekNumber]: {
                ...user.entries[year][weekNumber],
                days: {
                  ...user.entries[year][weekNumber]?.days,
                  [date]: {
                    ...user.entries[year][weekNumber]?.days[date],
                    status: "Open",
                    tasks: data.dayActions,
                    earnings: dayEarnings
                  }
              },
            }
          },
        },
      },
      where: { email: user.email },
    })
    user = await getUser()
  }

  console.log({ data })

  if (data.mood) {
    await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            [year]: {
              ...user.entries[year],
              [weekNumber]: {
                ...user.entries[year][weekNumber],
                days: {
                  ...user.entries[year][weekNumber]?.days,
                  [date]: {
                    ...user.entries[year][weekNumber]?.days[date],
                    mood: {
                      gratitude: data.mood.gratitude || 3,
                      restedness: data.mood.restedness || 3,
                      acceptance: data.mood.acceptance || 3,
                      trust: data.mood.trust || 3,
                      selfEsteem: data.mood.selfEsteem || 3,
                      tolerance: data.mood.tolerance || 3,
                      text: data.mood.text || 3
                    }
                  }
              },
            }
          },
        },
      },
      where: { email: user.email },
    })
    user = await getUser()
  }

  console.log({ data })

  if (data.settings) {
    await prisma.user.update({
      data: {
        settings: {
          ...user.settings,
          ...data.settings
        },
      },
      where: { email: user.email },
    })
    user = await getUser()
  }



  
  return Response.json(user)
}