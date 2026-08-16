'use client'

import type { ReactNode } from 'react'
import ActivityCard from './activityCard'
import type { ActivityItem } from './activityCard'
import { cn } from '@/lib/utils/utils'
import { useI18n } from '@/lib/contexts/i18n'

interface ActivityGridProps {
  items: ActivityItem[]
  loading?: boolean
  emptyMessage?: string
  isLoggedIn?: boolean
  currentUserId?: string | null
  /** Time-ago formatter (Date-based, the ActivityCard contract) */
  getTimeAgo: (date: Date) => string
  /** Show the author header (avatar + username) — the Be feed card layout */
  showUserInfo?: boolean
  onCommentAdded?: () => void
  onNoteUpdated?: () => void
  /** Highlight resolver per item (e.g. filterNoteId matches) */
  isHighlighted?: (item: ActivityItem) => boolean
  /** Extra content rendered under each card (task chips, attachments, ...) */
  renderExtras?: (item: ActivityItem) => ReactNode
  className?: string
}

/**
 * Single source of truth for rendering activity/note cards in a grid.
 * The Be feed layout: 1 column on mobile, 2 on md, 3 on lg, stretch-aligned.
 * Both the Be view and the Feel (mood) notes tab render through this grid.
 */
export function ActivityGrid({
  items,
  loading = false,
  emptyMessage = 'No notes available yet.',
  isLoggedIn = false,
  currentUserId,
  getTimeAgo,
  showUserInfo = false,
  onCommentAdded,
  onNoteUpdated,
  isHighlighted,
  renderExtras,
  className,
}: ActivityGridProps) {
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('publicProfile.loadingNotes')}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch', className)}>
      {items.map((item) => (
        <div key={item.id}>
          <ActivityCard
            item={item}
            showUserInfo={showUserInfo}
            getTimeAgo={getTimeAgo}
            isLoggedIn={isLoggedIn}
            currentUserId={currentUserId}
            onCommentAdded={onCommentAdded}
            onNoteUpdated={onNoteUpdated}
            isHighlighted={isHighlighted?.(item) ?? false}
          />
          {renderExtras?.(item)}
        </div>
      ))}
    </div>
  )
}
