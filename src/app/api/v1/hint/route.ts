import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { getServerSession } from "next-auth/next"
import prisma from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { getWeekNumber } from "@/app/helpers"
import { WEEKLY_ACTIONS, DAILY_ACTIONS } from "@/app/constants"

interface GenerateRequest {
  prompt: string;
}

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const data = await req.json()
  const session = await getServerSession(authOptions);

  // if (!data.prompt) {
  //   return Response.json({ error: "Prompt is required" }, { status: 400 });
  // }

  const getUser = async () => await prisma.user.findUnique({
       where: { email: session?.user?.email  }
    })

  let user = await getUser()

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]

  const entries = user.entries

  try {
    const response = await openai.responses.create({
      model: "gpt-4o",
      instructions: `
        Can you please analyze this data set which is a timeseries (per weeks and days), in which the user logs their mood at \`entries[week].days[day].mood\` and their completed tasks at \`entries[week].days[day].tasks\` for the daily tasks and \`entries[week].tasks\` for the weekly tasks.

        \`\`\`
        ${JSON.stringify(entries)}
        \`\`\`

        Please refer to the subject as "You"

        `,
      input: 'Please provide a 1 paragraph analysis of the data in the following dataset, focused on cognitive psychology lenses.',
    });

    console.log({ response })

    return Response.json({ result: response.output_text });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to generate response" }, { status: 500 });
  }

  
  return Response.json(user)
}