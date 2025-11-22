'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdownMenu'
import { Users, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/contexts/i18n'

interface FriendRequest {
  id: string
  userId: string
  profile: {
    firstName?: string
    lastName?: string
    userName?: string
    profilePicture?: string
    bio?: string
  } | null
}

interface FriendRequestsButtonProps {
  className?: string
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function FriendRequestsButton({ className, size = 'default' }: FriendRequestsButtonProps = {}) {
  const { t } = useI18n()
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  // Fetch friend requests
  const fetchFriendRequests = async () => {
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
  }

  // Handle friend request action
  const handleFriendRequestAction = async (action: 'accept' | 'decline', requesterId: string) => {
    try {
      const response = await fetch('/api/v1/friend-request/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, requesterId }),
      })

      const data = await response.json()

      if (response.ok) {
        // Remove the request from the list
        setFriendRequests(prev => prev.filter(req => req.id !== requesterId))
        toast.success(data.message || t('toast.friendRequestProcessed'))
      } else {
        toast.error(data.error || t('toast.friendRequestProcessFailed'))
      }
    } catch (error) {
      console.error('Error handling friend request:', error)
      toast.error(t('toast.friendRequestProcessFailed'))
    }
  }

  // Fetch friend requests when component mounts
  useEffect(() => {
    fetchFriendRequests()
  }, [])

  const getDisplayName = (request: FriendRequest) => {
    if (request.profile) {
      const { firstName, lastName, userName } = request.profile
      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      // Display name logic: prefer fullName, then userName, then fallback
      return fullName || userName || t('common.anonymousUser')
    }
    return t('common.anonymousUser')
  }

  const getProfilePicture = (request: FriendRequest) => {
    return request.profile?.profilePicture || '/images/default-avatar.webp'
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={`relative ${className || ''}`}>
          <Users className="w-4 h-4" />
          {friendRequests.length > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {friendRequests.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 z-[1002]">
        <div className="p-2">
          <h3 className="font-semibold text-sm">Friend Requests</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : friendRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No friend requests
            </p>
          ) : (
            <div className="space-y-2 mt-2 max-h-60 overflow-y-auto">
              {friendRequests.map((request) => (
                <div key={request.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted">
                  <img
                    src={getProfilePicture(request)}
                    alt="Profile"
                    className="w-8 h-8 rounded-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = '/images/default-avatar.webp'
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {getDisplayName(request)}
                    </p>
                    {request.profile?.bio && (
                      <p className="text-xs text-muted-foreground truncate">
                        {request.profile.bio}
                      </p>
                    )}
                  </div>
                  <div className="flex space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0"
                      onClick={() => handleFriendRequestAction('accept', request.id)}
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0"
                      onClick={() => handleFriendRequestAction('decline', request.id)}
                    >
                      <X className="w-3 h-3" />
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
