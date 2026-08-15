import test from 'node:test'
import assert from 'node:assert/strict'

import { isMessagingCapable, mapTelnyxPhoneNumber } from '../helpers.ts'

test('mapTelnyxPhoneNumber maps a full Telnyx v2 record to the DTO', () => {
  const dto = mapTelnyxPhoneNumber({
    id: 'nr_123',
    phone_number: '+15105550123',
    nickname: 'Support',
    status: 'active',
    messaging_profile_id: 'mp_456',
    features: ['sms', 'voice']
  })

  assert.deepEqual(dto, {
    id: 'nr_123',
    phoneNumber: '+15105550123',
    friendlyName: 'Support',
    status: 'active',
    messagingProfileId: 'mp_456',
    features: ['sms', 'voice']
  })
})

test('mapTelnyxPhoneNumber returns null when required fields are missing', () => {
  assert.equal(mapTelnyxPhoneNumber({ id: 'nr_123', status: 'active' }), null)
  assert.equal(mapTelnyxPhoneNumber({ phone_number: '+15105550123' }), null)
  assert.equal(mapTelnyxPhoneNumber(null), null)
  assert.equal(mapTelnyxPhoneNumber('not-an-object'), null)
})

test('mapTelnyxPhoneNumber defaults missing optional fields', () => {
  const dto = mapTelnyxPhoneNumber({ id: 'nr_1', phone_number: '+15105550123' })

  assert.equal(dto?.friendlyName, null)
  assert.equal(dto?.status, '')
  assert.equal(dto?.messagingProfileId, null)
  assert.deepEqual(dto?.features, [])
})

test('isMessagingCapable requires status active AND a messaging profile', () => {
  const base = { id: 'a', phoneNumber: '+1', friendlyName: null, features: [] }

  assert.equal(isMessagingCapable({ ...base, status: 'active', messagingProfileId: 'mp_1' }), true)
  assert.equal(isMessagingCapable({ ...base, status: 'active', messagingProfileId: null }), false)
  assert.equal(isMessagingCapable({ ...base, status: 'purchased', messagingProfileId: 'mp_1' }), false)
  assert.equal(isMessagingCapable({ ...base, status: 'deleted', messagingProfileId: 'mp_1' }), false)
})
