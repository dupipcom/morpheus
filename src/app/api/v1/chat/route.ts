import { NextResponse, NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server'
import prisma from "@/lib/prisma";
import { getWeekNumber } from "@/app/helpers"

interface ChatMessage {
  role?: string
  content?: string
  timestamp?: string
}

interface ChatRequest {
  message: ChatMessage[] | ChatMessage | string;
  locale?: string;
}

export const revalidate = 0;
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: ChatRequest = await req.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const getUser = async () => await prisma.user.findUnique({
      where: { userId }
    });

    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const fullDate = new Date();
    const date = fullDate.toISOString().split('T')[0];
    const weekNumber = getWeekNumber(fullDate)[1];
    const month = fullDate.getMonth() + 1;
    const quarter = Math.floor((month - 1) / 3) + 1;
    const semester = month <= 6 ? 1 : 2;
    const serializedMessages = Array.isArray(message) ? message : [message]


    // // Create vector store for RAG
    // const file = await openai.files.create({
    //   file: fs.createReadStream(process.cwd() + ''),
    //   purpose: "assistants",
    // });

    // const vectorStore = await openai.vectorStores.create({
    //   name: "Book references",
    //   file_ids: [file.id],
    //   expires_after: {
    //     anchor: "last_active_at",
    //     days: 1
    //   }
    // });

    // Create a conversational response using the existing RAG setup
    // const response = await generateText({
    //   model: openai("gpt-5-nano"),
    //   messages: [
    //     {
    //       role: "system",
    //       content: `
    //         You are a compassionate AI assistant understand their health data and make conscious, legal, responsible with a healthy mindset, and helping users with their mental health and habit tracking journey.
            
    //         You have access to the user's historical data and can reference the Atomic Habits book for guidance.

    //         Pease keep your answers under 250 words. Try to solve practical problems.
            
    //         Today is ${date}.

    //         The year is ${year}

    //         Current week number for the current year is ${weekNumber}.

    //         The definition of done for daily and weekly tasks is the count key-value matching times key-value in each object in the arrays. 
    //         Otherwise, the count specifies the amount of times the task was completed in their respective period: daily or weekly.
    //         User's historical daily data for ${year}:
    //         ${JSON.stringify(entries[year].days)}

    //         User's historical weekly data for ${year}:
    //         ${JSON.stringify(entries[year].weeks)}
            
    //         Use this data to provide personalized insights and advice.
    //       `
    //     },
    //     {
    //       role: "user",
    //       content: message
    //     }
    //   ],
    //   // tools: [{ type: "file_search", vector_store_ids: [vectorStore.id] }],
    //   // tool_choice: "auto",
    //   max_completion_tokens: 25000
    // });

    const existingDay = await prisma.day.findFirst({
      where: {
        userId: user.id,
        date
      },
      select: {
        id: true,
        analysis: true
      }
    })

    const currentAnalysis = existingDay?.analysis && typeof existingDay.analysis === 'object' && !Array.isArray(existingDay.analysis)
      ? existingDay.analysis as Record<string, unknown>
      : {}

    if (existingDay) {
      await prisma.day.update({
        where: { id: existingDay.id },
        data: {
          analysis: {
            ...currentAnalysis,
            agentConversation: serializedMessages
          }
        }
      })
    } else {
      await prisma.day.create({
        data: {
          userId: user.id,
          date,
          week: weekNumber,
          month,
          quarter,
          semester,
          tasks: [],
          ticker: [],
          analysis: {
            agentConversation: serializedMessages
          }
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: "Saved conversation",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json(
      { error: `Failed to process chat message: ${error}`  },
      { status: 500 }
    );
  }
}
