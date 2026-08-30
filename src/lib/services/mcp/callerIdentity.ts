/**
 * True-caller resolution for MCP tool calls (phase 12).
 *
 * Telnyx injects telnyx_conversation_id into the _meta of every MCP tool call
 * (platform-set, prompt-injection resistant). We resolve the conversation and
 * read metadata.telnyx_end_user_target. The caller identity is NEVER taken
 * from LLM-supplied tool arguments.
 *
 * Results are cached per conversation for a short window: one call produces
 * several tool calls, and conversations are immutable once ended.
 */

import 'server-only'

import { getConversation } from './telnyxClient'
import type { TrueCaller } from './types'

const CACHE_TTL_MS = 60_000
const CACHE_MAX_ENTRIES = 500

interface CacheEntry {
  value: TrueCaller | null
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export async function getTrueCaller(
  meta: Record<string, unknown> | undefined
): Promise<TrueCaller | null> {
  const conversationId =
    meta && typeof meta.telnyx_conversation_id === 'string'
      ? meta.telnyx_conversation_id
      : null
  if (!conversationId) return null

  const now = Date.now()
  const cached = cache.get(conversationId)
  if (cached && cached.expiresAt > now) return cached.value

  const value = await resolveFromConversation(conversationId)

  cache.set(conversationId, { value, expiresAt: now + CACHE_TTL_MS })
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0]
    if (oldest) cache.delete(oldest[0])
  }
  return value
}

async function resolveFromConversation(conversationId: string): Promise<TrueCaller | null> {
  const conversation = await getConversation(conversationId)
  if (!conversation) return null

  const phone = conversation.metadata?.telnyx_end_user_target ?? ''
  if (!phone) return null

  return {
    phone,
    verified: conversation.metadata?.telnyx_end_user_target_verified === 'true',
    agentTarget: conversation.metadata?.telnyx_agent_target,
    conversationId
  }
}
