/**
 * Telnyx webhook signature verification (webhook_api_version "2")
 * Ed25519 public-key signature over `"{telnyx-timestamp}|{raw body}"`.
 * Public key: Mission Control → Keys & Credentials → Public Key.
 */

import { createPublicKey, verify } from 'node:crypto'

/**
 * Replay protection: reject timestamps more than `maxAgeSeconds` off from now
 * (both directions — allows modest clock skew).
 */
export function isTimestampFresh(
  timestampSeconds: number,
  nowSeconds: number,
  maxAgeSeconds = 300
): boolean {
  if (!Number.isFinite(timestampSeconds) || !Number.isFinite(nowSeconds)) return false
  return Math.abs(nowSeconds - timestampSeconds) <= maxAgeSeconds
}

/**
 * Verify a Telnyx webhook. Always returns a boolean — malformed input,
 * expired timestamps, bad keys, and crypto errors all evaluate to false.
 */
export function verifyTelnyxWebhookSignature(input: {
  publicKeyPem: string
  timestamp: string
  signatureBase64: string
  rawBody: string
  nowSeconds?: number
}): boolean {
  try {
    const timestampSeconds = Number(input.timestamp)
    if (!Number.isFinite(timestampSeconds)) return false

    const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000)
    if (!isTimestampFresh(timestampSeconds, nowSeconds)) return false

    const signature = Buffer.from(input.signatureBase64, 'base64')
    if (signature.length === 0) return false

    const publicKey = createPublicKey(input.publicKeyPem)
    return verify(null, Buffer.from(`${input.timestamp}|${input.rawBody}`), publicKey, signature)
  } catch {
    return false
  }
}
