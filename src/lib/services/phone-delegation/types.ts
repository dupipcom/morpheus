/**
 * Phone delegation (phase 12): grants a caller phone number access to the
 * delegator's data during Telnyx phone conversations, at the same
 * fine-grained scopes as user Delegations.
 */

import type { MoodScope, NoteVisibility } from '@/generated/prisma/client'

export interface PhoneDelegationDTO {
  id: string
  phoneNumber: string
  label: string | null
  scopes: NoteVisibility[]
  /** Mood-data access granted to this number (NONE = privacy-first default) */
  moodScope: MoodScope
  createdAt: string
}

export interface UpsertPhoneDelegationInput {
  phoneNumber: string
  label?: string
  scopes?: NoteVisibility[]
  moodScope?: MoodScope
}
