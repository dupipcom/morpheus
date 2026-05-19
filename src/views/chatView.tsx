'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Hash, Inbox, Mail, MessageSquareReply, Plus, RefreshCcw, Send, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ChatComposer } from '@/components/chat/chatComposer'
import { ChatMessageContent } from '@/components/chat/chatMessageContent'
import { ChatUnreadBadge } from '@/components/chat/chatUnreadBadge'
import { useI18n } from '@/lib/contexts/i18n'
import { getAblyRealtimeClient } from '@/lib/chat/realtime/ablyClient'
import {
  getChatDmChannelName,
  getChatOrgChannelName,
  getChatOrgMetaChannelName,
  getChatUserChannelName,
} from '@/lib/chat/realtime/channelNames'
import { cn } from '@/lib/utils/utils'
import type { ChatMessageSummary, ChatUserProfile } from '@/lib/chat/types'
import { CHAT_POLL_INTERVAL_MS, getChatAppBaseUrl } from '@/lib/chat/constants'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(payload.error || 'Request failed')
  }
  return response.json()
}

type ActiveRoom =
  | { type: 'channel'; id: string; orgId: string; name: string }
  | { type: 'dm'; id: string; name: string }
  | null

type MobileView = 'sidebar' | 'room' | 'thread'

interface SidebarChannel {
  id: string
  clerkOrgId: string
  name: string
  unreadCount: number
}

interface SidebarOrg {
  id: string
  name: string
  role: 'SUPERUSER' | 'ADMIN' | 'MODERATOR' | 'USER'
  channels: SidebarChannel[]
}

interface SidebarDm {
  id: string
  unreadCount: number
  participant: ChatUserProfile | null
}

interface SidebarResponse {
  currentUserId: string
  totalUnreadCount: number
  orgs: SidebarOrg[]
  dms: SidebarDm[]
}

interface MessagesResponse {
  messages: ChatMessageSummary[]
}

interface ThreadResponse {
  root: ChatMessageSummary
  replies: ChatMessageSummary[]
}

interface DmCandidate {
  id: string
  displayName: string
  username: string | null
}

interface DmCandidatesResponse {
  candidates: DmCandidate[]
}

export function ChatView() {
  const { t, hasTranslation } = useI18n()
  const [activeRoom, setActiveRoom] = useState<ActiveRoom>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>('sidebar')
  const [newOrgName, setNewOrgName] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [dmQuery, setDmQuery] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [isCreatingOrg, setIsCreatingOrg] = useState(false)
  const [isCreatingChannel, setIsCreatingChannel] = useState(false)
  const [isCreatingDm, setIsCreatingDm] = useState(false)
  const [isCreatingInvite, setIsCreatingInvite] = useState(false)
  const [messagePendingDelete, setMessagePendingDelete] = useState<ChatMessageSummary | null>(null)

  const sidebarKey = '/api/v1/chat/sidebar'
  const { data: sidebar, error: sidebarError, isLoading: isSidebarLoading, mutate: mutateSidebar } = useSWR<SidebarResponse>(sidebarKey, fetcher, {
    refreshInterval: CHAT_POLL_INTERVAL_MS,
  })

  const activeRoomKey = useMemo(() => {
    if (!activeRoom) return null
    return activeRoom.type === 'channel'
      ? `/api/v1/chat/channels/${activeRoom.id}/messages`
      : `/api/v1/chat/dms/${activeRoom.id}/messages`
  }, [activeRoom])

  const { data: messagesData, mutate: mutateMessages, isLoading: isMessagesLoading } = useSWR<MessagesResponse>(activeRoomKey, fetcher)
  const threadKey = selectedThreadId ? `/api/v1/chat/messages/${selectedThreadId}/thread` : null
  const { data: threadData, mutate: mutateThread, isLoading: isThreadLoading } = useSWR<ThreadResponse>(threadKey, fetcher)

  const dmCandidatesKey = dmQuery.trim().length >= 2 ? `/api/v1/chat/dm-candidates?q=${encodeURIComponent(dmQuery.trim())}` : null
  const { data: dmCandidatesData } = useSWR<DmCandidatesResponse>(dmCandidatesKey, fetcher)

  const chatTitle = hasTranslation('chat.title') ? t('chat.title') : 'Chat'
  const chatSubtitle = hasTranslation('chat.subtitle') ? t('chat.subtitle') : 'Organizations, channels, direct messages, and threads.'
  const anonymousLabel = hasTranslation('chat.anonymous') ? t('chat.anonymous') : 'Anonymous'
  const directMessageLabel = hasTranslation('chat.directMessage') ? t('chat.directMessage') : 'Direct message'
  const deletedMessageTitle = hasTranslation('chat.deleteMessageTitle') ? t('chat.deleteMessageTitle') : 'Delete message?'
  const deletedMessageDescription = hasTranslation('chat.deleteMessageDescription') ? t('chat.deleteMessageDescription') : 'This will soft-delete the message and keep a placeholder in the conversation history.'
  const createInviteLabel = hasTranslation('chat.createInviteLink') ? t('chat.createInviteLink') : 'Create invite link'

  useEffect(() => {
    if (activeRoom || !sidebar) return

    const defaultChannel = sidebar.orgs?.[0]?.channels?.[0]
    if (defaultChannel) {
      setActiveRoom({ type: 'channel', id: defaultChannel.id, orgId: defaultChannel.clerkOrgId, name: defaultChannel.name })
      return
    }

    const defaultDm = sidebar.dms?.[0]
    if (defaultDm) {
      setActiveRoom({ type: 'dm', id: defaultDm.id, name: defaultDm.participant?.displayName || directMessageLabel })
    }
  }, [activeRoom, directMessageLabel, sidebar])

  useEffect(() => {
    if (!activeRoom || !messagesData?.messages?.length) return

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
  }, [activeRoom, messagesData, mutateSidebar])

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

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [activeRoom, mutateMessages, mutateSidebar, mutateThread, selectedThreadId, sidebar?.currentUserId])

  const activeOrg = useMemo(() => {
    if (!activeRoom || activeRoom.type !== 'channel') return sidebar?.orgs?.[0] ?? null
    return sidebar?.orgs?.find((org) => org.id === activeRoom.orgId) ?? null
  }, [activeRoom, sidebar])

  const messages = messagesData?.messages ?? []

  const sendMessage = useCallback(async (content: string) => {
    if (!activeRoom) return

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
  }, [activeRoom, mutateMessages, mutateSidebar])

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

  const createInvite = async () => {
    if (!activeOrg?.id) return
    setIsCreatingInvite(true)
    try {
      const response = await fetch(`/api/v1/chat/orgs/${activeOrg.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to create invite')
      const link = `${getChatAppBaseUrl()}/api/v1/chat/invites/${payload.invite.token}/accept`
      setInviteLink(link)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      }
    } finally {
      setIsCreatingInvite(false)
    }
  }

  const deleteMessage = async () => {
    if (!messagePendingDelete) return

    const response = await fetch(`/api/v1/chat/messages/${messagePendingDelete.id}`, { method: 'DELETE' })
    if (!response.ok) return

    setMessagePendingDelete(null)
    await Promise.all([mutateMessages(), mutateThread(), mutateSidebar()])
  }

  const renderMessage = (message: ChatMessageSummary) => (
    <div key={message.id} className="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{message.author?.displayName || anonymousLabel}</p>
          <p className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          {(message.replyCount ?? 0) > 0 && (
            <Badge variant="outline">{message.replyCount} replies</Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => {
            setSelectedThreadId(message.threadRootMessageId || message.id)
            setMobileView('thread')
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

  const sidebarPanel = (
    <div className="flex h-full flex-col gap-4 border-r border-border bg-background/95 p-4 md:min-w-[320px] md:max-w-[360px]">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" />
            {chatTitle}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{chatSubtitle}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={newOrgName} onChange={(event) => setNewOrgName(event.target.value)} placeholder="Create an organization" />
            <Button onClick={() => void createOrg()} disabled={isCreatingOrg || !newOrgName.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {inviteLink && <p className="text-xs text-muted-foreground break-all">Invite copied: {inviteLink}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-[72px_minmax(0,1fr)] md:flex-1">
        <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
          {sidebar?.orgs?.map((org) => (
            <button
              key={org.id}
              type="button"
              className={cn(
                'flex h-14 min-w-14 items-center justify-center rounded-2xl border border-border bg-card text-sm font-semibold transition hover:border-primary hover:text-primary',
                activeRoom?.type === 'channel' && activeRoom.orgId === org.id && 'border-primary bg-primary/10 text-primary',
              )}
              onClick={() => {
                const firstChannel = org.channels?.[0]
                if (firstChannel) {
                  setActiveRoom({ type: 'channel', id: firstChannel.id, orgId: org.id, name: firstChannel.name })
                  setMobileView('room')
                }
              }}
            >
              {org.name.slice(0, 2).toUpperCase()}
            </button>
          ))}
        </div>

        <div className="space-y-4 overflow-y-auto pr-1">
          {activeOrg && (
            <Card>
              <CardHeader className="space-y-2">
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4" />{activeOrg.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => void mutateSidebar()}>
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(activeOrg.role === 'ADMIN' || activeOrg.role === 'SUPERUSER') && (
                  <>
                    <div className="flex gap-2">
                      <Input value={newChannelName} onChange={(event) => setNewChannelName(event.target.value)} placeholder="Create a channel" />
                      <Button onClick={() => void createChannel()} disabled={isCreatingChannel || !newChannelName.trim()}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => void createInvite()} disabled={isCreatingInvite}>
                      <Send className="h-4 w-4" />
                      {createInviteLabel}
                    </Button>
                  </>
                )}
                <div className="space-y-2">
                  {activeOrg.channels?.map((channel) => (
                    <button
                      key={channel.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-sm hover:border-border hover:bg-muted/40',
                        activeRoom?.type === 'channel' && activeRoom.id === channel.id && 'border-primary bg-primary/10',
                      )}
                      onClick={() => {
                        setActiveRoom({ type: 'channel', id: channel.id, orgId: channel.clerkOrgId, name: channel.name })
                        setMobileView('room')
                      }}
                    >
                      <span className="flex items-center gap-2"><Hash className="h-4 w-4 text-muted-foreground" />{channel.name}</span>
                      <ChatUnreadBadge count={channel.unreadCount} />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-base"><Inbox className="h-4 w-4" />Direct messages</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={dmQuery} onChange={(event) => setDmQuery(event.target.value)} placeholder="Search friends to start a DM" />
              {dmCandidatesData?.candidates?.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border/60 p-2">
                  {dmCandidatesData.candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted/40"
                      onClick={() => void startDm(candidate.id)}
                      disabled={isCreatingDm}
                    >
                      <span>{candidate.displayName}</span>
                      <Plus className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {sidebar?.dms?.map((dm) => (
                  <button
                    key={dm.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-sm hover:border-border hover:bg-muted/40',
                      activeRoom?.type === 'dm' && activeRoom.id === dm.id && 'border-primary bg-primary/10',
                    )}
                    onClick={() => {
                      setActiveRoom({ type: 'dm', id: dm.id, name: dm.participant?.displayName || directMessageLabel })
                      setMobileView('room')
                    }}
                  >
                    <span>{dm.participant?.displayName || 'Direct message'}</span>
                    <ChatUnreadBadge count={dm.unreadCount} />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )

  const roomPanel = (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm text-muted-foreground">{activeRoom?.type === 'channel' ? 'Channel' : activeRoom?.type === 'dm' ? 'Direct message' : 'Select a room'}</p>
          <h2 className="text-lg font-semibold">{activeRoom?.name || 'Chat'}</h2>
        </div>
        <div className="flex gap-2 md:hidden">
          <Button variant="outline" size="sm" onClick={() => setMobileView('sidebar')}>Rooms</Button>
          {selectedThreadId && <Button variant="outline" size="sm" onClick={() => setMobileView('thread')}>Thread</Button>}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {isMessagesLoading ? (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        ) : messages.length > 0 ? (
          messages.map((message) => renderMessage(message))
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">No messages yet. Start the conversation.</CardContent>
          </Card>
        )}
      </div>

      {activeRoom && <ChatComposer placeholder="Write a message…" onSubmit={sendMessage} />}
    </div>
  )

  const threadPanel = (
    <div className="flex h-full w-full max-w-[420px] flex-col border-l border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm text-muted-foreground">Thread</p>
          <h3 className="text-base font-semibold">Replies</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => {
          setSelectedThreadId(null)
          setMobileView('room')
        }}>
          Close
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
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
      {threadData?.root && <ChatComposer placeholder="Reply in thread…" onSubmit={sendThreadReply} />}
    </div>
  )

  return (
    <main className="mx-auto flex min-h-[calc(100vh-210px)] w-full max-w-[1400px] flex-col px-4 py-6 md:px-6">
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
        <div className="flex min-h-[calc(100vh-240px)] overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className={cn('h-full w-full md:flex md:w-auto', mobileView === 'sidebar' ? 'flex' : 'hidden md:flex')}>
            {sidebarPanel}
          </div>
          <div className={cn('h-full min-w-0 flex-1', mobileView === 'room' ? 'flex' : 'hidden md:flex')}>
            {roomPanel}
          </div>
          <div className={cn('h-full md:flex', selectedThreadId ? 'flex' : 'hidden', mobileView === 'thread' ? 'w-full' : 'hidden xl:flex')}>
            {threadPanel}
          </div>
        </div>
      )}
    </main>
  )
}
