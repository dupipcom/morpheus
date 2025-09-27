import { NextResponse, NextRequest } from 'next/server';
import { currentUser, auth } from '@clerk/nextjs/server'
import openai from '@/lib/openai';
import fs from "fs";
import prisma from "@/lib/prisma";
import { getWeekNumber } from "@/app/helpers"

// Logger helper function for consistent console logging format
const logger = (str: string, originalMessage?: any) => {
  let message = str;
  if (originalMessage !== undefined) {
    if (typeof originalMessage === 'object') {
      try {
        message = `${str} - ${JSON.stringify(originalMessage, null, 2)}`;
      } catch (error) {
        message = `${str} - [Object - circular reference or non-serializable]`;
      }
    } else {
      message = `${str} - ${String(originalMessage)}`;
    }
  }

  const colorSettings = {
    background: '#1f1f1f',
    color: 'green',
    fontWeight: 'bold',
    padding: '2px 4px',
    borderRadius: '3px'
  };

  console.log(
    `%cdpip::morpheus::chat::${message}`,
    `background: ${colorSettings.background}; color: ${colorSettings.color}; font-weight: ${colorSettings.fontWeight}; padding: ${colorSettings.padding}; border-radius: ${colorSettings.borderRadius};`
  );
};

interface ChatRequest {
  message: string;
  locale?: string;
}

export const revalidate = 0;
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: ChatRequest = await req.json();
    const { message, locale = 'en' } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const getUser = async () => await prisma.user.findUnique({
      where: { userId }
    });

    let user = await getUser();

    const fullDate = new Date();
    const date = fullDate.toISOString().split('T')[0];
    const year = Number(date.split('-')[0]);
    const weekNumber = getWeekNumber(fullDate)[1];

    const entries = user?.entries;


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
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano-2025-08-07",
      messages: [
        {
          role: "system",
          content: `
            You are a compassionate AI assistant understand their health data and make conscious, legal, responsible with a healthy mindset, and helping users with their mental health and habit tracking journey.
            
            You have access to the user's historical data and can reference the Atomic Habits book for guidance.

            Pease keep your answers under 250 words. Try to solve practical problems.
            
            Today is ${date}.

            The year is ${year}

            Current week number for the current year is ${weekNumber}.

            The definition of done for daily and weekly tasks is the count key-value matching times key-value in each object in the arrays. 
            Otherwise, the count specifies the amount of times the task was completed in their respective period: daily or weekly.
            User's historical daily data for ${year}:
            ${JSON.stringify(entries[year].days)}

            User's historical weekly data for ${year}:
            ${JSON.stringify(entries[year].weeks)}
            
            Use this data to provide personalized insights and advice.
          `
        },
        {
          role: "user",
          content: message
        }
      ],
      // tools: [{ type: "file_search", vector_store_ids: [vectorStore.id] }],
      // tool_choice: "auto",
      max_completion_tokens: 5000
    });

    if(!user.entries[year].weeks[weekNumber].messages) {
      await prisma.user.update({
        data: {
          entries: { 
            ...user?.entries, 
            [year]: { 
              ...user?.entries[year], 
              weeks:  { 
                ...user?.entries[year].weeks, 
                [weekNumber]: { 
                  ...user?.entries[year].weeks[weekNumber], 
                  messages: [],
                }
              }
            }
          }
        },
        where: { userId }, 
      })
    }

    const assistantMessage = response.choices[0]?.message?.content || "I'm sorry, I couldn't process your message right now.";

    const nextMessages = [{
      content: message,
      timestamp: fullDate,
      role: "user"
    }, {
      content: assistantMessage,
      timestamp: fullDate,
      role: "assistant"
    }]
    
    await prisma.user.update({
        data: {
          entries: { 
            ...user?.entries, 
            [year]: { 
              ...user?.entries[year], 
              weeks:  { 
                ...user?.entries[year].weeks, 
                [weekNumber]: { 
                  ...user?.entries[year].weeks[weekNumber], 
                  messages: [ ...user?.entries[year].weeks[weekNumber].messages, ...nextMessages ]
                }
              }
            }
          }
        },
        where: { userId }
    })

    return NextResponse.json({
      success: true,
      message: assistantMessage,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json(
      { error: `Failed to process chat message: ${error}`  },
      { status: 500 }
    );
  }
}
