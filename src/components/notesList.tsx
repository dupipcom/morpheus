'use client'

import { useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react"
import { useI18n } from '@/lib/contexts/i18n'
import type { ActivityItem } from './activityCard'
import type { Comment } from './activityCard'
import type { NoteDocumentRef } from './noteAttachments'
import { ActivityGrid } from './activityGrid'
import { cn } from '@/lib/utils/utils'

export interface Note {
  id: string
  content: string
  visibility: string
  createdAt: string
  date?: string
  userId?: string
  taskIds?: string[]
  comments?: Comment[]
  isLiked?: boolean
  /** Author profile in the Be feed shape (avatar + username header) */
  user?: {
    id: string
    profile?: {
      userName?: string
      profilePicture?: string
      firstName?: string
      lastName?: string
    } | null
  }
  documents?: NoteDocumentRef[] | null
  _count?: {
    comments: number
    likes?: number
  }
  relevanceScore?: number
  sender?: {
    id: string
    userName?: string
    firstName?: string
    lastName?: string
  } | null
  recipient?: {
    id: string
    userName?: string
    firstName?: string
    lastName?: string
  } | null
}

interface NotesListProps {
  notes: Note[]
  loading?: boolean
  onRefresh?: () => void
  showHeader?: boolean
  emptyMessage?: string
  isLoggedIn?: boolean
  currentUserId?: string | null
  onNoteUpdated?: () => void
  filterNoteId?: string // Filter note ID to prioritize and highlight
  isReversed?: boolean
  onToggleReverseOrder?: () => void
}

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
  isLoggedIn = false,
  currentUserId,
  onNoteUpdated,
  filterNoteId,
  isReversed = false,
  onToggleReverseOrder,
}: NotesListProps) {
  const { t } = useI18n()

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

  // Single rendering path: the same cards + grid as the Be feed.
  const items: ActivityItem[] = useMemo(
    () => sortedNotes.map((note) => ({
      id: note.id,
      type: 'note',
      createdAt: note.createdAt,
      content: note.content,
      visibility: note.visibility,
      date: note.date,
      userId: note.userId,
      user: note.user,
      sender: note.sender,
      recipient: note.recipient,
      comments: note.comments,
      isLiked: note.isLiked,
      documents: note.documents,
      taskIds: note.taskIds,
      profileIds: (note as any).profileIds,
      listIds: (note as any).listIds,
      eventIds: (note as any).eventIds,
      location: (note as any).location,
      _count: note._count
    })),
    [sortedNotes]
  )

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('publicProfile.notes')}</h3>
          <div className="flex items-center gap-1">
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
      <ActivityGrid
        items={items}
        loading={loading}
        emptyMessage={emptyMessage}
        isLoggedIn={isLoggedIn}
        currentUserId={currentUserId}
        getTimeAgo={getTimeAgo}
        showUserInfo={true}
        onCommentAdded={onRefresh}
        onNoteUpdated={onNoteUpdated || onRefresh}
        isHighlighted={(item) => filterNoteId ? item.id === filterNoteId : false}
      />
    </div>
  )
}
