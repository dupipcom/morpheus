/**
 * Voicemail DTOs (phase 12). Pure types — no runtime imports, so the chat UI
 * can `import type` from here without pulling server-only code.
 */

export interface CreateVoicemailInput {
  targetUserId: string
  callerUserId?: string
  callerPhone?: string
  callerName?: string
  callerVerified?: boolean
  /** Message text (the platform's transcription of the caller's speech) */
  text?: string
  /** Hosted audio URL to download + store (e.g. a Telnyx recording download URL) */
  audioUrl?: string
  durationSec?: number
  telnyxConversationId?: string
  callControlId?: string
  callSessionId?: string
}

export type VoicemailStorageStatus = 'saved' | 'pending_transcription' | 'failed'

export interface CreateVoicemailResult {
  voicemailId: string
  status: VoicemailStorageStatus
  transcript: string | null
  summary: string | null
}

export interface VoicemailListItem {
  id: string
  createdAt: string
  callerUserId: string | null
  callerPhone: string | null
  callerName: string | null
  callerVerified: boolean
  hasAudio: boolean
  audioDurationSec: number | null
  transcript: string | null
  summary: string | null
  source: string
  readAt: string | null
}
