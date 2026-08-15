import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChatRoomPath } from '../routes'

test('buildChatRoomPath creates localized DM URLs', () => {
  assert.equal(buildChatRoomPath('en', { type: 'dm', username: 'alice' }), '/en/app/chat/alice')
  assert.equal(buildChatRoomPath('en', { type: 'dm', username: 'alice' }, 'message-1'), '/en/app/chat/alice/message/message-1')
})

test('buildChatRoomPath creates localized channel URLs', () => {
  assert.equal(buildChatRoomPath('en', { type: 'channel', orgId: 'org_123', channelId: 'channel_456' }), '/en/app/chat/org/org_123/channel/channel_456')
  assert.equal(
    buildChatRoomPath('en', { type: 'channel', orgId: 'org_123', channelId: 'channel_456' }, 'message-1'),
    '/en/app/chat/org/org_123/channel/channel_456/message/message-1',
  )
})

test('buildChatRoomPath creates localized SMS URLs', () => {
  assert.equal(buildChatRoomPath('en', { type: 'sms', conversationId: 'sms_123' }), '/en/app/chat/sms/sms_123')
})

test('buildChatRoomPath falls back to the chat home', () => {
  assert.equal(buildChatRoomPath('en', null), '/en/app/chat')
})
