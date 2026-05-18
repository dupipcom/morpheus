'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from "@/components/ui/button"
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react"
import { useI18n } from '@/lib/contexts/i18n'
import ActivityCard, { ActivityItem } from './activityCard'
import type { Comment } from './activityCard'
import { cn } from '@/lib/utils/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface Note {
  id: string
  content: string
  visibility: string
  createdAt: string
  date?: string
  userId?: string
  comments?: Comment[]
  isLiked?: boolean
  _count?: {
    comments: number
    likes?: number
  }
  relevanceScore?: number
}

interface NotesListProps {
  notes: Note[]
  loading?: boolean
  onRefresh?: () => void
  showHeader?: boolean
  emptyMessage?: string
  gridLayout?: boolean
  isLoggedIn?: boolean
  currentUserId?: string | null
  onNoteUpdated?: () => void
  filterNoteId?: string // Filter note ID to prioritize and highlight
  isReversed?: boolean
  onToggleReverseOrder?: () => void
}

type NotesGridOption = 'tight' | 'small' | 'wide'

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) {
    return 'just now'
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`
  }
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`
  }
  
  const diffInWeeks = Math.floor(diffInDays / 7)
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks === 1 ? '' : 's'} ago`
  }
  
  const diffInMonths = Math.floor(diffInDays / 30)
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`
  }
  
  const diffInYears = Math.floor(diffInDays / 365)
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`
}

export function NotesList({ 
  notes, 
  loading = false, 
  onRefresh, 
  showHeader = true,
  emptyMessage = 'No notes available yet.',
  gridLayout = false,
  isLoggedIn = false,
  currentUserId,
  onNoteUpdated,
  filterNoteId,
  isReversed = false,
  onToggleReverseOrder
}: NotesListProps) {
  const { t } = useI18n()
  const [gridOption, setGridOption] = useState<NotesGridOption>(gridLayout ? 'tight' : 'wide')

  useEffect(() => {
    setGridOption(gridLayout ? 'tight' : 'wide')
  }, [gridLayout])

  // Preserve backend order and only prioritize a specific highlighted note when requested.
  const sortedNotes = useMemo(() => {
    if (!filterNoteId) return notes

    return [...notes].sort((a, b) => {
      const aMatches = a.id === filterNoteId
      const bMatches = b.id === filterNoteId
      if (aMatches && !bMatches) return -1
      if (!aMatches && bMatches) return 1
      return 0
    })
  }, [notes, filterNoteId])

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('publicProfile.loadingNotes')}
      </div>
    )
  }

  if (sortedNotes.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p>{emptyMessage}</p>
      </div>
    )
  }

  const containerClass = cn(
    'grid grid-cols-1 gap-4',
    gridOption === 'tight' && 'md:grid-cols-3',
    gridOption === 'small' && 'md:grid-cols-2',
    gridOption === 'wide' && 'md:grid-cols-1'
  )

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('publicProfile.notes')}</h3>
          <div className="flex items-center gap-1">
            <Select value={gridOption} onValueChange={(value) => setGridOption(value as NotesGridOption)}>
              <SelectTrigger className="h-8 w-[110px]" size="sm" aria-label="Note grid layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tight">Tight (3)</SelectItem>
                <SelectItem value="small">Small (2)</SelectItem>
                <SelectItem value="wide">Wide (1)</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleReverseOrder}
              className={cn('h-8 w-8 p-0', isReversed && 'text-primary')}
              title={t('common.reverseOrder')}
              aria-label={t('common.reverseOrder')}
              aria-pressed={isReversed}
              disabled={!onToggleReverseOrder}
            >
              {isReversed ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      )}
      <div className={containerClass}>
        {sortedNotes.map((note) => {
          const activityItem: ActivityItem = {
            id: note.id,
            type: 'note',
            createdAt: note.createdAt,
            content: note.content,
            visibility: note.visibility,
            date: note.date,
            userId: note.userId,
            comments: note.comments,
            isLiked: note.isLiked,
            _count: note._count
          }
          
          // Check if this note should be highlighted
          const isHighlighted = filterNoteId && note.id === filterNoteId
          
          return (
            <ActivityCard
              key={note.id}
              item={activityItem}
              onCommentAdded={onRefresh}
              getTimeAgo={getTimeAgo}
              isLoggedIn={isLoggedIn}
              currentUserId={currentUserId}
              onNoteUpdated={onNoteUpdated || onRefresh}
              isHighlighted={isHighlighted}
            />
          )
        })}
      </div>
    </div>
  )
}
