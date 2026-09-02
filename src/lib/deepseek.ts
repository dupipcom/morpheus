import { deepseek } from '@ai-sdk/deepseek'
import OpenAI from 'openai'

export const DEEPSEEK_CHAT_MODEL = 'deepseek-chat'
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

/**
 * AI SDK provider model for chat streaming (streamText / generateText).
 * Reads DEEPSEEK_API_KEY from the environment by default.
 */
export const deepseekChat = deepseek(DEEPSEEK_CHAT_MODEL)

let openaiCompatClient: OpenAI | null = null

/**
 * Lazy OpenAI-compatible client for the DeepSeek endpoints the AI SDK provider
 * does not cover: Chat Completions with response_format json_object (hint
 * route, RAG LLM ranker). DeepSeek has no embeddings API — RAG retrieval is
 * lexical pre-filter + LLM ranking (see services/agent/ranker.ts).
 *
 * Constructed lazily so modules can be imported without the env var being set.
 */
export function getDeepseekOpenAI(): OpenAI {
  if (!openaiCompatClient) {
    openaiCompatClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL
    })
  }
  return openaiCompatClient
}
