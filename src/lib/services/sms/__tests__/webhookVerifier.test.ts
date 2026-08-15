import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'

import { isTimestampFresh, verifyTelnyxWebhookSignature } from '../webhookVerifier.ts'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')

const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
// Telnyx provides the raw 32-byte public key as base64 — the production format
const publicKeyB64 = Buffer.from(
  publicKey.export({ format: 'jwk' }).x as string,
  'base64url'
).toString('base64')

function signBody(timestamp: string, rawBody: string) {
  return sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString('base64')
}

const rawBody = JSON.stringify({
  data: { event_type: 'message.received', id: 'evt_1', payload: { id: 'msg_1' } }
})

test('accepts a valid signature with a fresh timestamp (base64 raw key)', () => {
  const timestamp = '1700000000'
  const result = verifyTelnyxWebhookSignature({
    publicKey: publicKeyB64,
    timestamp,
    signatureBase64: signBody(timestamp, rawBody),
    rawBody,
    nowSeconds: 1700000060
  })

  assert.deepEqual(result, { ok: true })
})

test('accepts a valid signature with a fresh timestamp (PEM key)', () => {
  const timestamp = '1700000000'
  const result = verifyTelnyxWebhookSignature({
    publicKey: publicKeyPem,
    timestamp,
    signatureBase64: signBody(timestamp, rawBody),
    rawBody,
    nowSeconds: 1700000060
  })

  assert.deepEqual(result, { ok: true })
})

test('accepts a timestamp 60 seconds old', () => {
  const timestamp = '1700000000'
  const result = verifyTelnyxWebhookSignature({
    publicKey: publicKeyB64,
    timestamp,
    signatureBase64: signBody(timestamp, rawBody),
    rawBody,
    nowSeconds: 1700000060
  })

  assert.deepEqual(result, { ok: true })
})

test('rejects a tampered body', () => {
  const timestamp = '1700000000'
  const result = verifyTelnyxWebhookSignature({
    publicKey: publicKeyB64,
    timestamp,
    signatureBase64: signBody(timestamp, rawBody),
    rawBody: rawBody.replace('msg_1', 'msg_2'),
    nowSeconds: 1700000060
  })

  assert.deepEqual(result, { ok: false, reason: 'signature-mismatch' })
})

test('rejects a signature from a different keypair', () => {
  const other = generateKeyPairSync('ed25519')
  const otherSignature = sign(null, Buffer.from(`1700000000|${rawBody}`), other.privateKey).toString('base64')

  const result = verifyTelnyxWebhookSignature({
    publicKey: publicKeyB64,
    timestamp: '1700000000',
    signatureBase64: otherSignature,
    rawBody,
    nowSeconds: 1700000060
  })

  assert.deepEqual(result, { ok: false, reason: 'signature-mismatch' })
})

test('rejects a timestamp older than 5 minutes', () => {
  const timestamp = '1700000000'
  const result = verifyTelnyxWebhookSignature({
    publicKey: publicKeyB64,
    timestamp,
    signatureBase64: signBody(timestamp, rawBody),
    rawBody,
    nowSeconds: 1700000400 // 400 seconds later
  })

  assert.deepEqual(result, { ok: false, reason: 'timestamp-stale' })
})

test('rejects non-numeric timestamps', () => {
  const result = verifyTelnyxWebhookSignature({
    publicKey: publicKeyB64,
    timestamp: 'not-a-number',
    signatureBase64: signBody('not-a-number', rawBody),
    rawBody,
    nowSeconds: 1700000000
  })

  assert.deepEqual(result, { ok: false, reason: 'timestamp-malformed' })
})

test('rejects empty or malformed signatures', () => {
  assert.deepEqual(
    verifyTelnyxWebhookSignature({
      publicKey: publicKeyB64,
      timestamp: '1700000000',
      signatureBase64: '',
      rawBody,
      nowSeconds: 1700000060
    }),
    { ok: false, reason: 'signature-malformed' }
  )
  assert.deepEqual(
    verifyTelnyxWebhookSignature({
      publicKey: publicKeyB64,
      timestamp: '1700000000',
      signatureBase64: Buffer.from('too short').toString('base64'),
      rawBody,
      nowSeconds: 1700000060
    }),
    { ok: false, reason: 'signature-malformed' }
  )
})

test('rejects invalid public keys', () => {
  assert.deepEqual(
    verifyTelnyxWebhookSignature({
      publicKey: 'not-a-key',
      timestamp: '1700000000',
      signatureBase64: signBody('1700000000', rawBody),
      rawBody,
      nowSeconds: 1700000060
    }),
    { ok: false, reason: 'public-key-invalid' }
  )
  // base64 that decodes to the wrong length
  assert.deepEqual(
    verifyTelnyxWebhookSignature({
      publicKey: Buffer.alloc(33).toString('base64'),
      timestamp: '1700000000',
      signatureBase64: signBody('1700000000', rawBody),
      rawBody,
      nowSeconds: 1700000060
    }),
    { ok: false, reason: 'public-key-invalid' }
  )
  assert.deepEqual(
    verifyTelnyxWebhookSignature({
      publicKey: '',
      timestamp: '1700000000',
      signatureBase64: signBody('1700000000', rawBody),
      rawBody,
      nowSeconds: 1700000060
    }),
    { ok: false, reason: 'public-key-invalid' }
  )
})

test('isTimestampFresh allows modest skew in both directions', () => {
  assert.equal(isTimestampFresh(1700000000, 1700000060), true)
  assert.equal(isTimestampFresh(1700000060, 1700000000), true)
  assert.equal(isTimestampFresh(1700000000, 1700000300), true)
  assert.equal(isTimestampFresh(1700000000, 1700000301), false)
  assert.equal(isTimestampFresh(Number.NaN, 1700000000), false)
  assert.equal(isTimestampFresh(1700000000, Number.NaN), false)
})
