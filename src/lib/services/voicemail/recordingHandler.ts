/**
 * Recording attach (phase 12).
 *
 * Two paths:
 * 1. `call.recording.saved` webhook (handleRecordingSaved) — kept for
 *    connections that do forward the event.
 * 2. Lazy attach (ensureVoicemailAudio) — the AI assistant's managed
 *    connection has no event webhook (connections API is read-only for it),
 *    so recordings are PULLED by call_session_id from the recordings API
 *    when the recipient loads the voicemail conversation or plays the audio.
 *
 * Both share attachRecordingAudio: download MP3/WAV (URLs expire ~10 min —
 * they are regenerated per list call), store in iDrive e2, update the row
 * and notify the recipient.
 */

import 'server-only'

import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { objectKeyForVoicemail, putObject } from '@/lib/storage/s3'
import { publishUserInvalidation } from '@/lib/chat/api'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'
import { getChatVoicemailChannelName } from '@/lib/chat/realtime/channelNames'
import { getConversation, getRecording, listRecordings } from '@/lib/services/mcp/telnyxClient'
import { resolveTargetUser } from '@/lib/services/mcp/targetResolution'
import { downloadAudio, summarizeText, transcribeFromUrl } from './transcription'

interface VoicemailForAttach {
  id: string
  targetUserId: string
  audioKey: string | null
  audioMimeType: string | null
  transcript: string | null
  summary: string | null
}

/** Download → S3 → row update → realtime. Shared by both paths. */
async function attachRecordingAudio(
  voicemail: VoicemailForAttach,
  downloadUrl: string,
  durationSec?: number
): Promise<{ audioKey: string; audioMimeType: string }> {
  const audio = await downloadAudio(downloadUrl)
  const audioKey = objectKeyForVoicemail(voicemail.targetUserId, audio.extension)
  await putObject(audioKey, audio.body, audio.contentType, audio.contentLength)

  await prisma.voicemail.update({
    where: { id: voicemail.id },
    data: {
      audioKey,
      audioMimeType: audio.contentType,
      ...(durationSec !== undefined && !voicemail.audioKey
        ? { audioDurationSec: durationSec }
        : {})
    }
  })

  void Promise.allSettled([
    publishAblyEvent(getChatVoicemailChannelName(voicemail.targetUserId), CHAT_EVENTS.VOICEMAIL_UPDATED, {
      voicemailId: voicemail.id
    }),
    publishUserInvalidation([voicemail.targetUserId], { voicemailId: voicemail.id })
  ]).catch(() => {})

  return { audioKey, audioMimeType: audio.contentType }
}

export async function handleRecordingSaved(payload: Record<string, unknown>): Promise<void> {
  const recordingId = typeof payload.id === 'string' ? payload.id : ''
  const callSessionId = typeof payload.call_session_id === 'string' ? payload.call_session_id : null
  const callControlId = typeof payload.call_control_id === 'string' ? payload.call_control_id : null
  const from = typeof payload.from === 'string' ? payload.from : null
  const to = typeof payload.to === 'string' ? payload.to : null
  if (!recordingId) return

  // 1) Match an existing voicemail created by phone_record_message
  const matchClauses: Array<Record<string, unknown>> = []
  if (callSessionId) matchClauses.push({ callSessionId })
  if (callControlId) matchClauses.push({ callControlId })

  let voicemail = matchClauses.length > 0
    ? await prisma.voicemail.findFirst({
        where: { OR: matchClauses },
        orderBy: { createdAt: 'desc' }
      })
    : null

  if (!voicemail) {
    // 2) Degraded path: recording without a tool-created row — attribute it to
    //    the owner of the dialed number when resolvable, else drop it.
    const target = await resolveTargetUser(null, to)
    if (!target) return
    voicemail = await prisma.voicemail.create({
      data: {
        targetUserId: target.userId,
        callerPhone: from,
        callerVerified: false,
        source: 'RECORDING',
        callSessionId,
        callControlId
      }
    })
  }

  // 3) Download the audio and store it (best-effort)
  const recording = await getRecording(recordingId)
  const downloadUrl = recording?.downloadUrls.mp3 ?? recording?.downloadUrls.wav
  if (!downloadUrl) return

  try {
    if (!voicemail.audioKey) {
      await attachRecordingAudio(
        voicemail,
        downloadUrl,
        recording?.durationMillis !== undefined
          ? Math.round(recording.durationMillis / 1000)
          : undefined
      )
    }
  } catch (error) {
    console.warn(
      '[voicemail] recording download/store failed',
      error instanceof Error ? error.message : error
    )
  }

  // 4) Backfill transcript/summary when missing (best-effort)
  let transcript = voicemail.transcript
  let summary = voicemail.summary
  if (!transcript) {
    try {
      transcript = sanitizeText(await transcribeFromUrl(downloadUrl))
      summary = transcript ? sanitizeText(await summarizeText(transcript)) : null
    } catch (error) {
      console.warn(
        '[voicemail] recording transcription failed',
        error instanceof Error ? error.message : error
      )
    }
  }

  // 5) Persist the enrichment (also backfills correlation ids on matched rows)
  await prisma.voicemail.update({
    where: { id: voicemail.id },
    data: {
      transcript: transcript ?? voicemail.transcript,
      summary: summary ?? voicemail.summary,
      ...(callSessionId && !voicemail.callSessionId ? { callSessionId } : {}),
      ...(callControlId && !voicemail.callControlId ? { callControlId } : {})
    }
  })
}

const ATTACH_MIN_ATTEMPT_GAP_MS = 3 * 60 * 1000
const ATTACH_MAX_ATTEMPTS = 6
const ATTACH_MIN_AGE_MS = 90 * 1000 // let Telnyx finalize the recording
const ATTACH_MAX_AGE_MS = 24 * 3600 * 1000

/**
 * Pull the finalized call recording for one voicemail and attach it.
 *
 * The assistant's managed connection never forwards call.recording.saved
 * (connections API is read-only for it, no assistant-level event webhook),
 * so this is the primary attach path — triggered lazily when the recipient
 * loads the voicemail conversation (list endpoint) or plays the audio
 * (audio endpoint). Throttled per row: ≥3 min between attempts, max 6.
 */
export async function ensureVoicemailAudio(
  voicemailId: string
): Promise<{ attached: boolean; skipped: string | null }> {
  const voicemail = await prisma.voicemail.findUnique({ where: { id: voicemailId } })
  if (!voicemail) return { attached: false, skipped: 'missing' }
  if (voicemail.audioKey) return { attached: false, skipped: 'has-audio' }

  const ageMs = Date.now() - voicemail.createdAt.getTime()
  if (ageMs < ATTACH_MIN_AGE_MS) return { attached: false, skipped: 'too-early' }
  if (ageMs > ATTACH_MAX_AGE_MS) return { attached: false, skipped: 'too-old' }
  if (voicemail.recordingAttempts >= ATTACH_MAX_ATTEMPTS) {
    return { attached: false, skipped: 'max-attempts' }
  }
  if (
    voicemail.recordingAttemptedAt &&
    Date.now() - voicemail.recordingAttemptedAt.getTime() < ATTACH_MIN_ATTEMPT_GAP_MS
  ) {
    return { attached: false, skipped: 'throttled' }
  }

  // Mark the attempt before the slow work (concurrent refreshes race safely)
  await prisma.voicemail.update({
    where: { id: voicemailId },
    data: { recordingAttemptedAt: new Date(), recordingAttempts: { increment: 1 } }
  })

  try {
    let callSessionId: string | null = voicemail.callSessionId
    let callControlId: string | null = voicemail.callControlId

    // Rows created before the tool stored correlation ids: recover them
    // from the conversation metadata.
    if (!callSessionId && voicemail.telnyxConversationId) {
      const conversation = await getConversation(voicemail.telnyxConversationId)
      callSessionId = conversation?.metadata?.call_session_id ?? null
      callControlId = conversation?.metadata?.call_control_id ?? null
      if (callSessionId || callControlId) {
        await prisma.voicemail.update({
          where: { id: voicemailId },
          data: { callSessionId, callControlId }
        })
      }
    }
    if (!callSessionId) return { attached: false, skipped: 'no-call-session' }

    const recordings = await listRecordings({ callSessionId })
    const recording = recordings.find(
      (r) => r.status === 'completed' && (r.downloadUrls.mp3 || r.downloadUrls.wav)
    )
    if (!recording) return { attached: false, skipped: 'no-recording' }

    const downloadUrl = recording.downloadUrls.mp3 ?? recording.downloadUrls.wav!
    await attachRecordingAudio(
      voicemail,
      downloadUrl,
      recording.durationMillis !== undefined
        ? Math.round(recording.durationMillis / 1000)
        : undefined
    )
    return { attached: true, skipped: null }
  } catch (error) {
    console.warn(
      '[voicemail] ensureVoicemailAudio failed',
      voicemailId.slice(0, 10),
      error instanceof Error ? error.message : error
    )
    return { attached: false, skipped: 'error' }
  }
}
