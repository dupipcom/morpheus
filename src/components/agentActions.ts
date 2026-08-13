'use server';

import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { auth } from '@clerk/nextjs/server';
import { createStreamableValue } from '@ai-sdk/rsc';
import { getWeekNumber } from "@/app/helpers"
import { deepseekChat } from '@/lib/deepseek';
import {
  buildAssistantSystemPrompt,
  buildRagForQuery,
  fetchCompactDays,
  resolveAgentContext,
  validateAndClampFilterContext
} from '@/lib/services/agent';
import type { AgentFilterContext } from '@/lib/services/agent';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}


// Internal-only: a "use server" module may only export async functions, so
// this constant (and the runtime guard it feeds) can't be shared with the UI.
const AGENT_MODELS = ['deepseek', 'openai'] as const;
export type AgentModel = typeof AGENT_MODELS[number];

// OpenAI is preserved as an option but disabled in the chat UI for now.
const OPENAI_CHAT_MODEL = 'gpt-5-mini';

const HISTORY_LOOKBACK = 10;
const MAX_HISTORY_MESSAGE_CHARS = 2000;

function resolveChatModel(model: AgentModel) {
  switch (model) {
    case 'openai':
      return openai(OPENAI_CHAT_MODEL);
    case 'deepseek':
    default:
      return deepseekChat;
  }
}

export async function continueConversation(
  history: Message[],
  filterContext: AgentFilterContext,
  model: AgentModel = 'deepseek'
) {
  'use server';

  const stream = createStreamableValue();

  const fullDate = new Date();
  const date = fullDate.toISOString().split('T')[0];
  const year = Number(date.split('-')[0]);
  const weekNumber = getWeekNumber(fullDate)[1];

  const startStream = async () => {
    try {
      const { userId: clerkUserId } = await auth();
      if (!clerkUserId) {
        throw new Error('Unauthorized');
      }

      // Parse the prompt context server-side: validated dates/dimensions and a
      // delegation-checked target user drive the minimal MongoDB query below.
      const ctx = await resolveAgentContext(
        validateAndClampFilterContext(filterContext),
        clerkUserId
      );
      const compactDays = await fetchCompactDays(ctx);

      const lookback = [...history].slice(-HISTORY_LOOKBACK).map((message) => ({
        role: message.role,
        content: message.content.slice(0, MAX_HISTORY_MESSAGE_CHARS)
      }));

      const lastUserMessage = [...history].reverse().find((message) => message.role === 'user');
      const query = lastUserMessage?.content ?? '';

      const rag = await buildRagForQuery(compactDays, query, { dimensions: ctx.dimensions });

      const chatModel = AGENT_MODELS.includes(model) ? model : 'deepseek';

      const { textStream } = streamText({
        model: resolveChatModel(chatModel),
        maxOutputTokens: 4096,
        temperature: 0.3,
        maxRetries: 5,
        system: buildAssistantSystemPrompt({ date, year, weekNumber, ctx, rag }),
        messages: lookback,
      });

      for await (const text of textStream) {
        stream.update(text);
      }

      stream.done();
    } catch (error) {
      console.error('agent_generation_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        operation: 'continueConversation'
      });
      stream.error(new Error('Failed to generate response'));
    }
  };

  startStream();

  return {
    messages: history,
    newMessage: stream.value,
  };
}
