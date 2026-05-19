import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChatInviteUrl, isChatInviteActive, isMongoObjectId } from '../invites'

test('isChatInviteActive rejects revoked, expired, and exhausted invites', () => {
  assert.equal(isChatInviteActive({ status: 'REVOKED', usedCount: 0 }), false)
  assert.equal(isChatInviteActive({ status: 'ACTIVE', usedCount: 1, maxUses: 1 }), false)
  assert.equal(isChatInviteActive({ status: 'ACTIVE', usedCount: 0, expiresAt: new Date('2026-01-01T00:00:00.000Z') }, new Date('2026-01-02T00:00:00.000Z')), false)
  assert.equal(isChatInviteActive({ status: 'ACTIVE', usedCount: 0 }), true)
})

test('buildChatInviteUrl creates localized invite page URLs', () => {
  assert.equal(buildChatInviteUrl('https://dupip.com/', 'en', 'invite-token'), 'https://dupip.com/en/chat/invites/invite-token')
})

test('isMongoObjectId only accepts 24-character hex ids', () => {
  assert.equal(isMongoObjectId('507f1f77bcf86cd799439011'), true)
  assert.equal(isMongoObjectId('_kJC5WFFHLfjX5pVGTtjTU6o_MxtjFcR'), false)
  assert.equal(isMongoObjectId('invite-token'), false)
})
