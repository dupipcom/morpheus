export function getChatUserChannelName(userId: string) {
  return `chat:user:${userId}`
}

export function getChatOrgChannelName(orgId: string, channelId: string) {
  return `chat:org:${orgId}:channel:${channelId}`
}

export function getChatDmChannelName(conversationId: string) {
  return `chat:dm:${conversationId}`
}

export function getChatOrgMetaChannelName(orgId: string) {
  return `chat:org:${orgId}:meta`
}

export function getChatSmsChannelName(conversationId: string) {
  return `chat:sms:${conversationId}`
}

export function getChatVoicemailChannelName(userId: string) {
  return `chat:voicemail:${userId}`
}
