import test from 'node:test'
import assert from 'node:assert/strict'

import { claimsAllowVirtualNumber, getPlanSlugFromClaims, getVirtualNumberQuota } from '../helpers.ts'

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

test('getPlanSlugFromClaims reads the nested plan.slug shape', () => {
  assert.equal(getPlanSlugFromClaims({ plan: { slug: 'dupip_pro' } }), 'dupip_pro')
  assert.equal(getPlanSlugFromClaims({ plan: { slug: 'dupip_max', features: ['virtual_number'] } }), 'dupip_max')
})

test('getPlanSlugFromClaims falls back to a top-level planSlug', () => {
  assert.equal(getPlanSlugFromClaims({ planSlug: 'dupip_ultra' }), 'dupip_ultra')
  assert.equal(getPlanSlugFromClaims({ plan: {}, planSlug: 'dupip_pro' }), 'dupip_pro')
})

test('getPlanSlugFromClaims returns null when no slug is present', () => {
  assert.equal(getPlanSlugFromClaims({ plan: {} }), null)
  assert.equal(getPlanSlugFromClaims({ plan: { name: 'Dupip Pro' } }), null)
  assert.equal(getPlanSlugFromClaims({}), null)
})

test('getPlanSlugFromClaims never throws on malformed claims', () => {
  assert.equal(getPlanSlugFromClaims(undefined), null)
  assert.equal(getPlanSlugFromClaims(null), null)
  assert.equal(getPlanSlugFromClaims('dupip_pro'), null)
  assert.equal(getPlanSlugFromClaims({ plan: 'dupip_pro' }), null)
  assert.equal(getPlanSlugFromClaims({ plan: { slug: 42 } }), null)
})

test('getVirtualNumberQuota maps known plan slugs to their quotas', () => {
  assert.equal(getVirtualNumberQuota({ plan: { slug: 'dupip_pro' } }), 1)
  assert.equal(getVirtualNumberQuota({ plan: { slug: 'dupip_ultra' } }), 3)
  assert.equal(getVirtualNumberQuota({ plan: { slug: 'dupip_max' } }), 5)
})

test('getVirtualNumberQuota fails closed for unknown slugs or missing plans', () => {
  assert.equal(getVirtualNumberQuota({ plan: { slug: 'dupip_free' } }), 0)
  assert.equal(getVirtualNumberQuota({ plan: {} }), 0)
  assert.equal(getVirtualNumberQuota({}), 0)
  assert.equal(getVirtualNumberQuota(undefined), 0)
})
