'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { CheckSquare, User, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/contexts/i18n'

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
}

export function SearchPopover({ query, open, onOpenChange, anchorRef }: SearchPopoverProps) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { t } = useI18n()
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    if (!query || query.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`)
        if (response.ok) {
          const data = await response.json()
          setResults(data.results || [])
        } else {
          setResults([])
        }
      } catch (error) {
        console.error('Error searching:', error)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [query])

  const handleResultClick = (result: SearchResult) => {
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

  if (!open || !anchorRef.current) return null

  // Get input position for positioning the popover
  const inputRect = anchorRef.current.getBoundingClientRect()

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div
          style={{
            position: 'fixed',
            top: inputRect.top,
            left: inputRect.left,
            width: inputRect.width,
            height: inputRect.height,
            pointerEvents: 'none',
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-[80vw] md:w-[30vw] max-w-none p-0"
        align="start"
        side="top"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {query.length < 2
                ? 'Type to search...'
                : t('common.noResults') || 'No results found'}
            </div>
          ) : (
            <div className="py-2">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}-${index}`}
                  onClick={() => handleResultClick(result)}
                  onMouseDown={(e) => e.preventDefault()}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted transition-colors",
                    "focus:outline-none focus:bg-muted"
                  )}
                >
                  <div className="mt-0.5 flex-shrink-0 text-muted-foreground">
                    {getTypeIcon(result.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {result.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

