/**
 * Voicemail service (phase 12) — stores phone voicemails from the Telnyx AI
 * assistant (and call.recording.saved webhooks) so they appear in the
 * recipient's /app/chat voicemail inbox.
 *
 * Audio goes to iDrive e2 under vm/<targetUserId>/... (private bucket —
 * playback streams through the authenticated audio route, attachments-file
 * pattern). AI transcript + summary are best-effort: a voicemail is never
 * lost because inference is down. Ably + in-app notification + unread
 * invalidation are fire-and-forget side effects.
 */

import 'server-only'

import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { deleteObject, objectKeyForVoicemail, putObject } from '@/lib/storage/s3'
import { publishUserInvalidation } from '@/lib/chat/api'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'
import { getChatVoicemailChannelName } from '@/lib/chat/realtime/channelNames'
import { notifyUser } from '@/lib/services/notification/notificationService'
import { downloadAudio, summarizeText, transcribeFromUrl } from './transcription'
import type { Voicemail as VoicemailRow } from '@/generated/prisma/client'
import type {
  CreateVoicemailInput,
  CreateVoicemailResult,
  VoicemailListItem
} from './types'

const MAX_LIST_RESULTS = 50

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
}

export function serializeVoicemail(voicemail: VoicemailRow): VoicemailListItem {
  return {
    id: voicemail.id,
    createdAt: voicemail.createdAt.toISOString(),
    callerUserId: voicemail.callerUserId,
    callerPhone: voicemail.callerPhone,
    callerName: voicemail.callerName,
    callerVerified: voicemail.callerVerified,
    hasAudio: Boolean(voicemail.audioKey),
    audioDurationSec: voicemail.audioDurationSec,
    transcript: voicemail.transcript,
    summary: voicemail.summary,
    source: voicemail.source,
    readAt: voicemail.readAt ? voicemail.readAt.toISOString() : null
  }
}

/**
 * Store a voicemail (called by the MCP phone_record_message tool).
 * Persisting the row is the primary outcome — audio download/storage and
 * transcription/summary are best-effort enrichments.
 */
export async function createVoicemail(input: CreateVoicemailInput): Promise<CreateVoicemailResult> {
  // 1) Audio (best-effort — text-only voicemails are valid)
  let audioKey: string | null = null
  let audioMimeType: string | null = null
  if (input.audioUrl) {
    try {
      const audio = await downloadAudio(input.audioUrl)
      audioKey = objectKeyForVoicemail(input.targetUserId, audio.extension)
      audioMimeType = audio.contentType
      await putObject(audioKey, audio.body, audio.contentType, audio.contentLength)
    } catch (error) {
      console.warn(
        '[voicemail] audio download/store failed — continuing without audio',
        error instanceof Error ? error.message : error
      )
    }
  }

  // 2) Transcript + summary (best-effort — the recording webhook retries)
  let transcript = input.text ? sanitizeText(input.text) : null
  let summary: string | null = null
  let status: CreateVoicemailResult['status'] = transcript ? 'saved' : 'pending_transcription'
  try {
    if (!transcript && input.audioUrl) {
      const raw = await transcribeFromUrl(input.audioUrl)
      if (raw) transcript = sanitizeText(raw)
    }
    if (transcript) {
      summary = sanitizeText(await summarizeText(transcript))
      status = 'saved'
    }
  } catch (error) {
    console.warn(
      '[voicemail] transcription/summary failed',
      error instanceof Error ? error.message : error
    )
  }

  // 3) Persist — idempotent on telnyxConversationId (webhook/tool retries)
  let voicemail: VoicemailRow
  try {
    voicemail = await prisma.voicemail.create({
      data: {
        targetUserId: input.targetUserId,
        callerUserId: input.callerUserId ?? null,
        callerPhone: input.callerPhone ?? null,
        callerName: input.callerName ?? null,
        callerVerified: input.callerVerified ?? false,
        audioKey,
        audioMimeType,
        audioDurationSec: input.durationSec ?? null,
        transcript,
        summary,
        source: 'AI_ASSISTANT',
        telnyxConversationId: input.telnyxConversationId ?? null,
        callSessionId: input.callSessionId ?? null,
        callControlId: input.callControlId ?? null
      }
    })
  } catch (error) {
    if (isUniqueViolation(error) && input.telnyxConversationId) {
      const existing = await prisma.voicemail.findUnique({
        where: { telnyxConversationId: input.telnyxConversationId }
      })
      if (existing) {
        return {
          voicemailId: existing.id,
          status: existing.transcript ? 'saved' : 'pending_transcription',
          transcript: existing.transcript,
          summary: existing.summary
        }
      }
    }
    throw error
  }

  // 4) Realtime + in-app notification + unread invalidation (fire-and-forget)
  void Promise.allSettled([
    publishAblyEvent(getChatVoicemailChannelName(input.targetUserId), CHAT_EVENTS.VOICEMAIL_CREATED, {
      voicemailId: voicemail.id
    }),
    publishUserInvalidation([input.targetUserId], { voicemailId: voicemail.id }),
    notifyUser({
      userId: input.targetUserId,
      type: 'VOICEMAIL',
      actorId: input.callerUserId ?? null,
      resourceId: voicemail.id,
      message: input.callerName
        ? `New voicemail from ${input.callerName}`
        : 'You have a new voicemail'
    })
  ]).catch(() => {})

  return {
    voicemailId: voicemail.id,
    status,
    transcript: voicemail.transcript,
    summary: voicemail.summary
  }
}

/** Own voicemails, newest first, with the unread count. */
export async function listVoicemails(
  targetUserId: string
): Promise<{ voicemails: VoicemailListItem[]; unreadCount: number }> {
  const [voicemails, unreadCount] = await Promise.all([
    prisma.voicemail.findMany({
      where: { targetUserId },
      orderBy: { createdAt: 'desc' },
      take: MAX_LIST_RESULTS
    }),
    prisma.voicemail.count({ where: { targetUserId, readAt: null } })
  ])

  return {
    voicemails: voicemails.map(serializeVoicemail),
    unreadCount
  }
}

/** Mark one voicemail read. Returns the number of rows newly marked. */
export async function markAllVoicemailsRead(targetUserId: string): Promise<number> {
  const result = await prisma.voicemail.updateMany({
    where: { targetUserId, readAt: null },
    data: { readAt: new Date() }
  })
  return result.count
}

/** Mark one voicemail read. Returns the number of rows newly marked. */
export async function markVoicemailRead(targetUserId: string, id: string): Promise<number> {
  const result = await prisma.voicemail.updateMany({
    where: { id, targetUserId, readAt: null },
    data: { readAt: new Date() }
  })
  return result.count
}

/**
 * Delete a voicemail (owner-only). The S3 object is removed first,
 * best-effort — same order as the attachments delete route.
 */
export async function deleteVoicemail(targetUserId: string, id: string): Promise<boolean> {
  const voicemail = await prisma.voicemail.findFirst({
    where: { id, targetUserId },
    select: { id: true, audioKey: true }
  })
  if (!voicemail) return false

  if (voicemail.audioKey) {
    try {
      await deleteObject(voicemail.audioKey)
    } catch (error) {
      console.warn('[voicemail] S3 delete failed', error instanceof Error ? error.message : error)
    }
  }

  await prisma.voicemail.deleteMany({ where: { id, targetUserId } })
  return true
}

/** Audio object key for an owned voicemail (null when missing/not owned). */
export async function getVoicemailAudioKey(
  targetUserId: string,
  id: string
): Promise<{ key: string; mimeType: string } | null> {
  const voicemail = await prisma.voicemail.findFirst({
    where: { id, targetUserId },
    select: { audioKey: true, audioMimeType: true }
  })
  if (!voicemail?.audioKey) return null
  return { key: voicemail.audioKey, mimeType: voicemail.audioMimeType || 'audio/mpeg' }
}
