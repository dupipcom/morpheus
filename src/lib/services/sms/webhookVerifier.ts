/**
 * Telnyx webhook signature verification (webhook_api_version "2")
 * Ed25519 public-key signature over `"{telnyx-timestamp}|{raw body}"`.
 * Public key: Mission Control → Account Settings → Keys & Credentials →
 * Public Key — Telnyx provides the raw 32-byte Ed25519 key as base64
 * (44 chars, e.g. `eu2zvPjhY6odxV34Z/...=`), not PEM.
 */

import { createPublicKey, verify } from 'node:crypto'
import type { KeyObject } from 'node:crypto'

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
 * Parse the configured public key. Accepts:
 * - Telnyx's native format: base64-encoded raw 32-byte Ed25519 key
 * - PEM (handy for locally generated test keys)
 * Returns null for anything else.
 */
export function parseTelnyxPublicKey(keyString: string): KeyObject | null {
  const trimmed = keyString.trim()
  if (!trimmed) return null
  try {
    if (trimmed.startsWith('-----BEGIN')) {
      return createPublicKey(trimmed)
    }
    const raw = Buffer.from(trimmed, 'base64')
    if (raw.length === 32) {
      return createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
        format: 'jwk'
      })
    }
    return null
  } catch {
    return null
  }
}

export type WebhookVerificationResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'timestamp-malformed'
        | 'timestamp-stale'
        | 'signature-malformed'
        | 'public-key-invalid'
        | 'signature-mismatch'
    }

/**
 * Verify a Telnyx webhook. Never throws — malformed input, expired
 * timestamps, bad keys, and crypto errors all produce `{ ok: false }`
 * with a machine-readable reason for logging.
 */
export function verifyTelnyxWebhookSignature(input: {
  publicKey: string
  timestamp: string
  signatureBase64: string
  rawBody: string
  nowSeconds?: number
}): WebhookVerificationResult {
  const timestampSeconds = Number(input.timestamp)
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: 'timestamp-malformed' }
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (!isTimestampFresh(timestampSeconds, nowSeconds)) {
    return { ok: false, reason: 'timestamp-stale' }
  }

  const signature = Buffer.from(input.signatureBase64, 'base64')
  if (signature.length !== 64) {
    return { ok: false, reason: 'signature-malformed' }
  }

  const publicKey = parseTelnyxPublicKey(input.publicKey)
  if (!publicKey) {
    return { ok: false, reason: 'public-key-invalid' }
  }

  try {
    const valid = verify(
      null,
      Buffer.from(`${input.timestamp}|${input.rawBody}`),
      publicKey,
      signature
    )
    return valid ? { ok: true } : { ok: false, reason: 'signature-mismatch' }
  } catch {
    return { ok: false, reason: 'signature-mismatch' }
  }
}
