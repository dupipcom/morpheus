import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { I18nProvider } from '@/lib/contexts/i18n'
import { cachedInternalGet } from '@/lib/public/internalFetch'
import { PublicEventView } from '@/views/be/publicEventView'

interface PublicEventPayload {
  id?: string
  name?: string | null
  summary?: string | null
  description?: string | null
  startsAt?: string | null
  endsAt?: string | null
  timezone?: string | null
  location?: { name?: string; address?: string; lat?: number; lng?: number } | null
  venueName?: string | null
  isOnline?: boolean
  onlineUrl?: string | null
  cover?: string | null
  [key: string]: unknown
}

// Event fetch is cached by cachedInternalGet (React.cache) to avoid duplicate
// requests between generateMetadata and the page component
const getEvent = async (publicUrl: string): Promise<PublicEventPayload | null> => {
  const data = await cachedInternalGet<{ event?: PublicEventPayload }>(
    `/api/v1/events/public/${publicUrl}`
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
      images: event.cover ? [event.cover] : [],
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: event.cover ? [event.cover] : []
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
    <I18nProvider locale={locale as any}>
      <PublicEventView event={event} locale={locale} />
    </I18nProvider>
  )
}
