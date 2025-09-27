'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus, Check, Loader2, Heart, Users } from 'lucide-react'
import { toast } from 'sonner'

interface AddFriendButtonProps {
  targetUserId: string
  className?: string
}

interface FriendshipStatus {
  isFriend: boolean
  isCloseFriend: boolean
  hasPendingRequest: boolean
  friendshipStatus: 'close_friend' | 'friend' | 'pending' | 'none'
}

export function AddFriendButton({ targetUserId, className }: AddFriendButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus | null>(null)
  const [isCheckingStatus, setIsCheckingStatus] = useState(true)

  // Check friendship status on component mount
  useEffect(() => {
    const checkFriendshipStatus = async () => {
      try {
        const response = await fetch(`/api/v1/friendship-status?targetUserId=${targetUserId}`)
        if (response.ok) {
          const data = await response.json()
          setFriendshipStatus(data)
        }
      } catch (error) {
        console.error('Error checking friendship status:', error)
      } finally {
        setIsCheckingStatus(false)
      }
    }

    checkFriendshipStatus()
  }, [targetUserId])

  const handleAddFriend = async () => {
    if (isLoading || isSent) return

    setIsLoading(true)
    
    try {
      const response = await fetch('/api/v1/friend-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetUserId }),
      })

      const data = await response.json()

      if (response.ok) {
        setIsSent(true)
        toast.success('Friend request sent!')
      } else {
        toast.error(data.error || 'Failed to send friend request')
      }
    } catch (error) {
      console.error('Error sending friend request:', error)
      toast.error('Failed to send friend request')
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading state while checking friendship status
  if (isCheckingStatus) {
    return (
      <Button disabled className={className}>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Checking...
      </Button>
    )
  }

  // Show different states based on friendship status
  if (friendshipStatus?.isCloseFriend) {
    return (
      <Button disabled className={className} variant="outline">
        <Heart className="w-4 h-4 mr-2" />
        Close Friend
      </Button>
    )
  }

  if (friendshipStatus?.isFriend) {
    return (
      <Button disabled className={className} variant="outline">
        <Users className="w-4 h-4 mr-2" />
        Friends
      </Button>
    )
  }

  if (friendshipStatus?.hasPendingRequest) {
    return (
      <Button disabled className={className}>
        <Check className="w-4 h-4 mr-2" />
        Request Sent
      </Button>
    )
  }

  if (isSent) {
    return (
      <Button disabled className={className}>
        <Check className="w-4 h-4 mr-2" />
        Request Sent
      </Button>
    )
  }

  return (
    <Button 
      onClick={handleAddFriend}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <UserPlus className="w-4 h-4 mr-2" />
      )}
      {isLoading ? 'Sending...' : 'Add Friend'}
    </Button>
  )
}
