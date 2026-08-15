import test from 'node:test'
import assert from 'node:assert/strict'

import { isMessagingCapable, mapTelnyxPhoneNumber } from '../helpers.ts'

test('mapTelnyxPhoneNumber maps a full Telnyx v2 record to the DTO', () => {
  const dto = mapTelnyxPhoneNumber({
    id: 'nr_123',
    phone_number: '+15105550123',
    nickname: 'Support',
    status: 'purchased',
    features: ['sms', 'voice']
  })

  assert.deepEqual(dto, {
    id: 'nr_123',
    phoneNumber: '+15105550123',
    friendlyName: 'Support',
    status: 'purchased',
    features: ['sms', 'voice']
  })
})

test('mapTelnyxPhoneNumber returns null when required fields are missing', () => {
  assert.equal(mapTelnyxPhoneNumber({ id: 'nr_123', status: 'purchased' }), null)
  assert.equal(mapTelnyxPhoneNumber({ phone_number: '+15105550123' }), null)
  assert.equal(mapTelnyxPhoneNumber(null), null)
  assert.equal(mapTelnyxPhoneNumber('not-an-object'), null)
})

test('mapTelnyxPhoneNumber defaults missing optional fields', () => {
  const dto = mapTelnyxPhoneNumber({ id: 'nr_1', phone_number: '+15105550123' })

  assert.equal(dto?.friendlyName, null)
  assert.equal(dto?.status, '')
  assert.deepEqual(dto?.features, [])
})

test('isMessagingCapable accepts sms or mms features', () => {
  assert.equal(isMessagingCapable({ id: 'a', phoneNumber: '+1', friendlyName: null, status: 'purchased', features: ['sms', 'mms', 'voice'] }), true)
  assert.equal(isMessagingCapable({ id: 'a', phoneNumber: '+1', friendlyName: null, status: 'purchased', features: ['mms'] }), true)
  assert.equal(isMessagingCapable({ id: 'a', phoneNumber: '+1', friendlyName: null, status: 'purchased', features: ['voice'] }), false)
  assert.equal(isMessagingCapable({ id: 'a', phoneNumber: '+1', friendlyName: null, status: 'purchased', features: [] }), false)
})
