'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu'
import { Bell, Loader2, UserPlus, Check, X } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'

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

interface NotificationsButtonProps {
  className?: string
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function NotificationsButton({ className, size = 'default' }: NotificationsButtonProps = {}) {
  const { t } = useI18n()
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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

  const notificationCount = friendRequests.length

  // Get display name for a friend request
  const getDisplayName = (request: FriendRequest) => {
    if (request.profile?.userName) return `@${request.profile.userName}`
    if (request.profile?.firstName || request.profile?.lastName) {
      return [request.profile.firstName, request.profile.lastName].filter(Boolean).join(' ')
    }
    return t('common.anonymousUser') || 'Anonymous User'
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
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : friendRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('common.noNotifications') || 'No notifications'}
            </p>
          ) : (
            <div className="space-y-2 mt-2 max-h-60 overflow-y-auto">
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
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

