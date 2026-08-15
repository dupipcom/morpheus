import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'

import { isTimestampFresh, verifyTelnyxWebhookSignature } from '../webhookVerifier.ts'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')

const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

function signBody(timestamp: string, rawBody: string) {
  return sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString('base64')
}

const rawBody = JSON.stringify({
  data: { event_type: 'message.received', id: 'evt_1', payload: { id: 'msg_1' } }
})

test('accepts a valid signature with a fresh timestamp', () => {
  const timestamp = '1700000000'
  const result = verifyTelnyxWebhookSignature({
    publicKeyPem,
    timestamp,
    signatureBase64: signBody(timestamp, rawBody),
    rawBody,
    nowSeconds: 1700000060
  })

  assert.equal(result, true)
})

test('accepts a timestamp 60 seconds old', () => {
  const timestamp = '1700000000'
  const result = verifyTelnyxWebhookSignature({
    publicKeyPem,
    timestamp,
    signatureBase64: signBody(timestamp, rawBody),
    rawBody,
    nowSeconds: 1700000060
  })

  assert.equal(result, true)
})

test('rejects a tampered body', () => {
  const timestamp = '1700000000'
  const result = verifyTelnyxWebhookSignature({
    publicKeyPem,
    timestamp,
    signatureBase64: signBody(timestamp, rawBody),
    rawBody: rawBody.replace('msg_1', 'msg_2'),
    nowSeconds: 1700000060
  })

  assert.equal(result, false)
})

test('rejects a signature from a different keypair', () => {
  const other = generateKeyPairSync('ed25519')
  const otherSignature = sign(null, Buffer.from(`1700000000|${rawBody}`), other.privateKey).toString('base64')

  const result = verifyTelnyxWebhookSignature({
    publicKeyPem,
    timestamp: '1700000000',
    signatureBase64: otherSignature,
    rawBody,
    nowSeconds: 1700000060
  })

  assert.equal(result, false)
})

test('rejects a timestamp older than 5 minutes', () => {
  const timestamp = '1700000000'
  const result = verifyTelnyxWebhookSignature({
    publicKeyPem,
    timestamp,
    signatureBase64: signBody(timestamp, rawBody),
    rawBody,
    nowSeconds: 1700000400 // 400 seconds later
  })

  assert.equal(result, false)
})

test('rejects non-numeric, empty, or missing inputs', () => {
  assert.equal(
    verifyTelnyxWebhookSignature({
      publicKeyPem,
      timestamp: 'not-a-number',
      signatureBase64: signBody('not-a-number', rawBody),
      rawBody,
      nowSeconds: 1700000000
    }),
    false
  )
  assert.equal(
    verifyTelnyxWebhookSignature({
      publicKeyPem,
      timestamp: '1700000000',
      signatureBase64: '',
      rawBody,
      nowSeconds: 1700000060
    }),
    false
  )
  assert.equal(
    verifyTelnyxWebhookSignature({
      publicKeyPem: 'not-a-pem',
      timestamp: '1700000000',
      signatureBase64: signBody('1700000000', rawBody),
      rawBody,
      nowSeconds: 1700000060
    }),
    false
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
