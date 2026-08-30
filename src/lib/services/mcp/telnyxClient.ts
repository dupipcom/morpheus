/**
 * Telnyx v2 client extensions for the MCP server (phase 12): AI conversations
 * (true-caller verification, transcripts), recordings, inference chat
 * completions and speech-to-text. Same hand-rolled style as
 * virtual-number/telnyxClient.ts — no SDK dependency.
 *
 * Docs: developers.telnyx.com — /ai/conversations, /recordings,
 * /ai/chat/completions, /ai/audio/transcriptions.
 */

import 'server-only'

const TELNYX_API_BASE = 'https://api.telnyx.com/v2'

const getTelnyxApiKey = (): string => {
  const apiKey = process.env.TELNYX_API_KEY
  if (!apiKey) {
    throw new Error('TELNYX_API_KEY environment variable is required')
  }
  return apiKey
}

/** Raw authed fetch — callers decide how to treat the status. */
async function telnyxFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${TELNYX_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getTelnyxApiKey()}`,
      ...(init?.headers ?? {})
    }
  })
}

async function readError(path: string, response: Response): Promise<never> {
  const errorText = await response.text().catch(() => '')
  throw new Error(`Telnyx ${path} failed: ${response.status} ${errorText}`)
}

export interface TelnyxConversation {
  id: string
  createdAt?: string
  metadata?: Record<string, string>
}

/** GET /ai/conversations/{id} — null when the conversation does not exist. */
export async function getConversation(conversationId: string): Promise<TelnyxConversation | null> {
  const path = `/ai/conversations/${encodeURIComponent(conversationId)}`
  const response = await telnyxFetch(path)
  if (response.status === 404) return null
  if (!response.ok) return readError(path, response)

  const payload: { data?: unknown } = await response.json()
  if (!payload.data || typeof payload.data !== 'object') return null
  const data = payload.data as Record<string, unknown>
  return {
    id: typeof data.id === 'string' ? data.id : conversationId,
    createdAt: typeof data.created_at === 'string' ? data.created_at : undefined,
    metadata:
      data.metadata && typeof data.metadata === 'object'
        ? (data.metadata as Record<string, string>)
        : undefined
  }
}

export interface TelnyxConversationMessage {
  role: string
  content: string
}

/** GET /ai/conversations/{id}/messages — conversation transcript. */
export async function getConversationMessages(
  conversationId: string
): Promise<TelnyxConversationMessage[]> {
  const path = `/ai/conversations/${encodeURIComponent(conversationId)}/messages`
  const response = await telnyxFetch(path, { headers: { 'Content-Type': 'application/json' } })
  if (!response.ok) return readError(path, response)

  const payload: { data?: unknown } = await response.json()
  if (!Array.isArray(payload.data)) return []

  const messages: TelnyxConversationMessage[] = []
  for (const raw of payload.data) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const role = typeof record.role === 'string' ? record.role : ''
    const content = typeof record.content === 'string' ? record.content : ''
    if (role) messages.push({ role, content })
  }
  return messages
}

export interface TelnyxRecording {
  id: string
  downloadUrls: { mp3?: string; wav?: string }
  callSessionId?: string
  callControlId?: string
  from?: string
  to?: string
}

/** GET /recordings/{id} — null on 404. download_urls expire ~10 min after the call. */
export async function getRecording(recordingId: string): Promise<TelnyxRecording | null> {
  const path = `/recordings/${encodeURIComponent(recordingId)}`
  const response = await telnyxFetch(path)
  if (response.status === 404) return null
  if (!response.ok) return readError(path, response)

  const payload: { data?: unknown } = await response.json()
  if (!payload.data || typeof payload.data !== 'object') return null
  const data = payload.data as Record<string, unknown>
  const downloadUrls =
    data.download_urls && typeof data.download_urls === 'object'
      ? (data.download_urls as Record<string, unknown>)
      : {}
  return {
    id: typeof data.id === 'string' ? data.id : recordingId,
    downloadUrls: {
      mp3: typeof downloadUrls.mp3 === 'string' ? downloadUrls.mp3 : undefined,
      wav: typeof downloadUrls.wav === 'string' ? downloadUrls.wav : undefined
    },
    callSessionId: typeof data.call_session_id === 'string' ? data.call_session_id : undefined,
    callControlId: typeof data.call_control_id === 'string' ? data.call_control_id : undefined,
    from: typeof data.from === 'string' ? data.from : undefined,
    to: typeof data.to === 'string' ? data.to : undefined
  }
}

/**
 * OpenAI-compatible chat completion via Telnyx Inference — used for voicemail
 * summaries and phone-query answers (DeepSeek is the fallback, see
 * queryUserData / transcription services).
 */
export async function telnyxChatCompletion(input: {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  model?: string
  maxTokens?: number
  temperature?: number
}): Promise<string> {
  const model = input.model || process.env.TELNYX_INFERENCE_MODEL || 'moonshotai/Kimi-K2.6'
  const path = '/ai/chat/completions'
  const response = await telnyxFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: input.messages,
      max_tokens: input.maxTokens ?? 1024,
      temperature: input.temperature ?? 0.3
    })
  })
  if (!response.ok) return readError(path, response)

  const payload: { choices?: Array<{ message?: { content?: unknown } }> } = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Telnyx chat completion returned no content')
  }
  return content.trim()
}

/**
 * Speech-to-text via Telnyx (OpenAI-compatible endpoint, multipart form).
 * file_url mode only — we always hold a hosted/download URL, never raw bytes.
 * Docs: developers.telnyx.com — POST /v2/ai/audio/transcriptions.
 */
export async function telnyxTranscribe(input: {
  fileUrl: string
  model?: string
  language?: string
}): Promise<string> {
  const model = input.model || process.env.TELNYX_STT_MODEL || 'openai/whisper-large-v3-turbo'
  const form = new FormData()
  form.append('file_url', input.fileUrl)
  form.append('model', model)
  if (input.language) form.append('language', input.language)

  const path = '/ai/audio/transcriptions'
  const response = await telnyxFetch(path, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form
  })
  if (!response.ok) return readError(path, response)

  const payload: { text?: unknown } = await response.json()
  if (typeof payload.text !== 'string') {
    throw new Error('Telnyx transcription returned no text')
  }
  return payload.text.trim()
}
