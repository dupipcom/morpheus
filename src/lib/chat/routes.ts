export type ChatRoomRouteTarget =
  | { type: 'channel'; orgId: string; channelId: string }
  | { type: 'dm'; username: string }
  | { type: 'sms'; conversationId: string }
  | { type: 'voicemails' }
  | null

export function buildChatRoomPath(locale: string, target: ChatRoomRouteTarget, messageId?: string | null) {
  if (!target) {
    return `/${locale}/app/chat`
  }

  if (target.type === 'dm') {
    const threadSuffix = messageId ? `/message/${messageId}` : ''
    return `/${locale}/app/chat/${target.username}${threadSuffix}`
  }

  if (target.type === 'channel') {
    const threadSuffix = messageId ? `/message/${messageId}` : ''
    return `/${locale}/app/chat/org/${target.orgId}/channel/${target.channelId}${threadSuffix}`
  }

  if (target.type === 'voicemails') {
    return `/${locale}/app/chat/voicemails`
  }

  return `/${locale}/app/chat/sms/${target.conversationId}`
}
