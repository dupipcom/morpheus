/**
 * Note-visibility access shared by the notes API and the agent RAG.
 * Resolves a delegation's scopes into the note visibilities the delegate
 * may read. Any delegation (any role, any scope) unlocks DOC_ENABLED notes;
 * PRIVATE notes require the PRIVATE scope. undefined = full access (owner or
 * PRIVATE-scope delegate).
 */

import { resolveEffectiveDelegationScope } from '@/lib/utils/delegation'
import type { NoteVisibility } from '@/generated/prisma/client'

/**
 * Note-visibility allow-list for a delegation scope.
 * Returning undefined means "no visibility filtering" (full access).
 */
export function getNoteVisibilitiesForScope(scope: string): NoteVisibility[] | undefined {
  switch (scope) {
    case 'PRIVATE':
      return undefined
    case 'AI_ENABLED':
      return ['AI_ENABLED', 'FRIENDS', 'CLOSE_FRIENDS', 'PUBLIC', 'DOC_ENABLED']
    case 'FRIENDS':
      return ['FRIENDS', 'CLOSE_FRIENDS', 'PUBLIC', 'DOC_ENABLED']
    case 'CLOSE_FRIENDS':
      return ['CLOSE_FRIENDS', 'PUBLIC', 'DOC_ENABLED']
    case 'PUBLIC':
      return ['PUBLIC', 'DOC_ENABLED']
    case 'DOC_ENABLED':
      // Defensive: not a grantable scope; least privilege = doc notes only
      return ['DOC_ENABLED']
    default:
      return undefined
  }
}

/**
 * Resolve a delegation (raw scopes + legacy fallback scope) into the note
 * visibility allow-list the delegate may read.
 */
export function resolveNoteVisibilityFilter(
  scopes: string[] | null | undefined,
  fallbackScope?: string | null
): NoteVisibility[] | undefined {
  const effective = resolveEffectiveDelegationScope(scopes, fallbackScope)
  if (!effective) return undefined
  return getNoteVisibilitiesForScope(effective)
}
