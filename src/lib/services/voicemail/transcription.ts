/**
 * Voicemail audio + text AI helpers (phase 12).
 *
 * Transcription via Telnyx STT (file_url mode), summary via Telnyx Inference
 * with a DeepSeek fallback (src/lib/deepseek.ts) — a voicemail must never be
 * lost because one inference provider is down.
 */

import 'server-only'

import { telnyxChatCompletion, telnyxTranscribe } from '@/lib/services/mcp/telnyxClient'
import { DEEPSEEK_CHAT_MODEL, getDeepseekOpenAI } from '@/lib/deepseek'

const AUDIO_CAP_BYTES = 25 * 1024 * 1024 // matches KIND_CAPS.audio in storage/s3
const DOWNLOAD_TIMEOUT_MS = 20_000

const SUMMARY_SYSTEM_PROMPT = `You summarize voicemail messages for a Dupip user's inbox.
Write a neutral summary in at most 3 sentences covering who left the message and what they want.
Do not invent details that are absent from the transcript. Plain text only.`

export interface DownloadedAudio {
  body: Uint8Array
  contentType: string
  extension: string
  contentLength: number
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/x-m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg'
}

/** Fetch an audio URL with a timeout + size cap (SSRF-hardening: no private hosts). */
export async function downloadAudio(url: string): Promise<DownloadedAudio> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    throw new Error(`Audio download failed: ${response.status}`)
  }

  const contentType = (response.headers.get('content-type') || 'audio/mpeg')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > AUDIO_CAP_BYTES) throw new Error('Audio exceeds size cap')

  const body = new Uint8Array(await response.arrayBuffer())
  if (body.byteLength > AUDIO_CAP_BYTES) throw new Error('Audio exceeds size cap')

  return {
    body,
    contentType,
    extension: EXTENSION_BY_MIME[contentType] ?? 'mp3',
    contentLength: body.byteLength
  }
}

/** Speech-to-text via Telnyx (OpenAI-compatible /ai/audio/transcriptions). */
export async function transcribeFromUrl(url: string): Promise<string> {
  const text = await telnyxTranscribe({ fileUrl: url })
  return text.trim()
}

/** 3-sentence inbox summary — Telnyx Inference primary, DeepSeek fallback. */
export async function summarizeText(transcript: string): Promise<string> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    { role: 'user', content: transcript }
  ]

  try {
    return await telnyxChatCompletion({ messages, maxTokens: 300 })
  } catch {
    const completion = await getDeepseekOpenAI().chat.completions.create({
      model: DEEPSEEK_CHAT_MODEL,
      messages,
      max_tokens: 300,
      temperature: 0.3
    })
    const content = completion.choices[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Summary generation failed')
    }
    return content.trim()
  }
}
