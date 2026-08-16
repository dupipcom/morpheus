'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { useMediaQuery } from 'usehooks-ts'
import { useAuth } from '@clerk/nextjs'
import { MessageSquareReply, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { ChatComposer } from '@/components/chat/chatComposer'
import { ChatMessageContent } from '@/components/chat/chatMessageContent'
import { ChatSidebar, type ChatActiveRoom, type ChatSidebarChannel, type ChatSidebarDm, type ChatSidebarResponse } from '@/components/chat/chatSidebar'
import { useI18n } from '@/lib/contexts/i18n'
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag'
import { MOBILE_CONTENT_BOTTOM_PADDING_CLASS } from '@/lib/constants/mobileNav'
import { getAblyRealtimeClient } from '@/lib/chat/realtime/ablyClient'
import {
  getChatDmChannelName,
  getChatOrgChannelName,
  getChatOrgMetaChannelName,
  getChatSmsChannelName,
  getChatUserChannelName,
} from '@/lib/chat/realtime/channelNames'
import { buildChatRoomPath, type ChatRoomRouteTarget } from '@/lib/chat/routes'
import { cn } from '@/lib/utils/utils'
import type { ChatMessageSummary, ChatPendingInviteSummary } from '@/lib/chat/types'
import type { SmsConversationSummary, SmsMessageStatusValue, SmsMessageSummary } from '@/lib/services/sms'
import { CHAT_ANONYMOUS_MARKER, CHAT_POLL_INTERVAL_MS, getChatAppBaseUrl } from '@/lib/chat/constants'
import { buildChatInviteUrl } from '@/lib/chat/invites'

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(payload.error || 'Request failed')
  }
  return response.json()
}

type ActiveRoom = ChatActiveRoom

type MobileView = 'sidebar' | 'room' | 'thread'

type SidebarChannel = ChatSidebarChannel
type SidebarDm = ChatSidebarDm
type SidebarResponse = ChatSidebarResponse

interface MessagesResponse {
  messages: ChatMessageSummary[]
}

interface ThreadResponse {
  root: ChatMessageSummary
  replies: ChatMessageSummary[]
}

interface SmsMessagesResponse {
  messages: SmsMessageSummary[]
}

interface SmsConversationsResponse {
  conversations: SmsConversationSummary[]
}

interface VirtualNumberAssignmentResponse {
  assignments: { phoneNumber: string; enabled: boolean }[]
  quota: number
}

interface RelationshipCandidate {
  id: string
  displayName: string
  username: string | null
}

interface RelationshipCandidatesResponse {
  candidates: RelationshipCandidate[]
}

function getDisplayLabel(
  displayName: string | null | undefined,
  fallbackLabel: string,
) {
  if (!displayName || displayName === CHAT_ANONYMOUS_MARKER) {
    return fallbackLabel
  }

  return displayName
}

interface ChatViewProps {
  initialUsername?: string
  initialMessageId?: string
  initialOrgId?: string
  initialChannelId?: string
  initialSmsConversationId?: string
}

export function ChatView({ initialUsername, initialMessageId, initialOrgId, initialChannelId, initialSmsConversationId }: ChatViewProps = {}) {
  const { t, hasTranslation, locale } = useI18n()
  const { isSignedIn } = useAuth()
  const { isVirtualNumberEnabled } = useFeatureFlag()
  const router = useRouter()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [activeRoom, setActiveRoom] = useState<ActiveRoom>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>('sidebar')
  const [newOrgName, setNewOrgName] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [dmQuery, setDmQuery] = useState('')
  const [memberInviteQuery, setMemberInviteQuery] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null)
  const [isCreatingOrg, setIsCreatingOrg] = useState(false)
  const [isCreatingChannel, setIsCreatingChannel] = useState(false)
  const [isCreatingDm, setIsCreatingDm] = useState(false)
  const [isCreatingInvite, setIsCreatingInvite] = useState(false)
  const [isInvitingMember, setIsInvitingMember] = useState(false)
  const [isAcceptingInviteId, setIsAcceptingInviteId] = useState<string | null>(null)
  const [messagePendingDelete, setMessagePendingDelete] = useState<ChatMessageSummary | null>(null)
  const deepLinkHandledRef = useRef(false)
  const deepLinkOrgHandledRef = useRef(false)
  const deepLinkThreadHandledRef = useRef(false)
  const deepLinkSmsHandledRef = useRef(false)
  const sidebarRef = useRef<SidebarResponse | undefined>(undefined)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const threadContainerRef = useRef<HTMLDivElement>(null)

  const getNavigationTargetForRoom = useCallback((room: Exclude<ActiveRoom, null>) => {
    if (room.type === 'channel') {
      return { type: 'channel', orgId: room.orgId, channelId: room.id } satisfies ChatRoomRouteTarget
    }

    if (room.type === 'sms') {
      return { type: 'sms', conversationId: room.id } satisfies ChatRoomRouteTarget
    }

    const dm = sidebarRef.current?.dms?.find((candidate) => candidate.id === room.id)
    const username = dm?.participant?.username
    return username ? ({ type: 'dm', username } satisfies ChatRoomRouteTarget) : null
  }, [])

  const openRoom = useCallback(
    (
      room: Exclude<ActiveRoom, null>,
      options: {
        mobileView?: MobileView
        threadMessageId?: string | null
        navigationTarget?: ChatRoomRouteTarget
      } = {},
    ) => {
      const threadMessageId = options.threadMessageId ?? null
      const navigationTarget = options.navigationTarget ?? getNavigationTargetForRoom(room)

      setActiveRoom(room)
      setMobileView(options.mobileView ?? 'room')
      setSelectedThreadId(threadMessageId)
      router.push(buildChatRoomPath(locale, navigationTarget, threadMessageId))
    },
    [getNavigationTargetForRoom, locale, router],
  )

  const sidebarKey = '/api/v1/chat/sidebar'
  const { data: sidebar, error: sidebarError, isLoading: isSidebarLoading, mutate: mutateSidebar } = useSWR<SidebarResponse>(sidebarKey, fetcher, {
    refreshInterval: CHAT_POLL_INTERVAL_MS,
  })
  sidebarRef.current = sidebar

  const activeRoomKey = useMemo(() => {
    if (!activeRoom) return null
    if (activeRoom.type === 'channel') return `/api/v1/chat/channels/${activeRoom.id}/messages`
    if (activeRoom.type === 'sms') return `/api/v1/sms/conversations/${activeRoom.id}/messages`
    return `/api/v1/chat/dms/${activeRoom.id}/messages`
  }, [activeRoom])

  const { data: messagesData, mutate: mutateMessages, isLoading: isMessagesLoading } = useSWR<MessagesResponse>(
    activeRoom && activeRoom.type !== 'sms' ? activeRoomKey : null,
    fetcher,
  )
  const { data: smsMessagesData, mutate: mutateSmsMessages, isLoading: isSmsMessagesLoading } = useSWR<SmsMessagesResponse>(
    activeRoom?.type === 'sms' ? activeRoomKey : null,
    fetcher,
  )

  const smsConversationsKey = isVirtualNumberEnabled ? '/api/v1/sms/conversations' : null
  const {
    data: smsConversationsData,
    error: smsConversationsError,
    isLoading: isSmsConversationsLoading,
    mutate: mutateSmsConversations,
  } = useSWR<SmsConversationsResponse>(smsConversationsKey, fetcher, {
    refreshInterval: CHAT_POLL_INTERVAL_MS,
  })

  const virtualNumberAssignmentKey = isVirtualNumberEnabled ? '/api/v1/virtual-number' : null
  // Shares SWR cache with VirtualNumberPicker
  const { data: virtualNumberAssignmentData } = useSWR<VirtualNumberAssignmentResponse>(virtualNumberAssignmentKey, fetcher)
  const threadKey = selectedThreadId ? `/api/v1/chat/messages/${selectedThreadId}/thread` : null
  const { data: threadData, mutate: mutateThread, isLoading: isThreadLoading } = useSWR<ThreadResponse>(threadKey, fetcher)

  const dmCandidatesKey = dmQuery.trim().length >= 2 ? `/api/v1/chat/dm-candidates?q=${encodeURIComponent(dmQuery.trim())}` : null
  const { data: dmCandidatesData } = useSWR<RelationshipCandidatesResponse>(dmCandidatesKey, fetcher)

  const memberInviteCandidatesKey = memberInviteQuery.trim().length >= 2 ? `/api/v1/chat/dm-candidates?q=${encodeURIComponent(memberInviteQuery.trim())}` : null
  const { data: memberInviteCandidatesData } = useSWR<RelationshipCandidatesResponse>(memberInviteCandidatesKey, fetcher)

  const chatTitle = hasTranslation('chat.title') ? t('chat.title') : 'Chat'
  const anonymousLabel = hasTranslation('chat.anonymous') ? t('chat.anonymous') : 'Anonymous'
  const directMessageLabel = hasTranslation('chat.directMessage') ? t('chat.directMessage') : 'Direct message'
  const deletedMessageTitle = hasTranslation('chat.deleteMessageTitle') ? t('chat.deleteMessageTitle') : 'Delete message?'
  const deletedMessageDescription = hasTranslation('chat.deleteMessageDescription') ? t('chat.deleteMessageDescription') : 'This will soft-delete the message and keep a placeholder in the conversation history.'
  const inviteLinkCopiedLabel = hasTranslation('chat.inviteLinkCopied') ? t('chat.inviteLinkCopied') : 'Invite link copied'
  const inviteSentLabel = hasTranslation('chat.inviteSent') ? t('chat.inviteSent') : 'Invite sent'
  const inviteAcceptedLabel = hasTranslation('chat.inviteAccepted') ? t('chat.inviteAccepted') : 'Invite accepted'
  const smsLabel = hasTranslation('chat.sms.label') ? t('chat.sms.label') : 'SMS'
  const smsEmptyLabel = hasTranslation('chat.sms.empty') ? t('chat.sms.empty') : 'No SMS conversations yet'
  const smsComposerPlaceholder = hasTranslation('chat.sms.composerPlaceholder') ? t('chat.sms.composerPlaceholder') : 'Write an SMS…'
  const smsSendErrorLabel = hasTranslation('chat.sms.sendError') ? t('chat.sms.sendError') : 'Could not send this message'
  const smsYouLabel = hasTranslation('chat.sms.you') ? t('chat.sms.you') : 'You'
  const smsStatusSentLabel = hasTranslation('chat.sms.statusSent') ? t('chat.sms.statusSent') : 'Sent'
  const smsStatusDeliveredLabel = hasTranslation('chat.sms.statusDelivered') ? t('chat.sms.statusDelivered') : 'Delivered'
  const smsStatusFailedLabel = hasTranslation('chat.sms.statusFailed') ? t('chat.sms.statusFailed') : 'Failed'

  useEffect(() => {
    if (activeRoom || !sidebar) return
    // Don't auto-select a default room when deep-link props are present —
    // the dedicated deep-link effects will handle the selection instead.
    if (initialUsername || initialOrgId || initialChannelId || initialSmsConversationId) return

    // On mobile, don't auto-select a room — show the sidebar/rooms list instead.
    if (isMobile) return

    const defaultChannel = sidebar.orgs?.[0]?.channels?.[0]
    if (defaultChannel) {
      const room: ActiveRoom = { type: 'channel', id: defaultChannel.id, orgId: defaultChannel.clerkOrgId, name: defaultChannel.name }
      openRoom(room)
      return
    }

    const defaultDm = sidebar.dms?.[0]
    if (defaultDm) {
      const room: ActiveRoom = { type: 'dm', id: defaultDm.id, name: getDisplayLabel(defaultDm.participant?.displayName, directMessageLabel) }
      openRoom(room)
    }
  }, [activeRoom, isMobile, directMessageLabel, openRoom, sidebar, initialUsername, initialOrgId, initialChannelId, initialSmsConversationId])

  // Deep link: open DM for initialUsername when sidebar is ready
  useEffect(() => {
    if (!initialUsername || !sidebar || deepLinkHandledRef.current) return

    const existingDm = sidebar.dms?.find((dm) => dm.participant?.username === initialUsername)
    if (existingDm) {
      deepLinkHandledRef.current = true
      const room: ActiveRoom = { type: 'dm', id: existingDm.id, name: getDisplayLabel(existingDm.participant?.displayName, directMessageLabel) }
      openRoom(room, { threadMessageId: initialMessageId, navigationTarget: { type: 'dm', username: initialUsername } })
      return
    }

    // DM not found — search candidates and create it
    void (async () => {
      try {
        const response = await fetch(`/api/v1/chat/dm-candidates?q=${encodeURIComponent(initialUsername)}`)
        if (!response.ok) return
        const data = await response.json() as { candidates: RelationshipCandidate[] }
        const candidate = data.candidates.find((c) => c.username === initialUsername)
        if (!candidate) return

        const dmResponse = await fetch('/api/v1/chat/dms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantUserId: candidate.id }),
        })
        if (!dmResponse.ok) return
        const payload = await dmResponse.json() as { conversation?: { id?: string } }

        deepLinkHandledRef.current = true
        if (payload.conversation?.id) {
          const room: ActiveRoom = { type: 'dm', id: payload.conversation.id, name: getDisplayLabel(candidate.displayName, directMessageLabel) }
          openRoom(room, { threadMessageId: initialMessageId, navigationTarget: { type: 'dm', username: initialUsername } })
        }
        await mutateSidebar()
      } catch {
        // ignore
      }
    })()
  }, [directMessageLabel, initialMessageId, initialUsername, mutateSidebar, openRoom, sidebar])

  // Deep link: open org channel when initialOrgId + initialChannelId are provided
  useEffect(() => {
    if (!initialOrgId || !initialChannelId || !sidebar || deepLinkOrgHandledRef.current) return

    const org = sidebar.orgs?.find((o) => o.id === initialOrgId)
    const channel = org?.channels?.find((c) => c.id === initialChannelId)
    if (org && channel) {
      deepLinkOrgHandledRef.current = true
      const room: ActiveRoom = { type: 'channel', id: channel.id, orgId: org.id, name: channel.name }
      openRoom(room, { threadMessageId: initialMessageId })
    }
  }, [initialChannelId, initialMessageId, initialOrgId, openRoom, sidebar])

  useEffect(() => {
    if (!initialSmsConversationId || !smsConversationsData || deepLinkSmsHandledRef.current) return

    const conversation = smsConversationsData.conversations.find((candidate) => candidate.id === initialSmsConversationId)
    if (!conversation) return

    deepLinkSmsHandledRef.current = true
    const room: ActiveRoom = { type: 'sms', id: conversation.id, name: conversation.counterpartPhoneNumber }
    openRoom(room)
  }, [initialSmsConversationId, openRoom, smsConversationsData])

  // Deep link: scroll to initialMessageId and open thread panel when messages are loaded
  useEffect(() => {
    if (!initialMessageId || !messagesData?.messages?.length || deepLinkThreadHandledRef.current) return
    const el = document.querySelector<HTMLElement>(`[data-message-id="${initialMessageId}"]`)
    if (el) {
      deepLinkThreadHandledRef.current = true
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-primary')
      setSelectedThreadId(initialMessageId)
      setMobileView('thread')
    }
  }, [initialMessageId, messagesData])

  useEffect(() => {
    if (!activeRoom) return

    if (activeRoom.type === 'sms') {
      const smsMessages = smsMessagesData?.messages ?? []
      const lastMessageId = smsMessages[smsMessages.length - 1]?.id
      if (!lastMessageId) return

      void fetch(`/api/v1/sms/conversations/${activeRoom.id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastReadMessageId: lastMessageId }),
      }).then(() => {
        void mutateSidebar()
        void mutateSmsConversations()
      })
      return
    }

    if (!messagesData?.messages?.length) return

    const lastMessageId = messagesData.messages[messagesData.messages.length - 1]?.id
    if (!lastMessageId) return

    const body = activeRoom.type === 'channel'
      ? { channelId: activeRoom.id, lastReadMessageId: lastMessageId }
      : { dmConversationId: activeRoom.id, lastReadMessageId: lastMessageId }

    void fetch('/api/v1/chat/read-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(() => mutateSidebar())
  }, [activeRoom, messagesData, smsMessagesData, mutateSidebar, mutateSmsConversations])

  useEffect(() => {
    const currentUserId = sidebar?.currentUserId
    if (!currentUserId) return

    const client = getAblyRealtimeClient()
    if (!client) return

    const unsubscribers: Array<() => void> = []
    const subscribe = async (channelName: string, handler: () => void) => {
      const channel = client.channels.get(channelName)
      await channel.subscribe(handler)
      unsubscribers.push(() => {
        void channel.unsubscribe(handler)
      })
    }

    const invalidate = () => {
      void mutateSidebar()
      void mutateMessages()
      void mutateSmsConversations()
      if (selectedThreadId) {
        void mutateThread()
      }
    }

    void subscribe(getChatUserChannelName(currentUserId), invalidate)

    if (activeRoom?.type === 'channel') {
      void subscribe(getChatOrgChannelName(activeRoom.orgId, activeRoom.id), invalidate)
      void subscribe(getChatOrgMetaChannelName(activeRoom.orgId), invalidate)
    }

    if (activeRoom?.type === 'dm') {
      void subscribe(getChatDmChannelName(activeRoom.id), invalidate)
    }

    if (activeRoom?.type === 'sms') {
      void subscribe(getChatSmsChannelName(activeRoom.id), invalidate)
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [activeRoom, mutateMessages, mutateSidebar, mutateSmsConversations, mutateThread, selectedThreadId, sidebar?.currentUserId])

  const activeOrg = useMemo(() => {
    if (!activeRoom || activeRoom.type !== 'channel') return sidebar?.orgs?.[0] ?? null
    return sidebar?.orgs?.find((org) => org.id === activeRoom.orgId) ?? null
  }, [activeRoom, sidebar])

  const messages = useMemo(() => messagesData?.messages ?? [], [messagesData?.messages])
  const smsMessages = useMemo(() => smsMessagesData?.messages ?? [], [smsMessagesData?.messages])

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, smsMessages])

  useEffect(() => {
    if (threadData && threadContainerRef.current) {
      threadContainerRef.current.scrollTop = threadContainerRef.current.scrollHeight
    }
  }, [threadData])

  const sendMessage = useCallback(async (content: string) => {
    if (!activeRoom) return

    if (activeRoom.type === 'sms') {
      const response = await fetch(`/api/v1/sms/conversations/${activeRoom.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: smsSendErrorLabel }))
        throw new Error(payload.error || smsSendErrorLabel)
      }

      await Promise.all([mutateSmsMessages(), mutateSmsConversations(), mutateSidebar()])
      return
    }

    const response = await fetch(
      activeRoom.type === 'channel'
        ? `/api/v1/chat/channels/${activeRoom.id}/messages`
        : `/api/v1/chat/dms/${activeRoom.id}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      },
    )

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Failed to send message' }))
      throw new Error(payload.error || 'Failed to send message')
    }

    await Promise.all([mutateMessages(), mutateSidebar()])
  }, [activeRoom, mutateMessages, mutateSidebar, mutateSmsConversations, mutateSmsMessages, smsSendErrorLabel])

  const sendThreadReply = useCallback(async (content: string) => {
    if (!activeRoom || !threadData?.root?.id) return

    const replyToMessageId = threadData.replies?.length
      ? threadData.replies[threadData.replies.length - 1].id
      : threadData.root.id

    const response = await fetch(
      activeRoom.type === 'channel'
        ? `/api/v1/chat/channels/${activeRoom.id}/messages`
        : `/api/v1/chat/dms/${activeRoom.id}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          replyToMessageId,
          threadRootMessageId: threadData.root.id,
        }),
      },
    )

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Failed to send reply' }))
      throw new Error(payload.error || 'Failed to send reply')
    }

    await Promise.all([mutateMessages(), mutateThread(), mutateSidebar()])
  }, [activeRoom, mutateMessages, mutateSidebar, mutateThread, threadData])

  const createOrg = async () => {
    if (!newOrgName.trim()) return
    setIsCreatingOrg(true)
    try {
      const response = await fetch('/api/v1/chat/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName.trim() }),
      })
      if (!response.ok) throw new Error('Failed to create organization')
      setNewOrgName('')
      await mutateSidebar()
    } finally {
      setIsCreatingOrg(false)
    }
  }

  const createChannel = async () => {
    if (!activeOrg?.id || !newChannelName.trim()) return
    setIsCreatingChannel(true)
    try {
      const response = await fetch(`/api/v1/chat/orgs/${activeOrg.id}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newChannelName.trim() }),
      })
      if (!response.ok) throw new Error('Failed to create channel')
      setNewChannelName('')
      await mutateSidebar()
    } finally {
      setIsCreatingChannel(false)
    }
  }

  const startDm = async (participantUserId: string) => {
    setIsCreatingDm(true)
    try {
      const response = await fetch('/api/v1/chat/dms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantUserId }),
      })
      if (!response.ok) throw new Error('Failed to start direct message')
      setDmQuery('')
      await mutateSidebar()
    } finally {
      setIsCreatingDm(false)
    }
  }

  const createInviteLink = async () => {
    if (!activeOrg?.id) return
    setIsCreatingInvite(true)
    setInviteFeedback(null)
    try {
      const response = await fetch(`/api/v1/chat/orgs/${activeOrg.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to create invite')

      const link = buildChatInviteUrl(getChatAppBaseUrl(), locale, payload.invite.token)
      setInviteLink(link)
      setInviteFeedback(inviteLinkCopiedLabel)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      }
    } finally {
      setIsCreatingInvite(false)
    }
  }

  /**
   * Send a pending organization invitation to a friend or close friend.
   * This requires org admin permissions and refreshes the sidebar when the invite is created.
   */
  const inviteMemberToOrg = async (inviteeUserId: string) => {
    if (!activeOrg?.id) return
    setIsInvitingMember(true)
    setInviteFeedback(null)
    try {
      const response = await fetch(`/api/v1/chat/orgs/${activeOrg.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeUserId }),
      })
      const payload = await response.json().catch(() => ({ error: 'Failed to send invite' }))
      if (!response.ok) throw new Error(payload.error || 'Failed to send invite')
      setInviteFeedback(inviteSentLabel)
      setMemberInviteQuery('')
      await mutateSidebar()
    } finally {
      setIsInvitingMember(false)
    }
  }

  /**
   * Accept a pending org invitation for the current user, then refresh sidebar state and feedback.
   */
  const acceptPendingInvite = async (invite: ChatPendingInviteSummary) => {
    setIsAcceptingInviteId(invite.id)
    try {
      const response = await fetch(`/api/v1/chat/invites/${invite.id}/accept`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({ error: 'Failed to accept invite' }))
      if (!response.ok) throw new Error(payload.error || 'Failed to accept invite')
      setInviteFeedback(inviteAcceptedLabel)
      await mutateSidebar()
    } finally {
      setIsAcceptingInviteId(null)
    }
  }

  const deleteMessage = async () => {
    if (!messagePendingDelete) return

    const response = await fetch(`/api/v1/chat/messages/${messagePendingDelete.id}`, { method: 'DELETE' })
    if (!response.ok) return

    setMessagePendingDelete(null)
    await Promise.all([mutateMessages(), mutateThread(), mutateSidebar()])
  }

  const openSmsConversation = (conversation: SmsConversationSummary) => {
    const room: ActiveRoom = { type: 'sms', id: conversation.id, name: conversation.counterpartPhoneNumber }
    openRoom(room)
  }

  const smsStatusLabel = (status: SmsMessageStatusValue | null) => {
    if (status === 'DELIVERED') return smsStatusDeliveredLabel
    if (status === 'FAILED') return smsStatusFailedLabel
    if (status === 'SENT') return smsStatusSentLabel
    return null
  }

  const renderSmsMessage = (message: SmsMessageSummary) => (
    <div key={message.id} className="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {message.direction === 'INBOUND' ? message.fromPhoneNumber : smsYouLabel}
          </p>
          <p className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleString()}</p>
        </div>
        {message.direction === 'OUTBOUND' && smsStatusLabel(message.status) && (
          <Badge variant="outline">{smsStatusLabel(message.status)}</Badge>
        )}
      </div>
      <ChatMessageContent content={message.text} />
    </div>
  )

  const renderMessage = (message: ChatMessageSummary) => (
    <div key={message.id} data-message-id={message.id} className="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{getDisplayLabel(message.author?.displayName, anonymousLabel)}</p>
          <p className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          {(message.replyCount ?? 0) > 0 && (
            <Badge variant="outline">{message.replyCount} replies</Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => {
            const threadId = message.threadRootMessageId || message.id
            if (!activeRoom) return
            openRoom(activeRoom, { mobileView: 'thread', threadMessageId: threadId })
          }}>
            <MessageSquareReply className="h-4 w-4" />
            Thread
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMessagePendingDelete(message)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ChatMessageContent content={message.content} deletedAt={message.deletedAt} />
    </div>
  )

  const openChannelFromSidebar = useCallback((channel: SidebarChannel) => {
    const room: ActiveRoom = { type: 'channel', id: channel.id, orgId: channel.clerkOrgId, name: channel.name }
    openRoom(room)
  }, [openRoom])

  const openDmFromSidebar = useCallback((dm: SidebarDm) => {
    const room: ActiveRoom = { type: 'dm', id: dm.id, name: getDisplayLabel(dm.participant?.displayName, directMessageLabel) }
    openRoom(
      room,
      dm.participant?.username
        ? { navigationTarget: { type: 'dm', username: dm.participant.username } }
        : undefined,
    )
  }, [directMessageLabel, openRoom])


  const roomPanel = (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="md:hidden" />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{activeRoom?.type === 'channel' ? 'Channel' : activeRoom?.type === 'dm' ? directMessageLabel : activeRoom?.type === 'sms' ? smsLabel : 'Select a room'}</p>
            <h2 className="truncate text-lg font-semibold">{activeRoom?.name || chatTitle}</h2>
          </div>
        </div>
        <div className="flex gap-2 md:hidden">
          {selectedThreadId && <Button variant="outline" size="sm" onClick={() => setMobileView('thread')}>Thread</Button>}
        </div>
      </div>

      <div ref={messagesContainerRef} className={`flex-1 space-y-4 overflow-y-auto p-4 ${MOBILE_CONTENT_BOTTOM_PADDING_CLASS} md:pb-4`}>
        {activeRoom?.type === 'sms' ? (
          isSmsMessagesLoading ? (
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          ) : smsMessages.length > 0 ? (
            smsMessages.map(renderSmsMessage)
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">{smsEmptyLabel}</CardContent>
            </Card>
          )
        ) : isMessagesLoading ? (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        ) : messages.length > 0 ? (
          messages.map((message) => renderMessage(message))
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">No messages yet. Start the conversation.</CardContent>
          </Card>
        )}
      </div>

      {activeRoom && <ChatComposer placeholder={activeRoom.type === 'sms' ? smsComposerPlaceholder : 'Write a message…'} onSubmit={sendMessage} collapsible />}
    </div>
  )

  const threadPanel = (
    <div className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm text-muted-foreground">Thread</p>
          <h3 className="text-base font-semibold">Replies</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => {
          if (!activeRoom) return
          openRoom(activeRoom)
        }}>
          Close
        </Button>
      </div>
      <div ref={threadContainerRef} className={`flex-1 space-y-4 overflow-y-auto p-4 ${MOBILE_CONTENT_BOTTOM_PADDING_CLASS} md:pb-4`}>
        {isThreadLoading ? (
          <p className="text-sm text-muted-foreground">Loading thread…</p>
        ) : threadData?.root ? (
          <>
            {renderMessage(threadData.root)}
            {threadData.replies?.map((reply) => renderMessage(reply))}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a message to view its thread.</p>
        )}
      </div>
      {threadData?.root && <ChatComposer placeholder="Reply in thread…" onSubmit={sendThreadReply} collapsible />}
    </div>
  )

  return (
    <main className="z-[9999] mx-auto flex h-[calc(100dvh-160px)] w-full max-w-[1400px] flex-col overflow-hidden px-4 py-2 md:px-6">
      <Dialog open={Boolean(messagePendingDelete)} onOpenChange={(open) => { if (!open) setMessagePendingDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deletedMessageTitle}</DialogTitle>
            <DialogDescription>{deletedMessageDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessagePendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void deleteMessage()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {sidebarError ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{sidebarError.message}</CardContent>
        </Card>
      ) : isSidebarLoading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">Loading chat…</CardContent>
        </Card>
      ) : (
        <SidebarProvider className="relative h-full min-h-0 flex-1 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <ChatSidebar
            sidebar={sidebar}
            activeRoom={activeRoom}
            activeOrgId={activeOrg?.id ?? null}
            isSignedIn={isSignedIn ?? undefined}
            isVirtualNumberEnabled={isVirtualNumberEnabled}
            smsConversations={smsConversationsData?.conversations ?? []}
            isSmsConversationsLoading={isSmsConversationsLoading}
            smsConversationsHasError={Boolean(smsConversationsError)}
            hasAssignedVirtualNumber={Boolean(
              virtualNumberAssignmentData?.assignments?.some((assignment) => assignment.enabled),
            )}
            dmQuery={dmQuery}
            onDmQueryChange={setDmQuery}
            dmCandidates={dmCandidatesData?.candidates ?? []}
            memberInviteQuery={memberInviteQuery}
            onMemberInviteQueryChange={setMemberInviteQuery}
            memberInviteCandidates={memberInviteCandidatesData?.candidates ?? []}
            newOrgName={newOrgName}
            onNewOrgNameChange={setNewOrgName}
            newChannelName={newChannelName}
            onNewChannelNameChange={setNewChannelName}
            onSelectDm={openDmFromSidebar}
            onSelectChannel={openChannelFromSidebar}
            onSelectSmsConversation={openSmsConversation}
            onStartDm={(id) => { void startDm(id) }}
            onCreateOrg={() => { void createOrg() }}
            onCreateChannel={() => { void createChannel() }}
            onCreateInviteLink={() => { void createInviteLink() }}
            onInviteMemberToOrg={(id) => { void inviteMemberToOrg(id) }}
            onAcceptPendingInvite={(invite) => { void acceptPendingInvite(invite) }}
            onRefresh={() => { void mutateSidebar() }}
            isCreatingOrg={isCreatingOrg}
            isCreatingChannel={isCreatingChannel}
            isCreatingDm={isCreatingDm}
            isCreatingInvite={isCreatingInvite}
            isInvitingMember={isInvitingMember}
            isAcceptingInviteId={isAcceptingInviteId}
            inviteLink={inviteLink}
            inviteFeedback={inviteFeedback}
          />
          <SidebarInset className="flex min-w-0 flex-1 flex-row overflow-hidden bg-background">
            <div className={cn('h-full min-w-0 flex-1', mobileView === 'thread' ? 'hidden md:flex' : 'flex')}>
              {roomPanel}
            </div>
            <div className={cn('h-full md:flex xl:w-[420px] xl:min-w-[420px] xl:flex-none', selectedThreadId ? 'flex' : 'hidden', mobileView === 'thread' ? 'w-full' : 'hidden xl:flex')}>
              {threadPanel}
            </div>
          </SidebarInset>
        </SidebarProvider>
      )}
    </main>
  )
}
