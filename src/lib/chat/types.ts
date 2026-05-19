export type ChatRoleValue = 'SUPERUSER' | 'ADMIN' | 'MODERATOR' | 'USER'
export type ChatRoomTypeValue = 'ORG_CHANNEL' | 'DIRECT_MESSAGE'

export interface StoredProfileData {
  username?: { value?: string | null }
  firstName?: { value?: string | null }
  lastName?: { value?: string | null }
  profilePicture?: { value?: string | null }
}

export interface ClerkOrgSummary {
  id: string
  name?: string
  slug?: string
  imageUrl?: string | null
}

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

export interface ChatPendingInviteSummary {
  id: string
  token: string
  clerkOrgId: string
  orgName: string
  orgSlug: string
  createdAt: string
  createdByUserId: string
}

export interface ChatRoomUnreadSummary {
  roomKey: string
  unreadCount: number
  lastMessageAt: string | null
}
