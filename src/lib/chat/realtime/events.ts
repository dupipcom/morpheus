export const CHAT_EVENTS = {
  MESSAGE_CREATED: 'message.created',
  MESSAGE_DELETED: 'message.deleted',
  MESSAGE_UPDATED: 'message.updated',
  THREAD_REPLY_CREATED: 'thread.reply.created',
  ROOM_READ: 'room.read',
  ROOM_UNREAD_CHANGED: 'room.unread.changed',
  CHANNEL_CREATED: 'channel.created',
  CHANNEL_UPDATED: 'channel.updated',
  CHANNEL_DELETED: 'channel.deleted',
  DM_CREATED: 'dm.created',
  INVITE_CREATED: 'invite.created',
  MEMBERSHIP_UPDATED: 'membership.updated',
} as const

export type ChatEventName = (typeof CHAT_EVENTS)[keyof typeof CHAT_EVENTS]
