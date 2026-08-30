/**
 * Phone-query pipeline behind phone_query_user_data (phase 12).
 *
 * Access ladder — re-validated on EVERY call, never trusting the caller:
 *   1. OWNER    caller === target → full access (existing agent semantics)
 *   2. DELEGATE explicit Delegation → scope-mapped visibility allow-lists
 *   3. DELEGATE phone delegation (/app/feel third-party tab) — same scopes,
 *               resolved per-target from the caller's number
 *   4. PUBLIC   everyone else (friends included, unless delegated) → PUBLIC
 *               days + PUBLIC notes + public profile fields only
 *
 * Privacy invariant: notes with legacy visibility AI_ENABLED — or aiEnabled
 * at non-PUBLIC visibility — enter the RAG ONLY for the owner or a delegation
 * granting AI_ENABLED/PRIVATE scopes. The PUBLIC tier ignores the aiEnabled
 * flag entirely and filters visibility ∈ [PUBLIC], so AI-enabled private notes
 * can never leak into a stranger's answer while public notes stay answerable.
 */

import 'server-only'

import prisma from '@/lib/prisma'
import { getDelegationScopes, resolveEffectiveDelegationScope } from '@/lib/utils/delegation'
import { resolveNoteVisibilityFilter } from '@/lib/services/visibility/noteAccess'
import { getAllowedDayVisibilities } from '@/lib/services/agent/validation'
import type { DayVisibilityFilter } from '@/lib/services/agent/validation'
import {
  AGENT_DIMENSIONS,
  buildRagForQuery,
  chunkNotes,
  fetchCompactDays,
  fetchCompactNotes
} from '@/lib/services/agent'
import type { ResolvedAgentContext } from '@/lib/services/agent'
import { buildPhoneQuerySystemPrompt } from '@/lib/services/agent/prompt'
import { extractProfileData } from '@/lib/services/visibility'
import { filterProfileFields } from '@/lib/utils/profileUtils'
import { DEEPSEEK_CHAT_MODEL, getDeepseekOpenAI } from '@/lib/deepseek'
import { telnyxChatCompletion } from './telnyxClient'
import type { PhoneAccessLevel } from './types'
import type { NoteVisibility } from '@/generated/prisma/client'
import {
  resolvePhoneDelegationForTarget
} from './callerLookup'
import type { PhoneDelegationGrant } from './callerLookup'

export const PHONE_TIMEFRAMES = [
  'last_week',
  'last_month',
  'last_quarter',
  'last_year',
  'all_time'
] as const

export type PhoneTimeframe = (typeof PHONE_TIMEFRAMES)[number]

const TIMEFRAME_DAYS: Record<PhoneTimeframe, number> = {
  last_week: 7,
  last_month: 31,
  last_quarter: 92,
  last_year: 365,
  all_time: 730 // MAX_RANGE_DAYS ceiling, mirrors the agent validation clamp
}

/** Spoken answers have a hard ceiling so the assistant never reads an essay. */
const MAX_ANSWER_WORDS = 300

export function timeframeToRange(
  timeframe: PhoneTimeframe,
  today: Date = new Date()
): { startDate: string; endDate: string } {
  const end = new Date(today)
  end.setUTCHours(0, 0, 0, 0)
  const endDate = end.toISOString().split('T')[0]
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (TIMEFRAME_DAYS[timeframe] - 1))
  return { startDate: start.toISOString().split('T')[0], endDate }
}

export interface PhoneQueryAccess {
  accessLevel: PhoneAccessLevel
  visibilityFilter: DayVisibilityFilter[] | undefined
  noteVisibilityFilter: NoteVisibility[] | undefined
  /** Whether notes must be AI-opted-in (owner/delegate) or merely PUBLIC (public tier) */
  requireAiOptIn: boolean
}

export async function resolvePhoneAccess(
  callerUserId: string | null,
  targetUserId: string,
  phoneDelegations: PhoneDelegationGrant[] = []
): Promise<PhoneQueryAccess> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true }
  })
  if (!target) throw new Error('Target user not found')

  if (callerUserId === targetUserId) {
    return {
      accessLevel: 'OWNER',
      visibilityFilter: undefined, // full
      noteVisibilityFilter: undefined, // full
      requireAiOptIn: true
    }
  }

  if (callerUserId) {
    const delegation = await prisma.delegation.findUnique({
      where: {
        delegatorId_delegatedId: {
          delegatorId: targetUserId,
          delegatedId: callerUserId
        }
      },
      select: { id: true, scope: true, scopes: true }
    })

    if (delegation) {
      const scopes = getDelegationScopes(delegation.scopes, delegation.scope)
      const effectiveScope = resolveEffectiveDelegationScope(scopes, delegation.scope)
      if (!effectiveScope) throw new Error('Not authorized for selected user data')

      return {
        accessLevel: 'DELEGATE',
        visibilityFilter: getAllowedDayVisibilities(effectiveScope),
        // AI_ENABLED notes only enter the filter when the delegation grants
        // AI_ENABLED/PRIVATE scopes (see noteAccess mapping) — privacy invariant.
        noteVisibilityFilter: resolveNoteVisibilityFilter(scopes, delegation.scope) ?? ['PUBLIC'],
        requireAiOptIn: true
      }
    }
  }

  // Phone delegation: the target user granted this caller's NUMBER access —
  // same DELEGATE semantics, scopes chosen per-target (agentTarget fixes the
  // target on a call, so the matching grant is unambiguous).
  const phoneGrant = resolvePhoneDelegationForTarget(phoneDelegations, targetUserId)
  if (phoneGrant) {
    const scopes = getDelegationScopes(phoneGrant.scopes, phoneGrant.scope)
    const effectiveScope = resolveEffectiveDelegationScope(scopes, phoneGrant.scope)
    if (!effectiveScope) throw new Error('Not authorized for selected user data')

    return {
      accessLevel: 'DELEGATE',
      visibilityFilter: getAllowedDayVisibilities(effectiveScope),
      noteVisibilityFilter: resolveNoteVisibilityFilter(scopes, phoneGrant.scope) ?? ['PUBLIC'],
      requireAiOptIn: true
    }
  }

  // No delegation → PUBLIC tier, regardless of friendship.
  return {
    accessLevel: 'PUBLIC',
    visibilityFilter: ['PUBLIC'],
    noteVisibilityFilter: ['PUBLIC'],
    requireAiOptIn: false
  }
}

async function getPublicProfile(targetUserId: string): Promise<Record<string, unknown>> {
  const profile = await prisma.profile.findUnique({
    where: { userId: targetUserId },
    select: { data: true }
  })
  if (!profile) return { userName: null }
  const profileData = extractProfileData(profile.data as Record<string, unknown>)
  return filterProfileFields(profileData, {
    isOwner: false,
    isFriend: false,
    isCloseFriend: false
  })
}

export interface PhoneQueryInput {
  callerUserId: string | null
  targetUserId: string
  query: string
  timeframe: PhoneTimeframe
  locale?: string
  phoneDelegations?: PhoneDelegationGrant[]
}

export interface PhoneQueryResult {
  answer: string
  accessLevel: PhoneAccessLevel
  visibilityFilter?: DayVisibilityFilter[]
}

export async function queryUserDataForPhone(input: PhoneQueryInput): Promise<PhoneQueryResult> {
  const { startDate, endDate } = timeframeToRange(input.timeframe)
  const access = await resolvePhoneAccess(
    input.callerUserId,
    input.targetUserId,
    input.phoneDelegations
  )

  const ctx: ResolvedAgentContext = {
    targetUserId: input.targetUserId,
    userLabel: input.callerUserId === input.targetUserId ? 'you' : 'the person you asked about',
    startDate,
    endDate,
    dimensions: [...AGENT_DIMENSIONS],
    visibilityFilter: access.visibilityFilter,
    noteVisibilityFilter: access.noteVisibilityFilter,
    isRestricted: access.accessLevel !== 'OWNER'
  }

  const [compactDays, compactNotes] = await Promise.all([
    fetchCompactDays(ctx),
    fetchCompactNotes(ctx, { requireAiOptIn: access.requireAiOptIn })
  ])

  const rag = await buildRagForQuery(compactDays, input.query, {
    dimensions: ctx.dimensions,
    userChunkTopK: 8,
    docChunkTopK: 2,
    noteChunks: chunkNotes(compactNotes)
  })

  const publicProfile =
    access.accessLevel === 'PUBLIC' ? await getPublicProfile(input.targetUserId) : null

  const systemPrompt = buildPhoneQuerySystemPrompt({
    accessLevel: access.accessLevel,
    locale: input.locale ?? 'en',
    startDate,
    endDate,
    rag,
    publicProfile
  })

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Question from the caller: ${input.query}` }
  ] as Array<{ role: 'system' | 'user'; content: string }>

  let answer: string
  try {
    answer = await telnyxChatCompletion({ messages, maxTokens: 600 })
  } catch {
    // DeepSeek fallback — a phone answer must not hard-fail when inference is down
    const completion = await getDeepseekOpenAI().chat.completions.create({
      model: DEEPSEEK_CHAT_MODEL,
      messages,
      max_tokens: 600,
      temperature: 0.3
    })
    const content = completion.choices[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Answer generation failed')
    }
    answer = content.trim()
  }

  const words = answer.split(/\s+/)
  if (words.length > MAX_ANSWER_WORDS) {
    answer = words.slice(0, MAX_ANSWER_WORDS).join(' ')
  }

  return {
    answer,
    accessLevel: access.accessLevel,
    visibilityFilter: access.visibilityFilter
  }
}
