/**
 * call.recording.saved webhook handling (phase 12).
 *
 * Matches the recording to a Voicemail row via callSessionId/callControlId
 * (set by the phone_record_message tool from the call context), downloads the
 * MP3/WAV from Telnyx (download URLs expire ~10 min), stores it in iDrive e2
 * and backfills transcript/summary. No match → creates a degraded voicemail
 * from the recording alone (caller phone from the `from` field).
 */

import 'server-only'

import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { objectKeyForVoicemail, putObject } from '@/lib/storage/s3'
import { publishUserInvalidation } from '@/lib/chat/api'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'
import { getChatVoicemailChannelName } from '@/lib/chat/realtime/channelNames'
import { getRecording } from '@/lib/services/mcp/telnyxClient'
import { resolveTargetUser } from '@/lib/services/mcp/targetResolution'
import { downloadAudio, summarizeText, transcribeFromUrl } from './transcription'

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

  let audioKey = voicemail.audioKey
  let audioMimeType = voicemail.audioMimeType
  try {
    const audio = await downloadAudio(downloadUrl)
    if (!audioKey) {
      audioKey = objectKeyForVoicemail(voicemail.targetUserId, audio.extension)
      await putObject(audioKey, audio.body, audio.contentType, audio.contentLength)
      audioMimeType = audio.contentType
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
      audioKey: audioKey ?? voicemail.audioKey,
      audioMimeType: audioMimeType ?? voicemail.audioMimeType,
      transcript: transcript ?? voicemail.transcript,
      summary: summary ?? voicemail.summary,
      ...(callSessionId && !voicemail.callSessionId ? { callSessionId } : {}),
      ...(callControlId && !voicemail.callControlId ? { callControlId } : {})
    }
  })

  // 6) Notify the recipient (fire-and-forget)
  void Promise.allSettled([
    publishAblyEvent(getChatVoicemailChannelName(voicemail.targetUserId), CHAT_EVENTS.VOICEMAIL_UPDATED, {
      voicemailId: voicemail.id
    }),
    publishUserInvalidation([voicemail.targetUserId], { voicemailId: voicemail.id })
  ]).catch(() => {})
}
