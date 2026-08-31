/**
 * Server-side validation of the client filter context + delegation resolution.
 * Every chat prompt is parsed here: dates are format-checked and clamped,
 * dimensions are whitelisted, and the target user is resolved through the
 * existing delegation rules — the MongoDB query is built from the result.
 */

import prisma from '@/lib/prisma'
import { getDelegationScopes, resolveEffectiveDelegationScope } from '@/lib/utils/delegation'
import { resolveNoteVisibilityFilter } from '@/lib/services/visibility/noteAccess'
import { AGENT_DIMENSIONS, MOOD_DIMENSIONS } from './types'
import type { AgentDimension, AgentFilterContext, ResolvedAgentContext } from './types'
import type { MoodScope, NoteVisibility } from '@/generated/prisma/client'

export type DayVisibilityFilter = 'PUBLIC' | 'FRIENDS' | 'CLOSE_FRIENDS'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const MAX_RANGE_DAYS = 730

/**
 * Visibility allow-list for restricted delegation scopes (shared with the
 * user-dashboard-data route — moved here to keep a single copy).
 * Returning undefined means "no visibility filtering" (full access).
 */
export function getAllowedDayVisibilities(scope: string): DayVisibilityFilter[] | undefined {
  switch (scope) {
    case 'PRIVATE':
    case 'AI_ENABLED':
      return undefined
    case 'PUBLIC':
      return ['PUBLIC']
    case 'CLOSE_FRIENDS':
      return ['PUBLIC', 'CLOSE_FRIENDS']
    case 'FRIENDS':
      return ['PUBLIC', 'FRIENDS', 'CLOSE_FRIENDS']
    case 'DOC_ENABLED':
      // Defensive: DOC_ENABLED is not a grantable scope; least privilege = no days
      return []
    default:
      return undefined
  }
}

const MOOD_SUB_DIMENSION_KEYS = new Set<string>(MOOD_DIMENSIONS)

/**
 * Mood-data access levels on delegations: ALL_DIMENSIONS keeps every mood
 * dimension; AVERAGE_ONLY drops the six sub-dimensions (the overall average
 * survives); NONE drops mood entirely. Dimensions are the single filter point
 * — the DB select, compaction, and chunk text are all dimension-driven — so
 * clamping here removes mood from everything downstream. Shared by the phone
 * pipeline (queryUserDataForPhone) and the in-app agent (resolveAgentContext).
 */
export function clampDimensionsForMoodScope(
  dimensions: AgentDimension[],
  moodScope: MoodScope
): AgentDimension[] {
  if (moodScope === 'ALL_DIMENSIONS') return dimensions
  return dimensions.filter((dim) => {
    if (MOOD_SUB_DIMENSION_KEYS.has(dim)) return false
    if (moodScope === 'NONE' && dim === 'moodAverage') return false
    return true
  })
}

function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
}

/**
 * Validate and clamp the raw client-provided filter context.
 * Throws user-safe Error messages before any DB or LLM work happens.
 */
export function validateAndClampFilterContext(raw: unknown): AgentFilterContext {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid filter context')
  }

  const input = raw as Record<string, unknown>

  if (typeof input.startDate !== 'string' || !isValidDateString(input.startDate)) {
    throw new Error('Invalid start date')
  }
  if (typeof input.endDate !== 'string' || !isValidDateString(input.endDate)) {
    throw new Error('Invalid end date')
  }

  const startDate = input.startDate
  let endDate = input.endDate
  if (startDate > endDate) {
    throw new Error('Invalid date range')
  }

  // Clamp oversized ranges (string compare works for YYYY-MM-DD)
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime()
  const endMs = new Date(`${endDate}T00:00:00Z`).getTime()
  const rangeDays = Math.ceil((endMs - startMs) / 86400000)
  if (rangeDays > MAX_RANGE_DAYS) {
    endDate = new Date(startMs + MAX_RANGE_DAYS * 86400000).toISOString().split('T')[0]
  }

  const filter: AgentFilterContext = { startDate, endDate }

  if (typeof input.userId === 'string' && input.userId.trim()) {
    filter.userId = input.userId.trim()
  }

  if (Array.isArray(input.dimensions)) {
    filter.dimensions = input.dimensions.filter(
      (dim): dim is AgentDimension =>
        typeof dim === 'string' && (AGENT_DIMENSIONS as readonly string[]).includes(dim)
    )
  }

  return filter
}

/**
 * Resolve the validated filter into a target user + visibility rules.
 * Never trusts the client-provided userId — a delegation record is required
 * for any target other than the authenticated user.
 */
export async function resolveAgentContext(
  filter: AgentFilterContext,
  clerkUserId: string
): Promise<ResolvedAgentContext> {
  const requestingUser = await prisma.user.findUnique({
    where: { userId: clerkUserId },
    select: { id: true }
  })
  if (!requestingUser) {
    throw new Error('User not found')
  }

  const targetUserId = filter.userId || requestingUser.id
  let userLabel = 'you'
  let visibilityFilter: DayVisibilityFilter[] | undefined
  let noteVisibilityFilter: NoteVisibility[] | undefined
  // Mood access is clamped server-side — never trusts the client's dimension
  // toggles. Owner self-view keeps full access.
  let moodScope: MoodScope = 'ALL_DIMENSIONS'

  if (targetUserId !== requestingUser.id) {
    const delegation = await prisma.delegation.findUnique({
      where: {
        delegatorId_delegatedId: {
          delegatorId: targetUserId,
          delegatedId: requestingUser.id
        }
      },
      select: { id: true, scope: true, scopes: true, moodScope: true }
    })

    if (!delegation) {
      throw new Error('Not authorized for selected user data')
    }

    const delegationScopes = getDelegationScopes(delegation.scopes, delegation.scope)
    const effectiveScope = resolveEffectiveDelegationScope(delegationScopes, delegation.scope)
    if (!effectiveScope) {
      throw new Error('Not authorized for selected user data')
    }

    visibilityFilter = getAllowedDayVisibilities(effectiveScope)
    noteVisibilityFilter = resolveNoteVisibilityFilter(delegationScopes, delegation.scope)
    moodScope = delegation.moodScope
    userLabel = 'the delegated user'
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true }
  })
  if (!targetUser) {
    throw new Error('Target user not found')
  }

  return {
    targetUserId,
    userLabel,
    startDate: filter.startDate,
    endDate: filter.endDate,
    dimensions: clampDimensionsForMoodScope(filter.dimensions ?? [], moodScope),
    visibilityFilter,
    noteVisibilityFilter,
    isRestricted: visibilityFilter !== undefined || noteVisibilityFilter !== undefined
  }
}
