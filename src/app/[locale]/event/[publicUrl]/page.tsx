import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { I18nProvider } from '@/lib/contexts/i18n'
import type { Locale } from '@/lib/i18n'
import { cachedInternalGet } from '@/lib/public/internalFetch'
import { PublicEventView } from '@/views/be/publicEventView'
import type { EventDetailPayload } from '@/views/be/eventTypes'

// Event fetch is cached by cachedInternalGet (React.cache) to avoid duplicate
// requests between generateMetadata and the page component
const getEvent = async (publicUrl: string): Promise<EventDetailPayload | null> => {
  // Forward the viewer's cookies: the internal fetch runs on the server with
  // no session otherwise, and the payload would lose the signed-in viewer
  // block (RSVP/like state used to highlight the action buttons).
  const cookieHeader = (await cookies()).toString()
  const data = await cachedInternalGet<{ event?: EventDetailPayload }>(
    `/api/v1/events/public/${publicUrl}`,
    cookieHeader
  )
  return data?.event ?? null
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; publicUrl: string }>
}): Promise<Metadata> {
  const { publicUrl } = await params

  const event = await getEvent(publicUrl)

  if (!event) {
    return { title: 'Event Not Found' }
  }

  const title = `${event.name || 'Event'} · Dupip`
  const description = event.summary || undefined

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      // The cover documentId is not a URL — render it through the
      // authenticated media pipe (PUBLIC events stream to anonymous crawlers).
      images: event.cover ? [`/api/v1/attachments/${event.cover}/file`] : [],
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: event.cover ? [`/api/v1/attachments/${event.cover}/file`] : []
    },
    other: event.startsAt
      ? {
          'application/ld+json': JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Event',
            name: event.name,
            description: event.description || event.summary || undefined,
            startDate: event.startsAt,
            endDate: event.endsAt || undefined,
            eventStatus: 'https://schema.org/EventScheduled',
            eventAttendanceMode: event.isOnline
              ? 'https://schema.org/OnlineEventAttendanceMode'
              : 'https://schema.org/OfflineEventAttendanceMode',
            location: event.isOnline
              ? { '@type': 'VirtualLocation', url: event.onlineUrl || undefined }
              : {
                  '@type': 'Place',
                  name: event.venueName || event.location?.name || undefined,
                  address: event.location?.address || undefined,
                  geo: event.location?.lat != null
                    ? { '@type': 'GeoCoordinates', latitude: event.location.lat, longitude: event.location.lng }
                    : undefined
                }
          })
        }
      : undefined
  }
}

export default async function PublicEventPage({
  params
}: {
  params: Promise<{ locale: string; publicUrl: string }>
}) {
  const { locale, publicUrl } = await params

  const event = await getEvent(publicUrl)
  if (!event) {
    notFound()
  }

  return (
    <I18nProvider locale={locale as Locale}>
      <PublicEventView event={event} locale={locale} />
    </I18nProvider>
  )
}
