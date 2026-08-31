/**
 * The five Dupip MCP tools (phase 12).
 *
 *  - web_auth: MCP session authentication via Clerk redirects (OIDC).
 *  - phone_auth_by_callerid: identify the caller from the ACTUAL call
 *    (conversation metadata), never from the number the LLM claims.
 *  - phone_query_user_data: NL question about a target user, answered at the
 *    caller's access level (owner / delegation scopes / public fallback).
 *  - phone_record_message: store a voicemail (text and/or audio) so it shows
 *    up in the recipient's /app/chat.
 *  - query_user_public_profile: AI-generated professional summary of the
 *    target's PUBLIC profile + recent public notes (30-day snapshot) — for
 *    callers with no delegation.
 *
 * Every phone tool re-derives the true caller from extra._meta (Telnyx injects
 * telnyx_conversation_id there — platform-set, prompt-injection resistant).
 */

import 'server-only'

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { getTrueCaller } from './callerIdentity'
import {
  resolveCallerByPhone,
  resolvePhoneDelegationForTarget
} from './callerLookup'
import { resolveTargetUser } from './targetResolution'
import {
  PHONE_TIMEFRAMES,
  queryUserDataForPhone,
  resolvePhoneAccess
} from './queryUserData'
import type { PhoneTimeframe } from './queryUserData'
import { buildAuthorizationUrl, isAllowedRedirectUri } from './oauth'
import { createVoicemail } from '@/lib/services/voicemail'
import { getPublicProfileSummary } from '@/lib/services/public-profile'

const NO_CONVERSATION_ERROR =
  'Unable to verify the caller for this conversation: telnyx_conversation_id is missing from the request metadata. This tool only works inside a Telnyx AI Assistant call.'

function okResult(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured
  }
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/

async function handleWebAuth(args: {
  redirect_uri: string
  code_challenge: string
  resource?: string
}): Promise<CallToolResult> {
  if (!isAllowedRedirectUri(args.redirect_uri)) {
    return errorResult(
      'redirect_uri is required and must be a loopback URI (RFC 8252) or a registered Dupip origin.'
    )
  }
  if (!PKCE_CHALLENGE_RE.test(args.code_challenge)) {
    return errorResult(
      'code_challenge is required: a 43-128 char base64url PKCE S256 challenge. Keep the verifier client-side.'
    )
  }

  const { authorizationUrl } = buildAuthorizationUrl({
    redirectUri: args.redirect_uri,
    codeChallenge: args.code_challenge,
    resource: args.resource
  })

  return okResult({
    authorization_url: authorizationUrl,
    instructions:
      'Open this URL in a browser to sign in with Clerk (Dupip). After the redirect, exchange the authorization code plus your PKCE verifier at the token endpoint advertised in /.well-known/oauth-authorization-server, then send the access token as a Bearer header on every MCP request.',
    expires_in_seconds: 600
  })
}

async function handlePhoneAuthByCallerId(
  args: { phone_number?: string; conversation_id?: string },
  extra: { _meta?: Record<string, unknown> }
): Promise<CallToolResult> {
  // The number argument is a display hint only — identity comes from the call.
  const trueCaller = await getTrueCaller(extra._meta)
  if (!trueCaller) return errorResult(NO_CONVERSATION_ERROR)

  const caller = await resolveCallerByPhone({
    phone: trueCaller.phone,
    verified: trueCaller.verified
  })

  const identity = { ...caller.identity }

  // Access level is relative to the user who owns the dialed number.
  const target = await resolveTargetUser(null, trueCaller.agentTarget ?? null)
  if (target) {
    if (caller.callerUserId) {
      const access = await resolvePhoneAccess(
        caller.callerUserId,
        target.userId,
        caller.phoneDelegations
      )
      identity.accessLevel = access.accessLevel
      identity.relationship =
        access.accessLevel === 'OWNER'
          ? 'self'
          : access.accessLevel === 'DELEGATE'
            ? 'delegate'
            : 'none'
    } else {
      // Phone delegation (/app/feel third-party tab): recognized by number.
      const phoneGrant = resolvePhoneDelegationForTarget(
        caller.phoneDelegations,
        target.userId
      )
      if (phoneGrant) {
        identity.known = true
        identity.accessLevel = 'DELEGATE'
        identity.relationship = 'delegate'
        if (phoneGrant.label) identity.name = phoneGrant.label
      }
    }
  }

  return okResult({ ...identity })
}

async function handlePhoneQueryUserData(
  args: { target_user?: string; query?: string; timeframe?: string; locale?: string },
  extra: { _meta?: Record<string, unknown> }
): Promise<CallToolResult> {
  const query = (args.query ?? '').trim()
  if (!query) return errorResult('query is required.')

  const timeframeRaw = (args.timeframe ?? 'last_year').trim()
  if (!(PHONE_TIMEFRAMES as readonly string[]).includes(timeframeRaw)) {
    return errorResult(`timeframe must be one of: ${PHONE_TIMEFRAMES.join(', ')}.`)
  }

  const trueCaller = await getTrueCaller(extra._meta)
  if (!trueCaller) return errorResult(NO_CONVERSATION_ERROR)

  const target = await resolveTargetUser(args.target_user, trueCaller.agentTarget ?? null)
  if (!target) {
    return errorResult(
      'Could not resolve the target user. Ask the caller to disambiguate (full name, @username, email, or phone number).'
    )
  }

  const caller = await resolveCallerByPhone({
    phone: trueCaller.phone,
    verified: trueCaller.verified
  })

  const result = await queryUserDataForPhone({
    callerUserId: caller.callerUserId,
    targetUserId: target.userId,
    query,
    timeframe: timeframeRaw as PhoneTimeframe,
    locale: args.locale,
    phoneDelegations: caller.phoneDelegations
  })

  return okResult({
    answer: result.answer,
    access_level: result.accessLevel,
    target_user: target.name ?? target.username ?? target.userId,
    caller_verified: trueCaller.verified
  })
}

async function handlePhoneRecordMessage(
  args: {
    target_user?: string
    text?: string
    voice_file_url?: string
    duration_secs?: number
    conversation_id?: string
    call_control_id?: string
    call_session_id?: string
  },
  extra: { _meta?: Record<string, unknown> }
): Promise<CallToolResult> {
  const trueCaller = await getTrueCaller(extra._meta)
  if (!trueCaller) return errorResult(NO_CONVERSATION_ERROR)

  const target = await resolveTargetUser(args.target_user, trueCaller.agentTarget ?? null)
  if (!target) {
    return errorResult(
      'Could not resolve the target user. Ask the caller to disambiguate (full name, @username, email, or phone number).'
    )
  }

  const text = typeof args.text === 'string' ? args.text.trim() : ''
  const voiceFileUrl =
    typeof args.voice_file_url === 'string' ? args.voice_file_url.trim() : ''
  if (!text && !voiceFileUrl) {
    return errorResult('Provide at least text or voice_file_url.')
  }

  const caller = await resolveCallerByPhone({
    phone: trueCaller.phone,
    verified: trueCaller.verified
  })

  // A phone-delegation label ("Mom") wins over an unknown caller's display.
  const callerName =
    caller.identity.name ??
    resolvePhoneDelegationForTarget(caller.phoneDelegations, target.userId)?.label ??
    undefined

  const result = await createVoicemail({
    targetUserId: target.userId,
    callerUserId: caller.callerUserId ?? undefined,
    callerPhone: trueCaller.phone,
    callerName,
    callerVerified: trueCaller.verified,
    text: text || undefined,
    audioUrl: voiceFileUrl || undefined,
    durationSec: args.duration_secs,
    telnyxConversationId: trueCaller.conversationId,
    // Correlation ids enable the recording sweep to attach the call audio
    // once Telnyx finalizes the recording (the assistant connection has no
    // event webhook, so call.recording.saved never reaches morpheus).
    callControlId: args.call_control_id ?? trueCaller.callControlId ?? undefined,
    callSessionId: args.call_session_id ?? trueCaller.callSessionId ?? undefined
  })

  return okResult({
    voicemail_id: result.voicemailId,
    status: result.status,
    transcript: result.transcript ?? null,
    summary: result.summary ?? null
  })
}

async function handleQueryUserPublicProfile(
  args: { target_user: string; question?: string },
  extra: { _meta?: Record<string, unknown> }
): Promise<CallToolResult> {
  // Public data only — the conversation binding is best-effort. agentTarget
  // (the dialed number's owner) fixes the target when available, since the
  // assistant passes a display name that may not resolve on its own.
  const trueCaller = await getTrueCaller(extra._meta)
  const target = await resolveTargetUser(args.target_user, trueCaller?.agentTarget ?? null)
  if (!target) {
    return errorResult(
      'Could not resolve the target user. Ask the caller to disambiguate (full name, @username, email, or phone number).'
    )
  }

  const result = await getPublicProfileSummary(target.userId)

  return okResult({
    target_user: result.userName ?? result.name ?? target.username ?? target.userId,
    professional_summary: result.summary,
    latest_public_notes: result.latestPublicNotes,
    summary_generated_at: result.generatedAt,
    source_links: result.links
  })
}

export function registerDupipTools(server: McpServer): void {
  server.registerTool(
    'web_auth',
    {
      title: 'Authenticate the MCP session via Clerk (OIDC)',
      description:
        'Starts the standard browser redirect authentication flow (authorization code + PKCE) against the Dupip Clerk identity provider. Returns an authorization URL; after the flow completes, send the access token as a Bearer header on every MCP request. Telnyx Edge Functions may use this tool as an auth-initiator for pairing flows.',
      inputSchema: {
        redirect_uri: z.string().min(1).describe('OAuth redirect_uri registered for the MCP client (loopback URIs allowed)'),
        code_challenge: z.string().min(43).max(128).describe('PKCE S256 code challenge (base64url); keep the verifier client-side'),
        resource: z.string().optional().describe('RFC 8707 resource indicator; defaults to the MCP server origin')
      }
    },
    handleWebAuth
  )

  server.registerTool(
    'phone_auth_by_callerid',
    {
      title: 'Authenticate a phone caller by caller ID',
      description:
        'Identifies the person on the line by the real caller ID of the current Telnyx conversation (STIR/SHAKEN flag included), searching Dupip virtual-number owners and Clerk-verified phone numbers. Returns identity plus the access level relative to the owner of the dialed number. The phone_number argument is only a display hint — it is never trusted.',
      inputSchema: {
        phone_number: z.string().optional().describe('Caller E.164 (e.g. +15551234567) — display hint only'),
        conversation_id: z.string().optional().describe('Telnyx conversation id (also auto-derived from request metadata)')
      }
    },
    handlePhoneAuthByCallerId
  )

  server.registerTool(
    'phone_query_user_data',
    {
      title: 'Query a Dupip user\'s life data',
      description:
        'Answers a natural-language question about a Dupip user (who is X, how was their week/month/year, mood, tasks, notes) from the target user\'s data at the caller\'s access level: owner or delegated scopes get real data; everyone else defaults to public notes, public profile fields and PUBLIC days only. AI-enabled notes are only considered for the owner or an explicit AI_ENABLED/PRIVATE delegation.',
      inputSchema: {
        target_user: z.string().min(1).describe('The Dupip user to ask about: @username, email, phone, or full name. Prefer the owner of the dialed number.'),
        query: z.string().min(1).describe('Natural-language question, e.g. "how was her week?"'),
        timeframe: z.enum(PHONE_TIMEFRAMES).optional().describe('Period the question refers to; inferred from the question. Default last_year.'),
        locale: z.string().optional().describe('Answer language (default en)')
      }
    },
    handlePhoneQueryUserData
  )

  server.registerTool(
    'phone_record_message',
    {
      title: 'Record a voicemail for a Dupip user',
      description:
        'Stores a voicemail from the current call for the target user: audio is saved to S3 (iDrive e2) and a transcript + summary are generated, then it appears in the recipient\'s /app/chat voicemail inbox (playable + readable). Provide the caller\'s message as text and/or an audio URL.',
      inputSchema: {
        target_user: z.string().min(1).describe('Recipient Dupip user (@username, email, phone, or name; prefer the dialed number\'s owner)'),
        text: z.string().optional().describe('Message text (the platform\'s transcription of the caller\'s speech)'),
        voice_file_url: z.string().optional().describe('Optional hosted audio URL (e.g. a Telnyx recording download URL) to store'),
        duration_secs: z.number().int().nonnegative().optional().describe('Audio duration in seconds, when known'),
        conversation_id: z.string().optional(),
        call_control_id: z.string().optional(),
        call_session_id: z.string().optional()
      }
    },
    handlePhoneRecordMessage
  )

  server.registerTool(
    'query_user_public_profile',
    {
      title: 'Query a Dupip user\'s public profile summary',
      description:
        'Returns the AI-generated professional summary of a Dupip user built from their PUBLIC profile (bio, links) and recent public notes, cached for 30 days. Public data only — no caller access checks apply. Use this for callers asking who the user is, their bio, or what they have been up to publicly.',
      inputSchema: {
        target_user: z.string().min(1).describe('The Dupip user to ask about: @username, email, phone, or full name. Prefer the owner of the dialed number.'),
        question: z.string().optional().describe('The caller\'s question, for context')
      }
    },
    handleQueryUserPublicProfile
  )
}
