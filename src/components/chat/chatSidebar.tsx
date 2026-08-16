'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SignInButton } from '@clerk/nextjs'
import {
  ChevronRight,
  Check,
  Hash,
  Inbox,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCcw,
  Send,
  UserPlus,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { ChatUnreadBadge } from '@/components/chat/chatUnreadBadge'
import { SmsSidebarCard } from '@/components/chat/smsSidebarCard'
import { VirtualNumberGate } from '@/components/chat/virtualNumberGate'
import { VirtualNumberPicker } from '@/components/chat/virtualNumberPicker'
import { useI18n } from '@/lib/contexts/i18n'
import { CHAT_ANONYMOUS_MARKER } from '@/lib/chat/constants'
import type {
  ChatPendingInviteSummary,
  ChatUserProfile,
} from '@/lib/chat/types'
import type { SmsConversationSummary } from '@/lib/services/sms'

/**
 * Shared types for the chat sidebar tree. The server response shape is owned
 * by `/api/v1/chat/sidebar`; these are the client-side aliases used by both
 * the sidebar component and the parent `ChatView`.
 */
export interface ChatSidebarChannel {
  id: string
  clerkOrgId: string
  name: string
  unreadCount: number
}

export interface ChatSidebarOrg {
  id: string
  name: string
  role: 'SUPERUSER' | 'ADMIN' | 'MODERATOR' | 'USER'
  channels: ChatSidebarChannel[]
}

export interface ChatSidebarDm {
  id: string
  unreadCount: number
  participant: ChatUserProfile | null
}

export interface ChatSidebarResponse {
  currentUserId: string
  totalUnreadCount: number
  messageUnreadCount: number
  pendingInvitesCount: number
  pendingInvites: ChatPendingInviteSummary[]
  orgs: ChatSidebarOrg[]
  dms: ChatSidebarDm[]
}

export type ChatActiveRoom =
  | { type: 'channel'; id: string; orgId: string; name: string }
  | { type: 'dm'; id: string; name: string }
  | { type: 'sms'; id: string; name: string }
  | null

interface DmCandidate {
  id: string
  displayName: string
  username: string | null
}

interface ChatSidebarProps {
  sidebar: ChatSidebarResponse | undefined
  activeRoom: ChatActiveRoom
  activeOrgId: string | null
  isSignedIn: boolean | undefined
  isVirtualNumberEnabled: boolean
  smsConversations: SmsConversationSummary[]
  isSmsConversationsLoading: boolean
  smsConversationsHasError: boolean
  hasAssignedVirtualNumber: boolean
  // DM / invite search state (owned by parent for SWR)
  dmQuery: string
  onDmQueryChange: (value: string) => void
  dmCandidates: DmCandidate[]
  memberInviteQuery: string
  onMemberInviteQueryChange: (value: string) => void
  memberInviteCandidates: DmCandidate[]
  // Compose inputs
  newOrgName: string
  onNewOrgNameChange: (value: string) => void
  newChannelName: string
  onNewChannelNameChange: (value: string) => void
  // Handlers
  onSelectDm: (dm: ChatSidebarDm) => void
  onSelectChannel: (channel: ChatSidebarChannel) => void
  onSelectSmsConversation: (conversation: SmsConversationSummary) => void
  onStartDm: (participantUserId: string) => void
  onCreateOrg: () => void
  onCreateChannel: () => void
  onCreateInviteLink: () => void
  onInviteMemberToOrg: (inviteeUserId: string) => void
  onAcceptPendingInvite: (invite: ChatPendingInviteSummary) => void
  onRefresh: () => void
  // Flags / feedback
  isCreatingOrg: boolean
  isCreatingChannel: boolean
  isCreatingDm: boolean
  isCreatingInvite: boolean
  isInvitingMember: boolean
  isAcceptingInviteId: string | null
  inviteLink: string | null
  inviteFeedback: string | null
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

/**
 * Persist collapsible open/closed state for each org in localStorage so the
 * user's sidebar shape survives refreshes.
 */
const ORG_STATE_STORAGE_KEY = 'chatSidebar.orgOpenState.v1'

function readPersistedOrgState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(ORG_STATE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, boolean>
  } catch {
    return {}
  }
}

function writePersistedOrgState(state: Record<string, boolean>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ORG_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable (private mode, quota) — silently ignore.
  }
}

export function ChatSidebar({
  sidebar,
  activeRoom,
  activeOrgId,
  isSignedIn,
  isVirtualNumberEnabled,
  smsConversations,
  isSmsConversationsLoading,
  smsConversationsHasError,
  hasAssignedVirtualNumber,
  dmQuery,
  onDmQueryChange,
  dmCandidates,
  memberInviteQuery,
  onMemberInviteQueryChange,
  memberInviteCandidates,
  newOrgName,
  onNewOrgNameChange,
  newChannelName,
  onNewChannelNameChange,
  onSelectDm,
  onSelectChannel,
  onSelectSmsConversation,
  onStartDm,
  onCreateOrg,
  onCreateChannel,
  onCreateInviteLink,
  onInviteMemberToOrg,
  onAcceptPendingInvite,
  onRefresh,
  isCreatingOrg,
  isCreatingChannel,
  isCreatingDm,
  isCreatingInvite,
  isInvitingMember,
  isAcceptingInviteId,
  inviteLink,
  inviteFeedback,
}: ChatSidebarProps) {
  const { t, hasTranslation } = useI18n()

  const chatTitle = hasTranslation('chat.title') ? t('chat.title') : 'Chat'
  const chatSubtitle = hasTranslation('chat.subtitle') ? t('chat.subtitle') : 'Organizations, channels, direct messages, and threads.'
  const anonymousLabel = hasTranslation('chat.anonymous') ? t('chat.anonymous') : 'Anonymous'
  const directMessageLabel = hasTranslation('chat.directMessage') ? t('chat.directMessage') : 'Direct message'
  const pendingInvitesTitle = hasTranslation('chat.pendingInvites') ? t('chat.pendingInvites') : 'Pending invites'
  const acceptInviteLabel = hasTranslation('chat.acceptInvite') ? t('chat.acceptInvite') : 'Accept'
  const inviteFriendLabel = hasTranslation('chat.inviteFriendToOrg') ? t('chat.inviteFriendToOrg') : 'Invite a friend to this org'
  const createInviteLabel = hasTranslation('chat.createInviteLink') ? t('chat.createInviteLink') : 'Create invite link'
  const dmsLabel = hasTranslation('chat.sidebar.directMessages') ? t('chat.sidebar.directMessages') : 'Direct messages'
  const orgsLabel = hasTranslation('chat.sidebar.organizations') ? t('chat.sidebar.organizations') : 'Organizations'
  const smsGroupLabel = hasTranslation('chat.sidebar.sms') ? t('chat.sidebar.sms') : 'SMS'
  const virtualNumberLabel = hasTranslation('chat.sidebar.virtualNumber') ? t('chat.sidebar.virtualNumber') : 'Virtual number'
  const dmSearchPlaceholder = hasTranslation('chat.sidebar.searchDmPlaceholder') ? t('chat.sidebar.searchDmPlaceholder') : 'Search friends to start a DM'
  const createChannelPlaceholder = hasTranslation('chat.sidebar.createChannelPlaceholder') ? t('chat.sidebar.createChannelPlaceholder') : 'Create a channel'
  const createOrgPlaceholder = hasTranslation('chat.sidebar.createOrgPlaceholder') ? t('chat.sidebar.createOrgPlaceholder') : 'Create an organization'
  const refreshLabel = hasTranslation('chat.sidebar.refresh') ? t('chat.sidebar.refresh') : 'Refresh'
  const noOrgsLabel = hasTranslation('chat.sidebar.noOrgs') ? t('chat.sidebar.noOrgs') : 'No organizations yet'
  const noDmsLabel = hasTranslation('chat.sidebar.noDms') ? t('chat.sidebar.noDms') : 'No direct messages yet'

  // Sorted DMs: unread first, then alphabetical by display name.
  const sortedDms = useMemo(() => {
    const dms = sidebar?.dms ?? []
    return [...dms].sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount
      const nameA = getDisplayLabel(a.participant?.displayName, directMessageLabel).toLowerCase()
      const nameB = getDisplayLabel(b.participant?.displayName, directMessageLabel).toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [sidebar?.dms, directMessageLabel])

  // Sort orgs by total unread desc, then name asc. Channels similarly.
  const sortedOrgs = useMemo(() => {
    const orgs = sidebar?.orgs ?? []
    return [...orgs]
      .map((org) => ({
        ...org,
        channels: [...(org.channels ?? [])].sort((a, b) => {
          if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount
          return a.name.localeCompare(b.name)
        }),
      }))
      .sort((a, b) => {
        const unreadA = a.channels.reduce((sum, c) => sum + c.unreadCount, 0)
        const unreadB = b.channels.reduce((sum, c) => sum + c.unreadCount, 0)
        if (unreadB !== unreadA) return unreadB - unreadA
        return a.name.localeCompare(b.name)
      })
  }, [sidebar?.orgs])

  // Collapsible open/closed state per org (persisted).
  const [orgOpenState, setOrgOpenState] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setOrgOpenState(readPersistedOrgState())
  }, [])

  const isOrgOpen = useCallback(
    (orgId: string) => {
      // Default: open the currently-active org, closed otherwise unless persisted.
      if (orgId in orgOpenState) return orgOpenState[orgId]
      return activeRoom?.type === 'channel' && activeRoom.orgId === orgId
    },
    [orgOpenState, activeRoom],
  )

  const toggleOrg = useCallback((orgId: string, open: boolean) => {
    setOrgOpenState((prev) => {
      const next = { ...prev, [orgId]: open }
      writePersistedOrgState(next)
      return next
    })
  }, [])

  const totalUnread = sidebar?.totalUnreadCount ?? 0
  const pendingInvites = sidebar?.pendingInvites ?? []
  const pendingInvitesCount = sidebar?.pendingInvitesCount ?? 0

  return (
    <Sidebar
      collapsible="icon"
      side="left"
      // Override the shadcn default `fixed inset-y-0 h-svh` so the sidebar is
      // anchored to the bounded chat card (a `relative` ancestor supplied by
      // the parent SidebarProvider wrapper) instead of the viewport.
      className="absolute inset-y-0 h-full"
      mobileTitle={chatTitle}
      mobileDescription={chatSubtitle}
    >
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1">
          <Mail className="h-5 w-5 shrink-0" />
          <span className="flex-1 truncate text-base font-semibold group-data-[collapsible=icon]:hidden">
            {chatTitle}
          </span>
          <ChatUnreadBadge count={totalUnread} />
        </div>
        <form
          className="flex gap-2 group-data-[collapsible=icon]:hidden"
          onSubmit={(event) => {
            event.preventDefault()
            if (newOrgName.trim()) onCreateOrg()
          }}
        >
          <SidebarInput
            value={newOrgName}
            onChange={(event) => onNewOrgNameChange(event.target.value)}
            placeholder={createOrgPlaceholder}
            aria-label={createOrgPlaceholder}
          />
          <Button type="submit" size="sm" disabled={isCreatingOrg || !newOrgName.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      </SidebarHeader>

      <SidebarContent>
        {pendingInvites.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                {pendingInvitesTitle}
              </span>
              <ChatUnreadBadge count={pendingInvitesCount} />
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {pendingInvites.map((invite) => (
                  <SidebarMenuItem key={invite.id}>
                    <SidebarMenuButton
                      tooltip={invite.orgName}
                      aria-label={invite.orgName}
                    >
                      <Users className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">{invite.orgName}</span>
                      <span className="text-xs text-muted-foreground">/{invite.orgSlug}</span>
                    </SidebarMenuButton>
                    {isSignedIn ? (
                      <SidebarMenuAction asChild showOnHover>
                        <button
                          type="button"
                          onClick={() => onAcceptPendingInvite(invite)}
                          disabled={isAcceptingInviteId === invite.id}
                          aria-label={acceptInviteLabel}
                          title={acceptInviteLabel}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </SidebarMenuAction>
                    ) : (
                      <SidebarMenuAction asChild>
                        <SignInButton>
                          <button
                            type="button"
                            aria-label={acceptInviteLabel}
                            title={acceptInviteLabel}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </SignInButton>
                      </SidebarMenuAction>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>
            <Inbox className="mr-2 h-4 w-4" />
            {dmsLabel}
          </SidebarGroupLabel>
          <SidebarGroupContent className="space-y-2">
            <div className="px-2 group-data-[collapsible=icon]:hidden">
              <SidebarInput
                value={dmQuery}
                onChange={(event) => onDmQueryChange(event.target.value)}
                placeholder={dmSearchPlaceholder}
                aria-label={dmSearchPlaceholder}
              />
              {dmCandidates.length > 0 && (
                <div className="mt-2 space-y-1 rounded-md border border-sidebar-border p-1">
                  {dmCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      onClick={() => onStartDm(candidate.id)}
                      disabled={isCreatingDm}
                    >
                      <span className="truncate">
                        {getDisplayLabel(candidate.displayName, anonymousLabel)}
                      </span>
                      <Plus className="h-4 w-4 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SidebarMenu>
              {sortedDms.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  {noDmsLabel}
                </li>
              ) : (
                sortedDms.map((dm) => {
                  const label = getDisplayLabel(dm.participant?.displayName, directMessageLabel)
                  const isActive = activeRoom?.type === 'dm' && activeRoom.id === dm.id
                  return (
                    <SidebarMenuItem key={dm.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => onSelectDm(dm)}
                        tooltip={label}
                        aria-label={label}
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span className="truncate">{label}</span>
                      </SidebarMenuButton>
                      {dm.unreadCount > 0 && (
                        <SidebarMenuBadge>{dm.unreadCount}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>
            <Users className="mr-2 h-4 w-4" />
            {orgsLabel}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sortedOrgs.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  {noOrgsLabel}
                </li>
              ) : (
                sortedOrgs.map((org) => {
                  const orgUnread = org.channels.reduce((sum, c) => sum + c.unreadCount, 0)
                  const isAdmin = org.role === 'ADMIN' || org.role === 'SUPERUSER'
                  // Only show the create-channel / invite-member admin UI inside the
                  // currently-active org so that the shared `newChannelName` and
                  // `memberInviteQuery` state cannot be reused across multiple
                  // expanded org groups by mistake.
                  const showAdminPanel = isAdmin && activeOrgId === org.id
                  const orgOpen = isOrgOpen(org.id)
                  return (
                    <Collapsible
                      key={org.id}
                      asChild
                      open={orgOpen}
                      onOpenChange={(next) => toggleOrg(org.id, next)}
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={org.name}
                            aria-label={org.name}
                            isActive={
                              activeRoom?.type === 'channel' && activeRoom.orgId === org.id
                            }
                          >
                            <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90 group-data-[state=open]/collapsible:rotate-90" />
                            <span className="truncate">{org.name}</span>
                            {orgUnread > 0 && (
                              <Badge variant="secondary" className="ml-auto h-5 min-w-5 px-1 text-xs">
                                {orgUnread}
                              </Badge>
                            )}
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {showAdminPanel && (
                            <div className="mx-3.5 mt-1 space-y-2 border-l border-sidebar-border px-2.5 py-1">
                              <form
                                className="flex gap-2"
                                onSubmit={(event) => {
                                  event.preventDefault()
                                  if (newChannelName.trim()) onCreateChannel()
                                }}
                              >
                                <SidebarInput
                                  value={newChannelName}
                                  onChange={(event) => onNewChannelNameChange(event.target.value)}
                                  placeholder={createChannelPlaceholder}
                                  aria-label={createChannelPlaceholder}
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  disabled={isCreatingChannel || !newChannelName.trim()}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </form>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={onCreateInviteLink}
                                disabled={isCreatingInvite}
                              >
                                <Send className="h-4 w-4" />
                                {createInviteLabel}
                              </Button>
                              <div className="space-y-1">
                                <SidebarInput
                                  value={memberInviteQuery}
                                  onChange={(event) => onMemberInviteQueryChange(event.target.value)}
                                  placeholder={inviteFriendLabel}
                                  aria-label={inviteFriendLabel}
                                />
                                {memberInviteCandidates.length > 0 && (
                                  <div className="space-y-1 rounded-md border border-sidebar-border p-1">
                                    {memberInviteCandidates.map((candidate) => (
                                      <button
                                        key={candidate.id}
                                        type="button"
                                        className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                        onClick={() => onInviteMemberToOrg(candidate.id)}
                                        disabled={isInvitingMember}
                                      >
                                        <span className="truncate">
                                          {getDisplayLabel(candidate.displayName, anonymousLabel)}
                                        </span>
                                        <UserPlus className="h-4 w-4 shrink-0" />
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <SidebarMenuSub>
                            {org.channels.map((channel) => {
                              const isActive =
                                activeRoom?.type === 'channel' && activeRoom.id === channel.id
                              return (
                                <SidebarMenuSubItem key={channel.id}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isActive}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => onSelectChannel(channel)}
                                      className="flex w-full items-center gap-2"
                                      aria-label={channel.name}
                                    >
                                      <Hash className="h-4 w-4 text-muted-foreground" />
                                      <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                                      {channel.unreadCount > 0 && (
                                        <Badge
                                          variant="secondary"
                                          className="h-5 min-w-5 px-1 text-xs"
                                        >
                                          {channel.unreadCount}
                                        </Badge>
                                      )}
                                    </button>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  )
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isVirtualNumberEnabled && (
          <>
            <SidebarSeparator />
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>
                <MessageSquare className="mr-2 h-4 w-4" />
                {smsGroupLabel}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SmsSidebarCard
                  conversations={smsConversations}
                  isLoading={isSmsConversationsLoading}
                  hasError={smsConversationsHasError}
                  hasAssignedNumber={hasAssignedVirtualNumber}
                  onSelectConversation={onSelectSmsConversation}
                />
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>
                <Phone className="mr-2 h-4 w-4" />
                {virtualNumberLabel}
              </SidebarGroupLabel>
              <SidebarGroupContent className="space-y-2">
                <VirtualNumberGate />
                <VirtualNumberPicker />
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        {(inviteLink || inviteFeedback) && (
          <div className="space-y-1 rounded-md border border-sidebar-border p-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            {inviteLink && <p className="break-all">{inviteLink}</p>}
            {inviteFeedback && <p>{inviteFeedback}</p>}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="justify-start"
          aria-label={refreshLabel}
          title={refreshLabel}
        >
          <RefreshCcw className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">{refreshLabel}</span>
        </Button>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
