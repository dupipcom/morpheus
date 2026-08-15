import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mapInboundSmsPayload,
  mapOutboundSmsStatus,
  shouldApplyOutboundStatus
} from '../helpers.ts'

test('mapInboundSmsPayload maps a full message.received payload', () => {
  const input = mapInboundSmsPayload({
    id: 'msg_123',
    direction: 'inbound',
    from: { phone_number: '+15105551111', carrier: 'T-Mobile', line_type: 'long_code' },
    to: [{ phone_number: '+15105550001', status: 'webhook_delivered' }, { phone_number: '+15105550002', status: 'ignored' }],
    text: 'Hello there',
    type: 'SMS'
  })

  assert.deepEqual(input, {
    telnyxMessageId: 'msg_123',
    fromPhoneNumber: '+15105551111',
    toPhoneNumber: '+15105550001',
    text: 'Hello there',
    type: 'SMS'
  })
})

test('mapInboundSmsPayload stores empty text for media-only MMS', () => {
  const input = mapInboundSmsPayload({
    id: 'msg_456',
    from: { phone_number: '+15105551111' },
    to: [{ phone_number: '+15105550001', status: 'webhook_delivered' }],
    text: null,
    type: 'MMS'
  })

  assert.equal(input?.text, '')
  assert.equal(input?.type, 'MMS')
})

test('mapInboundSmsPayload returns null for missing fields', () => {
  assert.equal(mapInboundSmsPayload(null), null)
  assert.equal(mapInboundSmsPayload({ from: { phone_number: '+1' }, to: [{ phone_number: '+2' }] }), null) // no id
  assert.equal(mapInboundSmsPayload({ id: 'm1', to: [{ phone_number: '+2' }] }), null) // no from
  assert.equal(mapInboundSmsPayload({ id: 'm1', from: { phone_number: '+1' }, to: [] }), null) // empty to
  assert.equal(mapInboundSmsPayload({ id: 'm1', from: { phone_number: '+1' }, to: 'not-an-array' }), null)
})

test('mapOutboundSmsStatus collapses Telnyx statuses', () => {
  assert.equal(mapOutboundSmsStatus('queued'), 'SENT')
  assert.equal(mapOutboundSmsStatus('sending'), 'SENT')
  assert.equal(mapOutboundSmsStatus('sent'), 'SENT')
  assert.equal(mapOutboundSmsStatus('delivery_unconfirmed'), 'SENT')
  assert.equal(mapOutboundSmsStatus('delivered'), 'DELIVERED')
  assert.equal(mapOutboundSmsStatus('sending_failed'), 'FAILED')
  assert.equal(mapOutboundSmsStatus('delivery_failed'), 'FAILED')
  assert.equal(mapOutboundSmsStatus('expired'), 'FAILED')
  assert.equal(mapOutboundSmsStatus('bogus'), null)
  assert.equal(mapOutboundSmsStatus(undefined), null)
  assert.equal(mapOutboundSmsStatus(42), null)
})

test('shouldApplyOutboundStatus never regresses terminal states', () => {
  assert.equal(shouldApplyOutboundStatus(null, 'SENT'), true)
  assert.equal(shouldApplyOutboundStatus('SENT', 'DELIVERED'), true)
  assert.equal(shouldApplyOutboundStatus('SENT', 'FAILED'), true)
  assert.equal(shouldApplyOutboundStatus('SENT', 'SENT'), false)
  assert.equal(shouldApplyOutboundStatus('DELIVERED', 'SENT'), false)
  assert.equal(shouldApplyOutboundStatus('DELIVERED', 'FAILED'), false)
  assert.equal(shouldApplyOutboundStatus('FAILED', 'SENT'), false)
  assert.equal(shouldApplyOutboundStatus('FAILED', 'DELIVERED'), false)
})
