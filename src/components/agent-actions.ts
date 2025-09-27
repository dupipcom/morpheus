'use server';

import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createStreamableValue } from '@ai-sdk/rsc';
import { getWeekNumber } from "@/app/helpers"

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function continueConversation(history: Message[], entries) {
  'use server';

  const stream = createStreamableValue();

  const fullDate = new Date();
  const date = fullDate.toISOString().split('T')[0];
  const year = Number(date.split('-')[0]);
  const weekNumber = getWeekNumber(fullDate)[1];

  const lookback = [...history].slice(0, 4)

  const startStream = async () => {
    const { textStream } = streamText({
      model: openai('gpt-5-mini'),
      maxOutputTokens: 25000,
      temperature: 0.3,
      maxRetries: 5,
      system: `You are a compassionate AI assistant understand their health data and make conscious, legal, responsible with a healthy mindset, and helping users with their mental health and habit tracking journey.
            
            You can't setup reminders or control the user IoT devices.

            You have access to the user's historical data and can reference the Cognitive Psychology books for guidance.

            Pease keep your answers under 250 words. Try to share tips for solving practical issues in the user's input.
            
            Today is ${date}.

            The year is ${year}

            Current week number for the current year is ${weekNumber}.

            Please don't try to validate logical assumptions with the user, assume your solutions and suggestions are good.

            The definition of done for daily and weekly tasks is the count key-value matching times key-value in each object in the arrays. 
            Otherwise, the count specifies the amount of times the task was completed in their respective period: daily or weekly.
            User's historical daily data for ${year}:
            ${JSON.stringify(entries[year].days)}

            User's historical weekly data for ${year}:
            ${JSON.stringify(entries[year].weeks)}
            
            Use this data to provide personalized insights and advice.`,
      messages: lookback,
    });

    for await (const text of textStream) {
      stream.update(text);
    }

    stream.done();
  };

  startStream();

  return {
    messages: history,
    newMessage: stream.value,
  };
}