'use client'
import { useState, useContext, useEffect } from 'react'
import useSWR from 'swr'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { User, UserMinus, Loader2 } from "lucide-react"
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

interface PublicNote {
  id: string
  content: string
  visibility: string
  createdAt: string
  date: string | null
  user: {
    id: string
    profile: {
      userName: string | null
      profilePicture: string | null
      firstName: string | null
      lastName: string | null
    } | null
  }
}

export const SocialView = () => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t } = useI18n()
  
  const [friends, setFriends] = useState<Friend[]>([])
  const [publicNotes, setPublicNotes] = useState<PublicNote[]>([])
  const [notesPage, setNotesPage] = useState(1)
  const [hasMoreNotes, setHasMoreNotes] = useState(false)
  const [isLoadingMoreNotes, setIsLoadingMoreNotes] = useState(false)

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

  // Fetch public notes
  const fetchPublicNotes = async (page: number = 1, append: boolean = false) => {
    try {
      const response = await fetch(`/api/v1/notes/public?page=${page}&limit=100`)
      if (response.ok) {
        const data = await response.json()
        if (append) {
          setPublicNotes(prev => [...prev, ...(data.notes || [])])
        } else {
          setPublicNotes(data.notes || [])
        }
        setHasMoreNotes(data.hasMore || false)
      }
    } catch (error) {
      console.error('Error fetching public notes:', error)
    }
  }

  // Refresh friends when data changes
  useEffect(() => {
    if (data?.friends) {
      setFriends(data.friends)
    }
  }, [data])

  // Fetch public notes on mount
  useEffect(() => {
    fetchPublicNotes(1)
  }, [])

  const getDisplayName = (friend: Friend) => {
    if (friend.profile) {
      const { firstName, lastName, userName } = friend.profile
      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      // Display name logic: prefer fullName, then userName, then fallback
      return fullName || userName || 'Anonymous User'
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
        toast.success(t('toast.friendRemovedSuccess'))
      } else {
        toast.error(data.error || t('toast.friendRemoveFailed'))
      }
    } catch (error) {
      console.error('Error removing friend:', error)
      toast.error(t('toast.friendRemoveFailed'))
    }
  }

  const handleLoadMoreNotes = async () => {
    setIsLoadingMoreNotes(true)
    const nextPage = notesPage + 1
    await fetchPublicNotes(nextPage, true)
    setNotesPage(nextPage)
    setIsLoadingMoreNotes(false)
  }

  const getNoteUserDisplayName = (note: PublicNote) => {
    if (note.user.profile) {
      const { firstName, lastName, userName } = note.user.profile
      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      return fullName || userName || 'Anonymous User'
    }
    return 'Anonymous User'
  }

  const getNoteUserProfilePicture = (note: PublicNote) => {
    return note.user.profile?.profilePicture || '/images/default-avatar.png'
  }

  const getNoteUserName = (note: PublicNote) => {
    return note.user.profile?.userName || null
  }

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`
    return date.toLocaleDateString()
  }

  // Use enhanced loading state to prevent flashing
  const isDataLoading = useEnhancedLoadingState(isLoading, session)

  if (isDataLoading) {
    return <SettingsSkeleton />
  }

  const renderPublicNotes = () => {
    if (publicNotes.length === 0) return null

    return (
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {publicNotes.map((note) => {
            const userName = getNoteUserName(note)
            const profileUrl = userName ? `/profile/${userName}` : '#'
            
            return (
              <Card key={note.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-1">
                  <div className="flex items-center gap-2 mb-3">
                    <img
                      src={getNoteUserProfilePicture(note)}
                      alt="Profile"
                      className="w-8 h-8 rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default-avatar.png'
                      }}
                    />
                    {userName ? (
                      <Link 
                        href={profileUrl}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        @{userName}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-muted-foreground">
                        @anonymous
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {getTimeAgo(note.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {note.content}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
        {hasMoreNotes && (
          <div className="flex justify-center mt-6">
            <Button 
              onClick={handleLoadMoreNotes}
              disabled={isLoadingMoreNotes}
              variant="outline"
            >
              {isLoadingMoreNotes ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load More'
              )}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] m-auto p-4">
      {friends.length === 0 ? (
        <>
          {publicNotes.length === 0 ? (
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
                      Go to Dashboard
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            renderPublicNotes()
          )}
        </>
      ) : (
        <>
          {renderPublicNotes()}
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
        </>
      )}
    </div>
  )
} 