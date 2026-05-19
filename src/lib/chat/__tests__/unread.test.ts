import test from 'node:test'
import assert from 'node:assert/strict'
import { getRoomKey } from '../unread'

test('getRoomKey creates stable channel and DM keys', () => {
  assert.equal(getRoomKey({ channelId: 'abc123' }), 'channel:abc123')
  assert.equal(getRoomKey({ dmConversationId: 'dm987' }), 'dm:dm987')
})

test('getRoomKey throws when no room identifier is provided', () => {
  assert.throws(() => getRoomKey({}), /Room identifier is required/)
})
