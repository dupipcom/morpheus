'use client'
import { useState, useContext, useEffect } from 'react'
import useSWR from 'swr'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Users, User, UserMinus } from "lucide-react"
import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { useEnhancedLoadingState } from "@/lib/userUtils"
import { SettingsSkeleton } from "@/components/ui/skeleton-loader"
import { toast } from 'sonner'
import Link from 'next/link'

interface Friend {
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

export const SocialView = () => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t } = useI18n()
  
  const [friends, setFriends] = useState<Friend[]>([])

  const { data, mutate, error, isLoading } = useSWR(
    session?.user ? `/api/v1/friends` : null,
    async () => {
      const response = await fetch('/api/v1/friends')
      if (response.ok) {
        const data = await response.json()
        setFriends(data.friends || [])
        return data
      }
      return { friends: [] }
    }
  )

  // Refresh friends when data changes
  useEffect(() => {
    if (data?.friends) {
      setFriends(data.friends)
    }
  }, [data])

  const getDisplayName = (friend: Friend) => {
    if (friend.profile) {
      const { firstName, lastName, userName } = friend.profile
      if (firstName && lastName) {
        return `${firstName} ${lastName}`
      }
      if (userName) {
        return `@${userName}`
      }
    }
    return 'Anonymous User'
  }

  const getProfilePicture = (friend: Friend) => {
    return friend.profile?.profilePicture || '/images/default-avatar.png'
  }

  const getProfileUrl = (friend: Friend) => {
    if (friend.profile?.userName) {
      return `/profile/${friend.profile.userName}`
    }
    return `#`
  }

  const handleUnfriend = async (friendId: string) => {
    try {
      const response = await fetch('/api/v1/friends/unfriend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendId }),
      })

      const data = await response.json()
      
      if (response.ok) {
        // Remove the friend from the list
        setFriends(prev => prev.filter(friend => friend.id !== friendId))
        toast.success('Friend removed successfully')
      } else {
        toast.error(data.error || 'Failed to remove friend')
      }
    } catch (error) {
      console.error('Error removing friend:', error)
      toast.error('Failed to remove friend')
    }
  }

  // Use enhanced loading state to prevent flashing
  const isDataLoading = useEnhancedLoadingState(isLoading, session)

  if (isDataLoading) {
    return <SettingsSkeleton />
  }

  return (
    <div className="max-w-[1200px] m-auto p-4">
      <div className="flex items-center gap-3 mb-8">
        <Users className="w-8 h-8 text-primary" />
        <div>
          <h2 className="text-2xl font-bold">My Friends</h2>
          <p className="text-muted-foreground">
            {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
          </p>
        </div>
      </div>

      {friends.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <User className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No friends yet</h3>
              <p className="text-muted-foreground mb-4">
                Start building your network by adding friends!
              </p>
              <Button asChild>
                <Link href="/app/dashboard">
                  Explore Profiles
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {friends.map((friend) => (
            <Card key={friend.id} className="group hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="relative">
                    <img
                      src={getProfilePicture(friend)}
                      alt="Profile"
                      className="w-20 h-20 rounded-full object-cover border-4 border-background shadow-lg"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default-avatar.png'
                      }}
                    />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 border-2 border-background rounded-full"></div>
        </div>
                  
                  <div className="space-y-1">
                    <h3 className="font-semibold text-lg">
                      {getDisplayName(friend)}
                    </h3>
                    {friend.profile?.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {friend.profile.bio}
                      </p>
                    )}
      </div>

                  <div className="flex gap-2 w-full">
                    <Button 
                      asChild 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                    >
                      <Link href={getProfileUrl(friend)}>
                        View Profile
                      </Link>
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      className="flex-1"
                      onClick={() => handleUnfriend(friend.id)}
                    >
                      <UserMinus className="w-4 h-4 mr-2" />
                      Unfriend
                    </Button>
                  </div>
            </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
} 