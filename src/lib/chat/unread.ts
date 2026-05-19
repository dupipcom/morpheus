export function getRoomKey(input: { channelId?: string | null; dmConversationId?: string | null }) {
  if (input.channelId) return `channel:${input.channelId}`
  if (input.dmConversationId) return `dm:${input.dmConversationId}`
  throw new Error('Room identifier is required')
}
