import test from 'node:test'
import assert from 'node:assert/strict'

import { claimsAllowVirtualNumber } from '../helpers.ts'

test('claimsAllowVirtualNumber accepts the planFeatures shape', () => {
  assert.equal(claimsAllowVirtualNumber({ planFeatures: ['virtual_number'] }), true)
  assert.equal(claimsAllowVirtualNumber({ planFeatures: ['ai_assistant', 'virtual_number'] }), true)
})

test('claimsAllowVirtualNumber accepts the nested plan.features shape', () => {
  assert.equal(claimsAllowVirtualNumber({ plan: { features: ['virtual_number'] } }), true)
})

test('claimsAllowVirtualNumber accepts the top-level features shape', () => {
  assert.equal(claimsAllowVirtualNumber({ features: ['virtual_number'] }), true)
})

test('claimsAllowVirtualNumber rejects claims without the feature', () => {
  assert.equal(claimsAllowVirtualNumber({ planFeatures: ['ai_assistant'] }), false)
  assert.equal(claimsAllowVirtualNumber({ plan: { features: ['ai_assistant'] } }), false)
  assert.equal(claimsAllowVirtualNumber({ features: ['ai_assistant'] }), false)
  assert.equal(claimsAllowVirtualNumber({}), false)
})

test('claimsAllowVirtualNumber never throws on malformed claims', () => {
  assert.equal(claimsAllowVirtualNumber(undefined), false)
  assert.equal(claimsAllowVirtualNumber(null), false)
  assert.equal(claimsAllowVirtualNumber('virtual_number'), false)
  assert.equal(claimsAllowVirtualNumber({ planFeatures: 'virtual_number' }), false)
  assert.equal(claimsAllowVirtualNumber({ planFeatures: [42] }), false)
})
