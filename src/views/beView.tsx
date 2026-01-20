'use client'
import { useState, useContext, useEffect, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { useRouter, usePathname } from 'next/navigation'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { User, UserMinus, Loader2 } from "lucide-react"
import ActivityCard, { ActivityItem } from "@/components/activityCard"
import { OptionsButton, OptionsMenuItem } from "@/components/optionsButton"
import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { useEnhancedLoadingState } from "@/lib/utils/userUtils"
import { SettingsSkeleton } from "@/components/ui/skeletonLoader"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from 'sonner'
import Link from 'next/link'
import { useNotesRefresh } from "@/lib/contexts/notesRefresh"

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
  _count?: {
    comments?: number
    likes?: number
  }
  comments?: Array<{
    id: string
    content: string
    createdAt: string
    user: {
      id: string
      profile?: {
        userName?: string | null
        profilePicture?: string | null
        firstName?: string | null
        lastName?: string | null
      } | null
    }
    _count?: {
      likes: number
    }
  }>
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
  _count?: {
    comments?: number
    likes?: number
  }
  comments?: Array<{
    id: string
    content: string
    createdAt: string
    user: {
      id: string
      profile?: {
        userName?: string | null
        profilePicture?: string | null
        firstName?: string | null
        lastName?: string | null
      } | null
    }
    _count?: {
      likes: number
    }
  }>
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

interface BeViewProps {
  filterProfileId?: string
  filterNoteId?: string
  filterListId?: string
  filterTemplateId?: string
  defaultTab?: 'activity' | 'friends' | 'events' | 'spaces' | 'organizations'
}

export const BeView = ({ 
  filterProfileId,
  filterNoteId,
  filterListId,
  filterTemplateId,
  defaultTab = 'activity'
}: BeViewProps) => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const { registerMutate, unregisterMutate } = useNotesRefresh()
  
  // Determine initial tab from URL path or defaultTab prop
  const getInitialTab = () => {
    if (pathname?.includes('/be/activity')) return 'activity'
    if (pathname?.includes('/be/friends')) return 'friends'
    if (pathname?.includes('/be/events')) return 'events'
    if (pathname?.includes('/be/spaces')) return 'spaces'
    if (pathname?.includes('/be/organizations')) return 'organizations'
    // If on base /be route, use defaultTab prop
    if (pathname?.endsWith('/be') || pathname?.endsWith('/be/')) return defaultTab
    return defaultTab
  }
  
  const [activeTab, setActiveTab] = useState<'activity' | 'friends' | 'events' | 'spaces' | 'organizations'>(getInitialTab())
  
  // Update activeTab when pathname changes
  useEffect(() => {
    const newTab = getInitialTab()
    setActiveTab(newTab)
  }, [pathname, defaultTab])
  
  // Handle tab change and update URL
  const handleTabChange = (value: string) => {
    const tab = value as 'activity' | 'friends' | 'events' | 'spaces' | 'organizations'
    setActiveTab(tab)
    
    // Update URL to match the selected tab
    // Extract locale and base path
    const pathParts = pathname?.split('/') || []
    const localeIndex = pathParts.findIndex(p => p === 'app')
    const basePath = localeIndex >= 0 
      ? pathParts.slice(0, localeIndex + 1).join('/')
      : ''
    const newPath = `${basePath}/be/${tab}`
    router.push(newPath)
  }
  
  const [friends, setFriends] = useState<Friend[]>([])
  const [publicNotes, setPublicNotes] = useState<PublicNote[]>([])
  const [publicTemplates, setPublicTemplates] = useState<PublicTemplate[]>([])
  const [notesPage, setNotesPage] = useState(1)
  const [templatesPage, setTemplatesPage] = useState(1)
  const [hasMoreNotes, setHasMoreNotes] = useState(false)
  const [hasMoreTemplates, setHasMoreTemplates] = useState(false)
  const [isLoadingMoreNotes, setIsLoadingMoreNotes] = useState(false)
  const [isLoadingMoreTemplates, setIsLoadingMoreTemplates] = useState(false)
  const [isLoadingNotes, setIsLoadingNotes] = useState(false)
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)

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
    if (!append) {
      setIsLoadingNotes(true)
    }
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '100'
      })
      if (filterNoteId) params.append('noteId', filterNoteId)
      if (filterProfileId) params.append('profileId', filterProfileId)
      
      const response = await fetch(`/api/v1/notes/public?${params.toString()}`)
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
    } finally {
      if (!append) {
        setIsLoadingNotes(false)
      }
    }
  }

  // Fetch public templates
  const fetchPublicTemplates = async (page: number = 1, append: boolean = false) => {
    if (!append) {
      setIsLoadingTemplates(true)
    }
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '100'
      })
      if (filterTemplateId) params.append('templateId', filterTemplateId)
      if (filterListId) params.append('listId', filterListId)
      if (filterProfileId) params.append('profileId', filterProfileId)
      
      const response = await fetch(`/api/v1/templates/public?${params.toString()}`)
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
    } finally {
      if (!append) {
        setIsLoadingTemplates(false)
      }
    }
  }

  // Refresh friends when data changes
  useEffect(() => {
    if (data?.friends) {
      setFriends(data.friends)
    }
  }, [data])

  // Refresh function for activity feed
  const refreshActivityFeed = useCallback(() => {
    fetchPublicNotes(1)
    fetchPublicTemplates(1)
    setNotesPage(1)
    setTemplatesPage(1)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Register refresh function with NotesRefreshContext
  useEffect(() => {
    registerMutate('beView-activity', refreshActivityFeed)
    return () => {
      unregisterMutate('beView-activity')
    }
  }, [registerMutate, unregisterMutate, refreshActivityFeed])

  // Fetch public notes and templates on mount and when filter params change
  useEffect(() => {
    fetchPublicNotes(1)
    fetchPublicTemplates(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterNoteId, filterProfileId, filterListId, filterTemplateId])

  const getDisplayName = (friend: Friend) => {
    if (friend.profile) {
      const { firstName, lastName, userName } = friend.profile
      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      // Display name logic: prefer fullName, then userName, then fallback
      return fullName || userName || t('common.anonymousUser')
    }
    return t('common.anonymousUser')
  }

  const getProfilePicture = (friend: Friend) => {
    return friend.profile?.profilePicture || '/images/default-avatar.webp'
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
  // Items matching filter parameters are prioritized (shown first)
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
    
    // Sort items: matching filters first, then by creation date (most recent first)
    return items.sort((a, b) => {
      const aNote = a.type === 'note' ? (a.data as PublicNote) : null
      const aTemplate = a.type === 'template' ? (a.data as PublicTemplate) : null
      const bNote = b.type === 'note' ? (b.data as PublicNote) : null
      const bTemplate = b.type === 'template' ? (b.data as PublicTemplate) : null
      
      // Check if item a matches any filter
      const aMatchesFilter = 
        (filterProfileId && (aNote?.user?.id === filterProfileId || aTemplate?.user?.id === filterProfileId)) ||
        (filterNoteId && aNote?.id === filterNoteId) ||
        (filterTemplateId && aTemplate?.id === filterTemplateId) ||
        (filterListId && a.type === 'tasklist' && a.id === filterListId)
      
      // Check if item b matches any filter
      const bMatchesFilter = 
        (filterProfileId && (bNote?.user?.id === filterProfileId || bTemplate?.user?.id === filterProfileId)) ||
        (filterNoteId && bNote?.id === filterNoteId) ||
        (filterTemplateId && bTemplate?.id === filterTemplateId) ||
        (filterListId && b.type === 'tasklist' && b.id === filterListId)
      
      // If one matches and the other doesn't, prioritize the matching one
      if (aMatchesFilter && !bMatchesFilter) return -1
      if (!aMatchesFilter && bMatchesFilter) return 1
      
      // If both match or neither matches, sort by creation date (most recent first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [publicNotes, publicTemplates, filterProfileId, filterNoteId, filterListId, filterTemplateId])

  const getNoteUserDisplayName = (note: PublicNote) => {
    if (note.user.profile) {
      const { firstName, lastName, userName } = note.user.profile
      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      return fullName || userName || t('common.anonymousUser')
    }
    return t('common.anonymousUser')
  }

  const getNoteUserProfilePicture = (note: PublicNote) => {
    return note.user.profile?.profilePicture || '/images/default-avatar.webp'
  }

  const getNoteUserName = (note: PublicNote) => {
    return note.user.profile?.userName || null
  }

  const getTemplateUserName = (template: PublicTemplate) => {
    return template.user?.profile?.userName || null
  }

  const getTemplateUserProfilePicture = (template: PublicTemplate) => {
    return template.user?.profile?.profilePicture || '/images/default-avatar.webp'
  }

  const getTemplateUserDisplayName = (template: PublicTemplate) => {
    if (template.user?.profile) {
      const { firstName, lastName, userName } = template.user.profile
      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      return fullName || userName || t('common.anonymousUser')
    }
    return t('common.anonymousUser')
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
    // Show skeleton while loading notes or templates
    if (isLoadingNotes || isLoadingTemplates) {
      return (
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={`skeleton-${i}`} className="flex flex-col">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <div className="flex items-center gap-2 pt-2">
                    <Skeleton className="h-8 w-8 rounded" />
                    <Skeleton className="h-8 w-8 rounded" />
                    <Skeleton className="h-8 w-16 rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )
    }

    if (activityItems.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-12">
          <p>{t('socialView.noActivity')}</p>
        </div>
      )
    }

    return (
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          {activityItems.map((item) => {
            const noteData = item.type === 'note' ? (item.data as PublicNote) : null
            const templateData = item.type === 'template' ? (item.data as PublicTemplate) : null
            const activityItem: ActivityItem = {
              id: noteData?.id || templateData?.id || '',
              type: item.type,
              createdAt: item.createdAt,
              content: noteData?.content,
              name: templateData?.name || undefined,
              role: templateData?.role || undefined,
              visibility: noteData?.visibility || templateData?.visibility,
              date: noteData?.date || undefined,
              userId: (noteData as any)?.userId || noteData?.user?.id || undefined, // Add userId for notes
              user: noteData?.user || templateData?.user || undefined,
              comments: (noteData as any)?.comments || (templateData as any)?.comments || undefined,
              _count: noteData?._count || templateData?._count
            }
            
            const currentUserId = session?.user?.id || null
            
            // Check if this item should be highlighted based on filter parameters
            const isHighlighted = 
              (filterNoteId && item.type === 'note' && noteData?.id === filterNoteId) ||
              (filterTemplateId && item.type === 'template' && templateData?.id === filterTemplateId) ||
              (filterListId && item.type === 'tasklist' && activityItem.id === filterListId) ||
              (filterProfileId && (
                (noteData?.user?.id === filterProfileId) ||
                (templateData?.user?.id === filterProfileId)
              ))
            
            return (
              <ActivityCard
                key={item.id}
                item={activityItem}
                showUserInfo={true}
                getTimeAgo={getTimeAgo}
                isLoggedIn={!!session?.user}
                currentUserId={currentUserId}
                isHighlighted={isHighlighted}
                onNoteUpdated={() => {
                  // Refresh the activity feed when a note is updated/deleted
                  fetchPublicNotes(1, false)
                  fetchPublicTemplates(1, false)
                }}
              />
            )
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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

          // Check if this friend should be highlighted based on profileId filter
          const isFriendHighlighted = filterProfileId && friend.userId === filterProfileId
          
          return (
            <Badge
              key={friend.id}
              variant="outline"
              className={`flex items-center gap-2 px-2 py-1.5 h-auto transition-colors ${
                isFriendHighlighted
                  ? 'bg-primary/10 border-primary/50 shadow-md'
                  : 'bg-transparent border-border/50 hover:border-border'
              }`}
            >
              <img
                src={getProfilePicture(friend)}
                alt="Profile"
                className="w-6 h-6 rounded-full object-cover shrink-0"
                onError={(e) => {
                  e.currentTarget.src = '/images/default-avatar.webp'
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
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
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
    </div>
  )
} 