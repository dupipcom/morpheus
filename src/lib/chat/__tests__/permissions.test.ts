import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canAssignRoles,
  canDeleteMessage,
  canManageChannels,
  canManageInvites,
  canModerateMessages,
} from '../permissions'

test('channel and invite management is limited to admins and superusers', () => {
  assert.equal(canManageChannels('SUPERUSER'), true)
  assert.equal(canManageChannels('ADMIN'), true)
  assert.equal(canManageChannels('MODERATOR'), false)
  assert.equal(canManageInvites('USER'), false)
  assert.equal(canManageInvites('ADMIN'), true)
  assert.equal(canAssignRoles('SUPERUSER'), true)
})

test('message deletion allows authors and moderators', () => {
  assert.equal(canDeleteMessage('USER', 'author-id', 'author-id'), true)
  assert.equal(canDeleteMessage('MODERATOR', 'author-id', 'other-user'), true)
  assert.equal(canDeleteMessage('USER', 'author-id', 'other-user'), false)
  assert.equal(canModerateMessages('ADMIN'), true)
  assert.equal(canModerateMessages('USER'), false)
})
