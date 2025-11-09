'use client'
import { useState, useContext, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { User, UserMinus, Loader2, FileText } from "lucide-react"
import { OptionsButton, OptionsMenuItem } from "@/components/OptionsButton"
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

interface PublicTemplate {
  id: string
  name: string | null
  role: string | null
  visibility: string
  createdAt: string
  updatedAt: string
  owners: string[]
  user: {
    id: string
    profile: {
      userName: string | null
      profilePicture: string | null
      firstName: string | null
      lastName: string | null
    } | null
  } | null
}

type ActivityItem = {
  id: string
  type: 'note' | 'template'
  createdAt: string
  data: PublicNote | PublicTemplate
}

export const BeView = () => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t } = useI18n()
  const router = useRouter()
  
  const [friends, setFriends] = useState<Friend[]>([])
  const [publicNotes, setPublicNotes] = useState<PublicNote[]>([])
  const [publicTemplates, setPublicTemplates] = useState<PublicTemplate[]>([])
  const [notesPage, setNotesPage] = useState(1)
  const [templatesPage, setTemplatesPage] = useState(1)
  const [hasMoreNotes, setHasMoreNotes] = useState(false)
  const [hasMoreTemplates, setHasMoreTemplates] = useState(false)
  const [isLoadingMoreNotes, setIsLoadingMoreNotes] = useState(false)
  const [isLoadingMoreTemplates, setIsLoadingMoreTemplates] = useState(false)

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

  // Fetch public templates
  const fetchPublicTemplates = async (page: number = 1, append: boolean = false) => {
    try {
      const response = await fetch(`/api/v1/templates/public?page=${page}&limit=100`)
      if (response.ok) {
        const data = await response.json()
        if (append) {
          setPublicTemplates(prev => [...prev, ...(data.templates || [])])
        } else {
          setPublicTemplates(data.templates || [])
        }
        setHasMoreTemplates(data.hasMore || false)
      }
    } catch (error) {
      console.error('Error fetching public templates:', error)
    }
  }

  // Refresh friends when data changes
  useEffect(() => {
    if (data?.friends) {
      setFriends(data.friends)
    }
  }, [data])

  // Fetch public notes and templates on mount
  useEffect(() => {
    fetchPublicNotes(1)
    fetchPublicTemplates(1)
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

  const handleLoadMoreTemplates = async () => {
    setIsLoadingMoreTemplates(true)
    const nextPage = templatesPage + 1
    await fetchPublicTemplates(nextPage, true)
    setTemplatesPage(nextPage)
    setIsLoadingMoreTemplates(false)
  }

  // Combine notes and templates into activity feed, sorted by creation date
  const activityItems = useMemo(() => {
    const items: ActivityItem[] = [
      ...publicNotes.map(note => ({
        id: `note-${note.id}`,
        type: 'note' as const,
        createdAt: note.createdAt,
        data: note
      })),
      ...publicTemplates.map(template => ({
        id: `template-${template.id}`,
        type: 'template' as const,
        createdAt: template.createdAt,
        data: template
      }))
    ]
    // Sort by creation date, most recent first
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [publicNotes, publicTemplates])

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

  const getTemplateUserName = (template: PublicTemplate) => {
    return template.user?.profile?.userName || null
  }

  const getTemplateUserProfilePicture = (template: PublicTemplate) => {
    return template.user?.profile?.profilePicture || '/images/default-avatar.png'
  }

  const getTemplateUserDisplayName = (template: PublicTemplate) => {
    if (template.user?.profile) {
      const { firstName, lastName, userName } = template.user.profile
      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      return fullName || userName || 'Anonymous User'
    }
    return 'Anonymous User'
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

  const renderActivityFeed = () => {
    if (activityItems.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-12">
          <p>{t('socialView.noActivity')}</p>
        </div>
      )
    }

    return (
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activityItems.map((item) => {
            if (item.type === 'note') {
              const note = item.data as PublicNote
              const userName = getNoteUserName(note)
              const profileUrl = userName ? `/profile/${userName}` : '#'
              
              return (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
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
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('socialView.justSharedNote')}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {note.content}
                    </p>
                  </CardContent>
                </Card>
              )
            } else {
              const template = item.data as PublicTemplate
              const userName = getTemplateUserName(template)
              const profileUrl = userName ? `/profile/${userName}` : '#'
              
              return (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-1">
                    <div className="flex items-center gap-2 mb-3">
                      <img
                        src={getTemplateUserProfilePicture(template)}
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
                        {getTimeAgo(template.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('socialView.justSharedTemplate')}
                    </p>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        {template.name || template.role || 'Untitled Template'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            }
          })}
        </div>
        {(hasMoreNotes || hasMoreTemplates) && (
          <div className="flex justify-center mt-6">
            <Button 
              onClick={() => {
                if (hasMoreNotes) handleLoadMoreNotes()
                if (hasMoreTemplates) handleLoadMoreTemplates()
              }}
              disabled={isLoadingMoreNotes || isLoadingMoreTemplates}
              variant="outline"
            >
              {(isLoadingMoreNotes || isLoadingMoreTemplates) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('socialView.loadMore')
              )}
            </Button>
          </div>
        )}
      </div>
    )
  }

  const renderFriends = () => {
    if (friends.length === 0) {
      return (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <User className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('socialView.noFriendsYet')}</h3>
              <p className="text-muted-foreground mb-4">
                {t('socialView.startBuildingNetwork')}
              </p>
              <Button asChild>
                <Link href="/app/dashboard">
                  {t('socialView.goToDashboard')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {friends.map((friend) => {
          const userName = friend.profile?.userName
          const profileUrl = getProfileUrl(friend)
          
          const friendOptionsItems: OptionsMenuItem[] = [
            {
              label: t('socialView.viewProfile'),
              onClick: () => {
                router.push(profileUrl)
              },
              icon: null,
            },
            {
              label: t('socialView.unfriend'),
              onClick: () => handleUnfriend(friend.id),
              icon: <UserMinus className="w-4 h-4" />,
              separator: true,
            },
          ]

          return (
            <Badge
              key={friend.id}
              variant="outline"
              className="flex items-center gap-2 px-2 py-1.5 h-auto bg-transparent border-border/50 hover:border-border transition-colors"
            >
              <img
                src={getProfilePicture(friend)}
                alt="Profile"
                className="w-6 h-6 rounded-full object-cover shrink-0"
                onError={(e) => {
                  e.currentTarget.src = '/images/default-avatar.png'
                }}
              />
              {userName ? (
                <Link
                  href={profileUrl}
                  className="text-xs font-medium text-foreground hover:text-primary transition-colors truncate flex-1 min-w-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  @{userName}
                </Link>
              ) : (
                <span className="text-xs font-medium text-muted-foreground truncate flex-1 min-w-0">
                  {getDisplayName(friend)}
                </span>
              )}
              <OptionsButton
                items={friendOptionsItems}
                statusColor="transparent"
                iconColor="var(--muted-foreground)"
                iconFilled={false}
                align="end"
                className="shrink-0"
              />
            </Badge>
          )
        })}
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] m-auto p-4">
      <Card className="mb-6">
        <CardContent className="pt-6">
          <Tabs defaultValue="activity" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger 
                value="activity"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {t('socialView.activity')}
              </TabsTrigger>
              <TabsTrigger 
                value="friends"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {t('socialView.friends')}
              </TabsTrigger>
              <TabsTrigger 
                value="events"
                disabled
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {t('socialView.events')}
              </TabsTrigger>
              <TabsTrigger 
                value="spaces"
                disabled
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {t('socialView.spaces')}
              </TabsTrigger>
              <TabsTrigger 
                value="organizations"
                disabled
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {t('socialView.organizations')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="mt-4">
              {renderActivityFeed()}
            </TabsContent>

            <TabsContent value="friends" className="mt-4">
              {renderFriends()}
            </TabsContent>

            <TabsContent value="events" className="mt-4">
              <div className="text-center text-muted-foreground py-12">
                <p>{t('socialView.events')} - Coming soon</p>
              </div>
            </TabsContent>

            <TabsContent value="spaces" className="mt-4">
              <div className="text-center text-muted-foreground py-12">
                <p>{t('socialView.spaces')} - Coming soon</p>
              </div>
            </TabsContent>

            <TabsContent value="organizations" className="mt-4">
              <div className="text-center text-muted-foreground py-12">
                <p>{t('socialView.organizations')} - Coming soon</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 