'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays } from 'lucide-react'

/**
 * Compact event card (Phase 8): cover, name, date/time in the event's
 * timezone, going/interested counts.
 */
export const EventCard = ({ event, locale }: { event: any; locale: string }) => {
  const startsAt = event.startsAt ? new Date(event.startsAt) : null

  return (
    <Link href={`/${locale}/event/${event.publicUrl}`}>
      <Card className="h-full hover:shadow-md transition-shadow overflow-hidden">
        {event.coverDocumentId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverDocumentId} alt="" className="w-full h-32 object-cover" />
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
          <p className="text-xs text-muted-foreground">
            {event.goingCount ?? 0} going · {event.interestedCount ?? 0} interested
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
