'use client'

import { useRouter } from 'next/navigation'
import { EventDetailView } from './eventDetailView'
import type { EventDetailPayload } from './eventTypes'

/**
 * Public event page body: server shell wrapper around the shared
 * EventDetailView (RSVP, like, nearby suggestions, comments).
 * Ticketing arrives in Phase 9 (Buy/Reserve placeholder).
 */
export function PublicEventView({ event, locale }: { event: EventDetailPayload; locale: string }) {
  const router = useRouter()

  return (
    <main className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <EventDetailView event={event} locale={locale} onChanged={() => router.refresh()} />
    </main>
  )
}
