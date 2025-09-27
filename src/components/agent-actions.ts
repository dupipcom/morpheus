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

  (async () => {
    const { textStream } = streamText({
      model: openai('gpt-5-mini'),
      system: `You are a compassionate AI assistant understand their health data and make conscious, legal, responsible with a healthy mindset, and helping users with their mental health and habit tracking journey.
            
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
            
            Use this data to provide personalized insights and advice.`,
      messages: history,
    });

    for await (const text of textStream) {
      stream.update(text);
    }

    stream.done();
  })();

  return {
    messages: history,
    newMessage: stream.value,
  };
}