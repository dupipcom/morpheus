'use client'

import { useState, useEffect, useContext, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { CheckSquare, User, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/contexts/i18n'
import { GlobalContext } from '@/lib/contexts'
import { useSearch } from '@/lib/hooks/useSearch'

interface SearchResult {
  id: string
  name: string
  type: 'list' | 'profile' | 'note'
  role?: string
  username?: string
  firstName?: string
  lastName?: string
  profilePicture?: string
  content?: string
  date?: string
  visibility?: string
}

interface SearchPopoverProps {
  query: string
  open: boolean
  onOpenChange: (open: boolean) => void
  anchorRef: React.RefObject<HTMLInputElement>
  onClearQuery?: () => void
  onCollapseSearch?: () => void
}

export function SearchPopover({ query, open, onOpenChange, anchorRef, onClearQuery, onCollapseSearch }: SearchPopoverProps) {
  const router = useRouter()
  const { t } = useI18n()
  const { setIsNavigating } = useContext(GlobalContext)

  // Debounce the query for SWR
  const [debouncedQuery, setDebouncedQuery] = useState<string>('')

  useEffect(() => {
    if (!query || query.length < 2) {
      setDebouncedQuery('')
      return
    }

    const timeoutId = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query])

  // Use SWR for search
  const { results: searchResults, isLoading } = useSearch(
    debouncedQuery && debouncedQuery.length >= 2 ? debouncedQuery : null,
    true
  )

  // Limit results to 5 - use useMemo to avoid infinite loops
  const results = useMemo(() => {
    return (searchResults || []).slice(0, 5)
  }, [searchResults])

  const handleResultClick = (result: SearchResult) => {
    setIsNavigating(true)
    
    if (result.type === 'list') {
      router.push(`/app/do/${result.id}`)
    } else if (result.type === 'profile') {
      if (result.username) {
        router.push(`/@${result.username}`)
      }
    } else if (result.type === 'note') {
      // Check visibility - if not PUBLIC, FRIENDS, or CLOSE_FRIENDS, link to feel/notes
      // Otherwise link to be/activity page
      const isPublicOrShared = result.visibility === 'PUBLIC' || 
                               result.visibility === 'FRIENDS' || 
                               result.visibility === 'CLOSE_FRIENDS'
      
      if (isPublicOrShared) {
        // Navigate to be/activity page with noteId query parameter to show the note first
        router.push(`/app/be/activity?noteId=${result.id}`)
      } else {
        // Navigate to feel/notes page with noteId query parameter for private notes
        router.push(`/app/feel/notes?noteId=${result.id}`)
      }
    }
    onOpenChange(false)
    onClearQuery?.()
    onCollapseSearch?.()
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'list':
        return <CheckSquare className="h-4 w-4" />
      case 'profile':
        return <User className="h-4 w-4" />
      case 'note':
        return <FileText className="h-4 w-4" />
      default:
        return null
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'list':
        return t('common.entities.list') || 'List'
      case 'profile':
        return t('common.profile') || 'Profile'
      case 'note':
        return 'Note'
      default:
        return type
    }
  }

  const getVisibilityLabel = (visibility?: string) => {
    if (!visibility) return null
    switch (visibility) {
      case 'PUBLIC':
        return 'Public'
      case 'FRIENDS':
        return 'Friends'
      case 'CLOSE_FRIENDS':
        return 'Close Friends'
      case 'PRIVATE':
        return 'Private'
      case 'AI_ENABLED':
        return 'AI Enabled'
      default:
        return visibility.toLowerCase().replace('_', ' ')
    }
  }

  const getVisibilityBadgeClass = (visibility?: string) => {
    if (!visibility) return ''
    switch (visibility) {
      case 'PUBLIC':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'FRIENDS':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'CLOSE_FRIENDS':
        return 'bg-purple-50 text-purple-700 border-purple-200'
      case 'PRIVATE':
        return 'bg-gray-50 text-gray-700 border-gray-200'
      case 'AI_ENABLED':
        return 'bg-orange-50 text-orange-700 border-orange-200'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed left-0 right-0 bg-background border-t border-border shadow-lg z-40"
      style={{
        bottom: '130px', // Position above bottomToolbar (80px nav + 50px toolbar)
        maxHeight: 'min(40vh, 300px)', // Never too high, especially on mobile
        overflowY: 'auto',
      }}
    >
      <div className="max-w-7xl mx-auto px-4">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {query.length < 2
              ? 'Type to search...'
              : t('common.noResults') || 'No results found'}
          </div>
        ) : (
          <div className="py-2">
            {/* Mobile: List layout */}
            <div className="md:hidden space-y-1">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}-${index}`}
                  onClick={() => handleResultClick(result)}
                  onMouseDown={(e) => e.preventDefault()}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted transition-colors rounded-md",
                    "focus:outline-none focus:bg-muted"
                  )}
                >
                  <div className="mt-0.5 flex-shrink-0 text-muted-foreground">
                    {getTypeIcon(result.type)}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {result.name}
                      </span>
                    </div>
                    {result.type === 'note' && result.visibility && (
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs w-fit",
                          getVisibilityBadgeClass(result.visibility)
                        )}
                      >
                        {getVisibilityLabel(result.visibility)}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {/* Desktop: Grid layout */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}-${index}`}
                  onClick={() => handleResultClick(result)}
                  onMouseDown={(e) => e.preventDefault()}
                  className={cn(
                    "flex flex-col items-start gap-2 px-3 py-2 text-left hover:bg-muted transition-colors rounded-md",
                    "focus:outline-none focus:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className="flex-shrink-0 text-muted-foreground">
                      {getTypeIcon(result.type)}
                    </div>
                    <span className="text-sm font-medium truncate flex-1">
                      {result.name}
                    </span>
                  </div>
                  {result.type === 'note' && result.visibility && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs w-fit",
                        getVisibilityBadgeClass(result.visibility)
                      )}
                    >
                      {getVisibilityLabel(result.visibility)}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

