/**
 * Note-visibility access shared by the notes API and the agent RAG.
 * Resolves a delegation's scopes into the note visibilities the delegate
 * may read.
 *
 * Scope→visibility mapping is now direct (no hierarchical expansion):
 * delegating PRIVATE grants access to PRIVATE notes only; delegating FRIENDS
 * grants access to FRIENDS notes only, etc.
 *
 * Legacy: notes that were written with `visibility = AI_ENABLED` are treated
 * as PRIVATE notes with the AI toggle on. When PRIVATE is delegated, the
 * filter therefore also includes AI_ENABLED.
 *
 * undefined = full access (owner, not a delegated request).
 */

import { getDelegationScopes } from '@/lib/utils/delegation'
import type { NoteVisibility } from '@/generated/prisma/client'

/**
 * Direct note-visibility allow-list for a single delegation scope.
 * No hierarchical expansion — the delegated scope is the exact visibility
 * bucket the delegate may read, plus legacy AI_ENABLED handling for PRIVATE.
 */
export function getNoteVisibilitiesForScope(scope: string): NoteVisibility[] {
  switch (scope) {
    case 'PRIVATE':
      // Legacy: old AI_ENABLED-visibility notes are treated as PRIVATE+aiToggle
      return ['PRIVATE', 'AI_ENABLED']
    case 'AI_ENABLED':
      // Legacy delegation scope: grants access to notes with the legacy AI_ENABLED visibility
      return ['AI_ENABLED']
    case 'FRIENDS':
      return ['FRIENDS']
    case 'CLOSE_FRIENDS':
      return ['CLOSE_FRIENDS']
    case 'PUBLIC':
      return ['PUBLIC']
    case 'DOC_ENABLED':
      return ['DOC_ENABLED']
    default:
      return []
  }
}

/**
 * Resolve a delegation (raw scopes + legacy fallback scope) into the note
 * visibility allow-list the delegate may read. Union semantics across all
 * granted scopes; an empty result means the delegation grants no note access.
 * Returns undefined (no filter = full owner access) when called with no scopes.
 */
export function resolveNoteVisibilityFilter(
  scopes: string[] | null | undefined,
  fallbackScope?: string | null
): NoteVisibility[] | undefined {
  const delegationScopes = getDelegationScopes(scopes, fallbackScope)
  if (delegationScopes.length === 0) return undefined

  const allVisibilities = new Set<NoteVisibility>()
  for (const scope of delegationScopes) {
    for (const v of getNoteVisibilitiesForScope(scope)) {
      allVisibilities.add(v)
    }
  }
  return Array.from(allVisibilities)
}
