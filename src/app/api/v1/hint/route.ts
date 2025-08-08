import { NextResponse } from 'next/server';
import { currentUser, auth } from '@clerk/nextjs/server'
import openai from '@/lib/openai';
import fs from "fs";
import prisma from "@/lib/prisma";
import { getWeekNumber } from "@/app/helpers"
import { WEEKLY_ACTIONS, DAILY_ACTIONS } from "@/app/constants"

interface GenerateRequest {
  prompt: string;
}

export const revalidate = 86400;
export const maxDuration = 30;

export async function GET(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = await auth()

  // if (!data.prompt) {
  //   return Response.json({ error: "Prompt is required" }, { status: 400 });
  // }
  
  const getUser = async () => await prisma.user.findUnique({
       where: { userId }
    })

  let user = await getUser()

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]

  const entries = user?.entries

  let returnValue

  if (!user?.analysis) {
    await prisma.user.update({
        data: {
          analysis: {},
        },
        where: { userId },
      });
    user = getUser();
  }

  if (!user?.analysis || !Object.keys(user.analysis).length) {
    try {
      const file = await openai.files.create({
        file: fs.createReadStream(process.cwd() + '/src/app/api/v1/hint/rag/atomic-habits.pdf'),
        purpose: "assistants",
      });

      const vectorStore = await openai.vectorStores.create({
        name: "Book references",
        file_ids: [file.id],
        expires_after: {
          anchor: "last_active_at",
          days: 1
        }
      });

      const response = await openai.responses.create({
        model: "gpt-4o",
        tools: [{ type: "file_search", vector_store_ids: [vectorStore.id] }],
        instructions: `
          Please use file_search for this analysis.

          You are a data science platform talking to a user. You should use the pronoun 'you' while generating the output.
          
          You reference the file search vector store pdfs to provide improvement suggestions to the user routine.

          You analyse how indicators like gratitude, optimism, restedness, tolerance and trust progress over time, finding correlations with weekly and daily task completions.

          This is the user historical data set:

          \`\`\`
          ${JSON.stringify(entries)}
          \`\`\`

          `,
        text: {
          format: {
            name: "mood_analysis",
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                alltimeAnalysis: { type: "string" },
                dayAnalysis: { type: "string" },
                last3daysAnalysis: { type: "string" },
                weekAnalysis: { type: "string" },
                yearAnalysis: { type: "string" },
                gratitudeAnalysis: { type: "string" },
                optimismAnalysis: { type: "string" },
                restednessAnalysis: { type: "string" },
                toleranceAnalysis: { type: "string" },
                selfEsteemAnalysis: { type: "string" },
                trustAnalysis: { type: "string" },
              },
              required: ["alltimeAnalysis", "dayAnalysis", "last3daysAnalysis", "weekAnalysis", "yearAnalysis", "gratitudeAnalysis", "optimismAnalysis", "restednessAnalysis", "toleranceAnalysis", "selfEsteemAnalysis", "trustAnalysis"],
              additionalProperties: false,
            },
            strict: true,
          },
        },
        input: 'Please provide a series of 100 words analysis for the provided format',
      });

      await prisma.user.update({
        data: {
          analysis: {
            [date]: JSON.parse(JSON.stringify(response.output_text))
          },
        },
        where: { userId },
      })

      user = getUser();

      return Response.json({ result: JSON.parse(response.output_text) });

  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to generate response" }, { status: 500 });
  }} else {
    return Response.json({ result: user.analysis[date] });
  }
  
  return Response.json(user)
}