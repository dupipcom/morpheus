import { getServerSession } from "next-auth/next"
import prisma from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

function getWeekNumber(d) {
    // Copy date so don't modify original
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    // Get first day of year
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    // Calculate full weeks to nearest Thursday
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    // Return array of year and week number
    return weekNo;
}

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const data = await req.json()
  const actions = data.actions
  const session = await getServerSession(authOptions);

  const getUser = async () => await prisma.user.findUnique({
       where: { email: "varsnothing@gmail.com" }
    })

  let user = await getUser()

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)

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
                tasks: {}
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
                  [date]: {}
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
                tasks: actions,
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

  }


  
  return Response.json({})
}