import { getServerSession } from "next-auth/next"
import prisma from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const data = await req.json()
  const tasks = data.actions
  const session = await getServerSession(authOptions);

  console.log({ data })

  const user = await prisma.user.findUnique({
       where: { email: "varsnothing@gmail.com" }
    })

  console.log({ session, user })

  async function upsertDay({ session, actions, values }) {
    


    await prisma.users.update({
      data: {
        entries: {
          ...user.entries,
          [new Date().toISOString().split('T')[0]]: {
            status: "Open",
            tasks: parsedTasks
          }
        }
      },
      where: { email: user.email }
    });
  }
  if (req.method === "POST") {
  
  }

  return Response.json({})
}