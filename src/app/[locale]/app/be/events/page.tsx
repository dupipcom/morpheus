import { EventsView } from '@/views/be/eventsView'

/**
 * Events (Phase 8): standalone page at /app/be/events.
 * The same view is embedded in the BeView Events tab (src/views/be/beView.tsx).
 */
export default function EventsPage() {
  return (
    <main className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <EventsView />
    </main>
  )
}
