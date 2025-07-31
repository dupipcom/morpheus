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

export async function GET(req: NextApiRequest, res: NextApiResponse) {
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
        You are a data science platform talking to a user. You should use the pronoun 'you' while generating the output.
        
        You reference cognitive psychology readbooks.

        This is the user data set:

        \`\`\`
        ${JSON.stringify(entries)}
        \`\`\`

        `,
      text: {
        format: {
          type: "json_schema",
          name: "analysis",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              day_analysis: { type: "string" },
              last3days_analysis: { type: "string" },
              week_analysis: { type: "string" },
              year_analysis: { type: "string" },
              gratitude_analysis: { type: "string" },
              acceptance_analysis: { type: "string" },
              restedness_analysis: { type: "string" },
              tolerance_analysis: { type: "string" },
              selfEsteem_analysis: { type: "string" },
              trust_analysis: { type: "string" },
            },
            required: ["name", "day_analysis", "last3days_analysis", "week_analysis", "year_analysis", "gratitude_analysis", "acceptance_analysis", "restedness_analysis", "tolerance_analysis", "selfEsteem_analysis", "trust_analysis"],
            additionalProperties: false,
          },
          strict: true,
        },
      },
      input: 'Please provide a series of 100 words analysis for the provided format',
    });

    return Response.json({ result: response.output_text });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to generate response" }, { status: 500 });
  }

  
  return Response.json(user)
}