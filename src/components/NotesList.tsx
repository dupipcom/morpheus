'use client'

import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { useI18n } from '@/lib/contexts/i18n'
import ActivityCard, { ActivityItem } from './ActivityCard'

export interface Note {
  id: string
  content: string
  visibility: string
  createdAt: string
  date?: string
  userId?: string
  comments?: any[]
  isLiked?: boolean
  _count?: {
    comments: number
    likes?: number
  }
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
  gridLayout = false,
  isLoggedIn = false,
  currentUserId,
  onNoteUpdated
}: NotesListProps) {
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('publicProfile.loadingNotes')}
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p>{emptyMessage}</p>
      </div>
    )
  }

  const containerClass = gridLayout 
    ? "grid grid-cols-1 md:grid-cols-3 gap-4"
    : "space-y-4"

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('publicProfile.notes')}</h3>
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
      )}
      <div className={containerClass}>
        {notes.map((note) => {
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
          return (
            <ActivityCard
              key={note.id}
              item={activityItem}
              onCommentAdded={onRefresh}
              getTimeAgo={getTimeAgo}
              isLoggedIn={isLoggedIn}
              currentUserId={currentUserId}
              onNoteUpdated={onNoteUpdated || onRefresh}
            />
          )
        })}
      </div>
    </div>
  )
}

