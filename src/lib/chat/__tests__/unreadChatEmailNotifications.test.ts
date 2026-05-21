import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUnreadChatEmailHtml,
  buildUnreadChatEmailSubject,
  buildUnreadChatEmailText,
  createUnreadChatBatchKey,
  filterAlreadyNotifiedMessages,
  filterUnreadChatMessagesForRenotification,
  isAuthorizedCronRequest,
} from '../unreadChatEmailNotifications'

const sampleMessages = [
  {
    id: 'message-2',
    senderDisplayName: '@alice',
    senderUsername: 'alice',
    senderAvatarUrl: 'https://example.com/alice.png',
    sentAt: new Date('2026-05-21T08:30:00.000Z'),
    roomLabel: '#general',
  },
  {
    id: 'message-1',
    senderDisplayName: 'Bob Example',
    senderUsername: null,
    senderAvatarUrl: null,
    sentAt: new Date('2026-05-21T08:45:00.000Z'),
    roomLabel: 'a direct message',
  },
]

test('createUnreadChatBatchKey is stable regardless of message order', () => {
  assert.equal(
    createUnreadChatBatchKey(['message-1', 'message-2']),
    createUnreadChatBatchKey(['message-2', 'message-1']),
  )
})

test('filterAlreadyNotifiedMessages removes already tracked message ids', () => {
  assert.deepEqual(
    filterAlreadyNotifiedMessages(sampleMessages, ['message-1']).map((message) => message.id),
    ['message-2'],
  )
})

test('filterUnreadChatMessagesForRenotification allows sent messages again after 3 days', () => {
  assert.deepEqual(
    filterUnreadChatMessagesForRenotification(
      sampleMessages,
      [
        {
          chatMessageId: 'message-1',
          createdAt: new Date('2026-05-18T08:00:00.000Z'),
          sentAt: new Date('2026-05-18T08:00:00.000Z'),
        },
        {
          chatMessageId: 'message-2',
          createdAt: new Date('2026-05-20T08:00:00.000Z'),
          sentAt: new Date('2026-05-20T08:00:00.000Z'),
        },
      ],
      new Date('2026-05-21T09:00:00.000Z'),
    ).map((message) => message.id),
    ['message-1'],
  )
})

test('filterUnreadChatMessagesForRenotification keeps fresh pending reservations excluded', () => {
  assert.deepEqual(
    filterUnreadChatMessagesForRenotification(
      sampleMessages,
      [{
        chatMessageId: 'message-1',
        createdAt: new Date('2026-05-21T08:00:00.000Z'),
        sentAt: null,
      }],
      new Date('2026-05-21T09:00:00.000Z'),
    ).map((message) => message.id),
    ['message-2'],
  )
})

test('filterUnreadChatMessagesForRenotification allows stale pending reservations again after 2 hours', () => {
  assert.deepEqual(
    filterUnreadChatMessagesForRenotification(
      sampleMessages,
      [{
        chatMessageId: 'message-1',
        createdAt: new Date('2026-05-21T06:30:00.000Z'),
        sentAt: null,
      }],
      new Date('2026-05-21T09:00:00.000Z'),
    ).map((message) => message.id),
    ['message-2', 'message-1'],
  )
})

test('unread chat email template uses Dupip palette and omits message contents', () => {
  const html = buildUnreadChatEmailHtml(sampleMessages, 'https://dupip.com/en/app/chat')

  assert.match(html, /#f1cfff/i)
  assert.match(html, /#ffe5fc/i)
  assert.match(html, /#ff6a9e/i)
  assert.match(html, /#563769/i)
  assert.match(html, /#3e365c/i)
  assert.match(html, /#2f2f8d/i)
  assert.match(html, /#ffffff/i)
  assert.match(html, /#c4abef/i)
  assert.match(html, /@alice/)
  assert.match(html, /Bob Example/)
  assert.doesNotMatch(html, /hello from chat/i)
})

test('plain text summary omits message bodies and includes a chat link', () => {
  const text = buildUnreadChatEmailText(sampleMessages, 'https://dupip.com/en/app/chat')

  assert.equal(buildUnreadChatEmailSubject(2), 'You have 2 unread Dupip chat messages')
  assert.match(text, /https:\/\/dupip\.com\/en\/app\/chat/)
  assert.doesNotMatch(text, /hello from chat/i)
})

test('cron authorization requires the configured bearer secret', () => {
  const previousSecret = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'test-secret'

  try {
    assert.equal(
      isAuthorizedCronRequest(
        new Request('https://dupip.com/api/cron/unread-chat-emails', {
          headers: { authorization: 'Bearer test-secret' },
        }),
      ),
      true,
    )
    assert.equal(
      isAuthorizedCronRequest(new Request('https://dupip.com/api/cron/unread-chat-emails')),
      false,
    )
  } finally {
    if (previousSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = previousSecret
    }
  }
})
