export type ChatRoleValue = 'SUPERUSER' | 'ADMIN' | 'MODERATOR' | 'USER'
export type ChatRoomTypeValue = 'ORG_CHANNEL' | 'DIRECT_MESSAGE'

export interface ChatUserProfile {
  id: string
  userId: string | null
  displayName: string
  username: string | null
  imageUrl: string | null
}

export interface ChatMessageSummary {
  id: string
  roomType: ChatRoomTypeValue
  channelId: string | null
  dmConversationId: string | null
  authorUserId: string
  content: string
  deletedAt: string | null
  replyToMessageId: string | null
  threadRootMessageId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  editedAt: string | null
  author: ChatUserProfile | null
  replyCount?: number
  latestReplyAt?: string | null
}

export interface ChatRoomUnreadSummary {
  roomKey: string
  unreadCount: number
  lastMessageAt: string | null
}
