import { NextRequest, NextResponse } from 'next/server'

import { handleTelnyxWebhook, verifyTelnyxWebhookSignature } from '@/lib/services/sms'

/**
 * Telnyx messaging webhook (webhook_api_version "2").
 * Intentionally unauthenticated by Clerk — requests are verified with the
 * Telnyx account Ed25519 public key over `"{telnyx-timestamp}|{raw body}"`
 * plus a 5-minute timestamp freshness window (replay protection).
 */
export async function POST(request: NextRequest) {
  // The signature covers the raw body — read it first, never request.json()
  const rawBody = await request.text()

  // Telnyx sends telnyx-signature-ed25519 / telnyx-timestamp; per their docs
  // these are compatible with the Standard Webhooks spec, so also accept the
  // webhook-signature / webhook-timestamp header names.
  const signature =
    request.headers.get('telnyx-signature-ed25519') ??
    request.headers.get('webhook-signature')
  const timestamp =
    request.headers.get('telnyx-timestamp') ?? request.headers.get('webhook-timestamp')
  const publicKey = process.env.TELNYX_WEBHOOK_PUBLIC_KEY

  if (!signature || !timestamp || !publicKey) {
    console.error('[telnyx-webhook] missing signature headers or TELNYX_WEBHOOK_PUBLIC_KEY')
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  const verification = verifyTelnyxWebhookSignature({
    publicKey,
    timestamp,
    signatureBase64: signature,
    rawBody
  })
  if (!verification.ok) {
    console.error('[telnyx-webhook] invalid signature', { reason: verification.reason })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    await handleTelnyxWebhook(payload)
  } catch (error) {
    // Unexpected errors surface as 500 so Telnyx retries — dedup on
    // telnyxMessageId makes retries safe
    console.error('[telnyx-webhook] handler error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
