/**
 * Shared types for the Dupip MCP server (phase 12): caller identity, access
 * levels and the phone-tool DTOs. Server-only.
 */

import 'server-only'

/** Data access tier of a phone caller relative to the user being asked about. */
export type PhoneAccessLevel =
  | 'OWNER'
  | 'DELEGATE'
  | 'PUBLIC'
  | 'UNKNOWN'

/** Human label for the caller-target relation (label only — never grants data). */
export type CallerRelationship = 'self' | 'delegate' | 'friend' | 'close_friend' | 'stranger' | 'none'

/**
 * Authoritative caller facts derived from the Telnyx conversation metadata.
 * Never taken from LLM-supplied tool arguments.
 */
export interface TrueCaller {
  /** E.164 caller number (metadata.telnyx_end_user_target) */
  phone: string
  /** STIR/SHAKEN Full (A) attestation as reported by the platform */
  verified: boolean
  /** The called number (metadata.telnyx_agent_target) */
  agentTarget?: string
  /** Call correlation ids from conversation metadata — used to attach the
   *  call recording to the voicemail once it becomes available. */
  callSessionId: string | null
  callControlId: string | null
  conversationId: string
}

/** What phone_auth_by_callerid reports about the person on the line. */
export interface CallerIdentity {
  known: boolean
  userId?: string
  name?: string
  username?: string
  avatarUrl?: string
  accessLevel: PhoneAccessLevel
  relationship: CallerRelationship
  verified: boolean
}

/** Resolution of a "who is the person I should talk about" descriptor. */
export interface TargetUserResolution {
  userId: string
  name?: string
  username?: string
}
