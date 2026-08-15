import test from 'node:test'
import assert from 'node:assert/strict'

import { filterAvailableNumbers, isValidE164 } from '../helpers.ts'

test('isValidE164 accepts valid E.164 numbers', () => {
  assert.equal(isValidE164('+15551234567'), true)
  assert.equal(isValidE164('+33612345678'), true)
})

test('isValidE164 rejects malformed numbers', () => {
  assert.equal(isValidE164('15551234567'), false) // missing +
  assert.equal(isValidE164('+123'), false) // too short
  assert.equal(isValidE164('+12345678901234567890'), false) // 16 digits
  assert.equal(isValidE164('+1 555 123 4567'), false) // spaces
  assert.equal(isValidE164('+1555-123-4567'), false) // dashes
  assert.equal(isValidE164('abc'), false)
  assert.equal(isValidE164(''), false)
})

function number(id: string, phoneNumber: string, status: string, messagingProfileId: string | null) {
  return { id, phoneNumber, friendlyName: null, status, messagingProfileId, features: [] }
}

test('filterAvailableNumbers keeps active, profile-attached, unassigned numbers', () => {
  const numbers = [
    number('a', '+15105550001', 'active', 'mp_1'), // eligible
    number('b', '+15105550002', 'active', null), // no messaging profile
    number('c', '+15105550003', 'purchased', 'mp_1'), // wrong status for v2 API
    number('d', '+15105550004', 'active', 'mp_2') // assigned to another user
  ]

  const result = filterAvailableNumbers(numbers, new Set(['+15105550004']))

  assert.deepEqual(result, [{ id: 'a', phoneNumber: '+15105550001', friendlyName: null }])
})

test('filterAvailableNumbers returns an empty list for empty input', () => {
  assert.deepEqual(filterAvailableNumbers([], new Set()), [])
})
