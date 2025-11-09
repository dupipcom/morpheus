'use client'

import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { useI18n } from '@/lib/contexts/i18n'

export interface Note {
  id: string
  content: string
  visibility: string
  createdAt: string
  date?: string
}

interface NotesListProps {
  notes: Note[]
  loading?: boolean
  onRefresh?: () => void
  showHeader?: boolean
  emptyMessage?: string
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
  emptyMessage = 'No notes available yet.'
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

  return (
    <div className="space-y-4">
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
      {notes.map((note) => (
        <div key={note.id} className="border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              {getTimeAgo(new Date(note.createdAt))}
              {note.date && ` • ${note.date}`}
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
              {note.visibility.toLowerCase().replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{note.content}</p>
        </div>
      ))}
    </div>
  )
}

