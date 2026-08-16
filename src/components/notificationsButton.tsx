'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu'
import { Bell, Loader2, UserPlus, Check, X, Briefcase, ListPlus } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'

interface FriendRequest {
  id: string
  userId: string
  profile: {
    userName?: string
    firstName?: string
    lastName?: string
    profilePicture?: string
  } | null
}

interface NotificationItem {
  id: string
  type: string
  actorId: string | null
  actorName: string | null
  resourceId: string | null
  message: string | null
  readAt: string | null
  createdAt: string
}

interface NotificationsResponse {
  notifications: NotificationItem[]
  unreadCount: number
}

interface NotificationsButtonProps {
  className?: string
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

// Fallback localized text per notification type (used until the locale files
// define `notifications.types.*`). Keys reported to the orchestrator:
//   notifications.types.JOB_REQUESTED / JOB_ACCEPTED / JOB_REJECTED / LIST_INVITE
const NOTIFICATION_TYPE_DEFAULTS: Record<string, string> = {
  JOB_REQUESTED: '{{actorName}} requested to work on one of your tasks',
  JOB_ACCEPTED: '{{actorName}} approved your work request',
  JOB_REJECTED: '{{actorName}} declined your work request',
  LIST_INVITE: '{{actorName}} added you to a list',
}

// Tiny inline relative-time helper (no extra deps)
function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateString).toLocaleDateString()
}

export function NotificationsButton({ className, size = 'default' }: NotificationsButtonProps = {}) {
  const { t, hasTranslation } = useI18n()
  const router = useRouter()
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Fetch notifications on mount + every 60s (read state refreshes on poll)
  const { data: notificationsData, mutate: mutateNotifications } = useSWR<NotificationsResponse>(
    '/api/v1/notifications',
    jsonFetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  )

  // Fetch friend requests
  const fetchFriendRequests = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/friend-requests')
      if (response.ok) {
        const data = await response.json()
        setFriendRequests(data.friendRequests || [])
      }
    } catch (error) {
      console.error('Error fetching friend requests:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Handle friend request action (accept/decline)
  const handleFriendRequestAction = async (requesterId: string, action: 'accept' | 'decline') => {
    setActionLoading(requesterId)
    try {
      const response = await fetch('/api/v1/friend-request/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, requesterId }),
      })

      if (response.ok) {
        // Remove the request from the list
        setFriendRequests(prev => prev.filter(req => req.id !== requesterId))
      }
    } catch (error) {
      console.error('Error handling friend request:', error)
    } finally {
      setActionLoading(null)
    }
  }

  // Fetch friend requests when component mounts
  useEffect(() => {
    fetchFriendRequests()
  }, [fetchFriendRequests])

  // Refresh friend requests when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchFriendRequests()
    }
  }, [isOpen, fetchFriendRequests])

  const notificationCount = friendRequests.length + (notificationsData?.unreadCount || 0)

  // Get display name for a friend request
  const getDisplayName = (request: FriendRequest) => {
    if (request.profile?.userName) return `@${request.profile.userName}`
    if (request.profile?.firstName || request.profile?.lastName) {
      return [request.profile.firstName, request.profile.lastName].filter(Boolean).join(' ')
    }
    return t('common.anonymousUser') || 'Anonymous User'
  }

  // Localized text for a notification type, falling back to the defaults above
  const getNotificationText = (type: string, actorName: string | null) => {
    const actorLabel = actorName ? `@${actorName}` : t('common.anonymousUser') || 'Anonymous User'
    const key = `notifications.types.${type}`
    if (hasTranslation(key)) {
      return t(key, {
        actorName: actorLabel,
        defaultValue: NOTIFICATION_TYPE_DEFAULTS[type] || '',
      })
    }
    return (NOTIFICATION_TYPE_DEFAULTS[type] || '').replaceAll('{{actorName}}', actorLabel)
  }

  // Icon per notification type
  const getNotificationIcon = (type: string) => {
    if (type === 'LIST_INVITE') {
      return <ListPlus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    }
    return <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  }

  // Mark a notification read, then navigate to where the resource lives
  const handleNotificationClick = async (notification: NotificationItem) => {
    try {
      await fetch('/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: [notification.id] }),
      })
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }

    // Optimistic local update so the badge/read state reflects immediately
    if (notificationsData) {
      mutateNotifications(
        {
          ...notificationsData,
          unreadCount: Math.max(0, notificationsData.unreadCount - (notification.readAt ? 0 : 1)),
          notifications: notificationsData.notifications.map((n) =>
            n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n
          ),
        },
        false // Don't revalidate; next 60s poll refreshes
      )
    }

    // Jobs and list invites both live in the Do view
    router.push('/app/do')
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={`relative ${className || ''}`}>
          <Bell className="w-4 h-4" />
          {notificationCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {notificationCount > 9 ? '9+' : notificationCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 z-[1002]">
        <div className="p-2">
          <h3 className="font-semibold text-sm">{t('common.notifications') || 'Notifications'}</h3>
          <div className="mt-1 max-h-80 overflow-y-auto space-y-3">
            {/* Friend requests section */}
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <section>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {t('common.friendRequest') || 'Friend requests'}
                </p>
                {friendRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">
                    {t('common.noFriendRequests') || 'No friend requests'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {friendRequests.map((request) => (
                      <div key={request.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted">
                        <UserPlus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {getDisplayName(request)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t('common.friendRequest') || 'Friend request'}
                          </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleFriendRequestAction(request.id, 'accept')
                            }}
                            disabled={actionLoading === request.id}
                            aria-label={t('common.accept') || 'Accept'}
                          >
                            {actionLoading === request.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4 text-green-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleFriendRequestAction(request.id, 'decline')
                            }}
                            disabled={actionLoading === request.id}
                            aria-label={t('common.decline') || 'Decline'}
                          >
                            <X className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Notifications section */}
            <section>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {t('common.notifications') || 'Notifications'}
              </p>
              {!notificationsData || notificationsData.notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">
                  {t('common.noNotifications') || 'No notifications'}
                </p>
              ) : (
                <div className="space-y-1">
                  {notificationsData.notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-muted text-left"
                    >
                      <span className="mt-0.5 flex-shrink-0">
                        {getNotificationIcon(notification.type)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm truncate">
                          {getNotificationText(notification.type, notification.actorName)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </span>
                      {!notification.readAt && (
                        <span className="w-2 h-2 rounded-full bg-destructive flex-shrink-0 mt-1.5" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
