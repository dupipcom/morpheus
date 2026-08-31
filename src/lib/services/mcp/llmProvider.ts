/**
 * Configurable LLM provider for phone conversations (phase 12.5).
 *
 * Phone answers (phone_query_user_data) and public-profile summaries run on a
 * cheap/fast model by default, with a fixed cross-provider fallback so a phone
 * answer never hard-fails when one inference provider is down.
 *
 * Env knobs:
 *   PHONE_LLM_PROVIDER = deepseek (default) | telnyx
 *   PHONE_LLM_MODEL    = model id for the primary provider
 *                        (default 'deepseek-v4-flash'; telnyx default Kimi-K2.6)
 *
 * The other provider is always the fallback (DeepSeek 'deepseek-chat' when
 * telnyx is primary, Telnyx Kimi-K2.6 when deepseek is primary).
 */

import 'server-only'

import { DEEPSEEK_CHAT_MODEL, getDeepseekOpenAI } from '@/lib/deepseek'
import { telnyxChatCompletion } from './telnyxClient'

export type PhoneLlmProvider = 'deepseek' | 'telnyx'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const TELNYX_DEFAULT_MODEL = process.env.TELNYX_INFERENCE_MODEL || 'moonshotai/Kimi-K2.6'

export const PHONE_LLM_PROVIDER: PhoneLlmProvider =
  process.env.PHONE_LLM_PROVIDER === 'telnyx' ? 'telnyx' : 'deepseek'

export const PHONE_LLM_MODEL =
  process.env.PHONE_LLM_MODEL ||
  (PHONE_LLM_PROVIDER === 'deepseek' ? 'deepseek-v4-flash' : TELNYX_DEFAULT_MODEL)

async function deepseekCompletion(
  messages: ChatMessage[],
  model: string,
  maxTokens: number
): Promise<string> {
  const completion = await getDeepseekOpenAI().chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3
  })
  const content = completion.choices[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('DeepSeek completion returned no content')
  }
  return content.trim()
}

/**
 * One chat completion for the phone pipeline: primary provider first, the
 * other provider as fallback.
 */
export async function phoneChatCompletion(
  messages: ChatMessage[],
  options: { maxTokens?: number } = {}
): Promise<string> {
  const maxTokens = options.maxTokens ?? 600

  if (PHONE_LLM_PROVIDER === 'deepseek') {
    try {
      return await deepseekCompletion(messages, PHONE_LLM_MODEL, maxTokens)
    } catch {
      return telnyxChatCompletion({ messages, model: TELNYX_DEFAULT_MODEL, maxTokens })
    }
  }

  try {
    return await telnyxChatCompletion({ messages, model: PHONE_LLM_MODEL, maxTokens })
  } catch {
    return deepseekCompletion(messages, DEEPSEEK_CHAT_MODEL, maxTokens)
  }
}
