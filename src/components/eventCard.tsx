'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CalendarDays } from 'lucide-react'
import { attachmentFileUrl } from '@/components/attachmentPicker'
import { useI18n } from '@/lib/contexts/i18n'
import type { EventSummary } from '@/views/be/eventTypes'

/**
 * Compact event card (Phase 8): cover, name, date/time in the event's
 * timezone, going/interested counts (when the payload carries them — the
 * Mine/Org scope does not). Draft/cancelled events open the manage dialog
 * instead of linking to a public page that does not exist yet.
 */
export const EventCard = ({
  event,
  locale,
  status,
  onOpen,
  onManage
}: {
  event: EventSummary
  locale: string
  status?: string
  onOpen?: () => void
  onManage?: () => void
}) => {
  const { t } = useI18n()
  const startsAt = event.startsAt ? new Date(event.startsAt) : null
  // Discovery payloads carry no status — treat them as published.
  const isPublished = status === undefined || status === 'PUBLISHED'

  const cardInner = (
    <Card className="h-full hover:shadow-md transition-shadow overflow-hidden">
      {event.coverDocumentId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachmentFileUrl(event.coverDocumentId)}
          alt=""
          className="w-full h-32 object-cover"
        />
      )}
      <CardContent className="pt-3 space-y-1">
        <h3 className="font-semibold truncate">{event.name}</h3>
        {startsAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {startsAt.toLocaleString(locale, { timeZone: event.timezone || 'UTC' })}
          </p>
        )}
        {event.summary && <p className="text-sm text-muted-foreground line-clamp-2">{event.summary}</p>}
        {(event.goingCount != null || event.interestedCount != null) && (
          <p className="text-xs text-muted-foreground">
            {event.goingCount ?? 0} going · {event.interestedCount ?? 0} interested
          </p>
        )}
      </CardContent>
    </Card>
  )

  const manageOverlay = onManage && status === 'PUBLISHED' && (
    <Button
      size="sm"
      variant="outline"
      className="absolute top-2 right-2 z-10"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onManage()
      }}
    >
      {t('events.manage.short', { defaultValue: 'Manage' })}
    </Button>
  )

  // In-app detail (portal tab) — replaces the public-page navigation.
  if (onOpen && isPublished) {
    return (
      <div className="relative h-full">
        <div
          role="button"
          tabIndex={0}
          className="cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring h-full"
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onOpen()
            }
          }}
          aria-label={event.name}
        >
          {cardInner}
        </div>
        {manageOverlay}
      </div>
    )
  }

  // Draft/cancelled events have no public page (404) — manage is their
  // destination.
  if (onManage && !isPublished) {
    return (
      <div
        role="button"
        tabIndex={0}
        className="cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring h-full"
        onClick={onManage}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onManage()
          }
        }}
        aria-label={`${event.name} — ${t('events.manage.short', { defaultValue: 'Manage' })}`}
      >
        {cardInner}
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <Link href={`/${locale}/event/${event.publicUrl}`} className="block h-full">
        {cardInner}
      </Link>
      {manageOverlay}
    </div>
  )
}
