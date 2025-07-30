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
  const tasks = data.actions
  const session = await getServerSession(authOptions);

  console.log({ data })

  const user = await prisma.user.findUnique({
       where: { email: "varsnothing@gmail.com" }
    })

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)


  console.log({ session, user })

  const dayDone = data.dayActions.filter((action) => action.status === "Done")
  const weekDone = data.weekActions.filter((action) => action.status === "Done")

  const dayProgress = data.dayActions.length ? dayDone.length / data.dayActions.length : undefined
  const weekProgress = data.weekActions.length ? weekDone.length / data.weekActions.length : undefined

  console.log({ dayDone, dayProgress, weekProgress })


  await prisma.user.update({
      data: {
        entries: {
            ...user.entries,
            ['2025-' + weekNumber]: {
              days: {
                [date]: {
                  status: "Open",
                  tasks: data.dayActions,
                  earnings: dayProgress
                }
              },
              week: weekNumber,
              status: "Open",
              tasks: data.weekActions,
              year,
              earnings: weekProgress
            },
        },
      },
      where: { email: user.email },
    })
  if (req.method === "POST") {
  
  }

  return Response.json({})
}