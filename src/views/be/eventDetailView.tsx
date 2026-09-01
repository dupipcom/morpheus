'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useAuth } from '@clerk/nextjs'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EventCard } from '@/components/eventCard'
import { CommentsSection } from '@/components/commentsSection'
import { Heart, CalendarDays, MapPin, Globe } from 'lucide-react'
import { attachmentFileUrl } from '@/components/attachmentPicker'
import { ManageEventForm } from '@/views/forms/manageEventForm'
import type { EventDetailPayload, EventManage, EventSummary } from './eventTypes'

/**
 * Event detail body (Phase 8): cover, meta, RSVP/like action islands, host,
 * linked lists/projects, proximity suggestions and comments. Shared by the
 * public page (PublicEventView) and the in-tab portal detail in EventsView.
 * Ticketing arrives in Phase 9 (Buy/Reserve placeholder).
 */
export function EventDetailView({
  event,
  locale,
  onChanged
}: {
  event: EventDetailPayload
  locale: string
  /** Called after a manage action (save/publish/delete) — the hosts revalidate. */
  onChanged?: () => Promise<void> | void
}) {
  const { t } = useI18n()
  const { isSignedIn } = useAuth()

  const [rsvp, setRsvp] = useState<string | null>(event.viewer?.rsvp ?? null)
  const [showManage, setShowManage] = useState(false)

  // Ownership probe: GET /api/v1/events/[eventId] is owner/manager-only —
  // a 200 means the viewer can manage the event and carries the full record.
  const { data: manageData, mutate: mutateManage } = useSWR<{ event: EventManage }>(
    isSignedIn ? `/api/v1/events/${event.id}` : null,
    jsonFetcher,
    { revalidateOnFocus: false }
  )
  const canManage = manageData?.event != null
  const [going, setGoing] = useState<number>(event.counts?.going ?? 0)
  const [interested, setInterested] = useState<number>(event.counts?.interested ?? 0)
  const [liked, setLiked] = useState<boolean>(event.viewer?.isLiked ?? false)
  const [likeCount, setLikeCount] = useState<number>(event.counts?.likes ?? 0)
  const [busy, setBusy] = useState(false)

  const lat = event.location?.lat
  const lng = event.location?.lng

  // Proximity suggestions: bounding-box search server-side around the venue.
  const { data: nearbyData } = useSWR<{ events: EventSummary[] }>(
    lat != null && lng != null
      ? `/api/v1/events/public?near=${lat},${lng},50&limit=6`
      : null,
    jsonFetcher,
    { revalidateOnFocus: false }
  )
  const nearby = (nearbyData?.events || []).filter((n) => n.id !== event.id).slice(0, 3)

  const sendRsvp = async (status: string) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/events/${event.id}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (res.ok) {
        const data = await res.json()
        setRsvp(status)
        setGoing(data.goingCount)
        setInterested(data.interestedCount)
      }
    } catch (error) {
      console.error('Error updating RSVP:', error)
    } finally {
      setBusy(false)
    }
  }

  const toggleLike = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/v1/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'event', entityId: event.id })
      })
      if (res.ok) {
        setLiked((prev) => !prev)
        setLikeCount((prev) => (liked ? Math.max(0, prev - 1) : prev + 1))
      }
    } catch (error) {
      console.error('Error toggling like:', error)
    } finally {
      setBusy(false)
    }
  }

  const startsAt = event.startsAt ? new Date(event.startsAt) : null
  const venueLabel = !event.isOnline ? event.venueName || event.location?.name || null : null
  const venueAddress = !event.isOnline ? event.location?.address || null : null
  // Google Maps deep link: prefer the geopos when present, fall back to the
  // stored address/venue name. The geopos also feeds the future events map view.
  const mapsUrl = (() => {
    if (event.isOnline) return null
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
    }
    const query = venueAddress || venueLabel
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null
  })()

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        {event.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachmentFileUrl(event.cover)} alt="" className="w-full h-56 object-cover" />
        )}
        <CardContent className="pt-4 space-y-3">
          <h1 className="text-2xl font-bold">{event.name}</h1>
          {event.summary && <p className="text-muted-foreground">{event.summary}</p>}

          <div className="flex flex-wrap gap-4 text-sm">
            {startsAt && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-4 w-4" />
                {startsAt.toLocaleString(locale, { timeZone: event.timezone || 'UTC' })} ({event.timezone})
              </span>
            )}
            {event.isOnline ? (
              <span className="flex items-center gap-1">
                <Globe className="h-4 w-4" />
                {t('events.public.online', { defaultValue: 'Online event' })}
                {event.onlineUrl && (
                  <a href={event.onlineUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {event.onlineUrl}
                  </a>
                )}
              </span>
            ) : (
              (venueLabel || venueAddress) && (
                <span className="flex items-start gap-1">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    {venueLabel}
                    {venueLabel && venueAddress && (
                      <span className="text-muted-foreground"> · {venueAddress}</span>
                    )}
                    {!venueLabel && venueAddress && <span>{venueAddress}</span>}
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-primary hover:underline"
                      >
                        {t('events.public.openInMaps', { defaultValue: 'Open in Google Maps' })}
                      </a>
                    )}
                  </span>
                </span>
              )
            )}
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={rsvp === 'GOING' ? 'default' : 'outline'}
              size="sm"
              onClick={() => sendRsvp(rsvp === 'GOING' ? 'NOT_GOING' : 'GOING')}
              disabled={busy}
            >
              {t('events.public.going', { defaultValue: 'Going' })} ({going})
            </Button>
            <Button
              variant={rsvp === 'INTERESTED' ? 'default' : 'outline'}
              size="sm"
              onClick={() => sendRsvp(rsvp === 'INTERESTED' ? 'NOT_GOING' : 'INTERESTED')}
              disabled={busy}
            >
              {t('events.public.interested', { defaultValue: 'Interested' })} ({interested})
            </Button>
            <Button
              variant={liked ? 'default' : 'outline'}
              size="sm"
              onClick={toggleLike}
              disabled={busy}
              aria-label={t('events.public.like', { defaultValue: 'Like' })}
            >
              <Heart className={`h-4 w-4 mr-1 ${liked ? 'fill-current' : ''}`} />
              {likeCount}
            </Button>
            {/* Phase 9 replaces this placeholder with the Buy/Reserve flow */}
            <Button variant="secondary" size="sm" disabled>
              {t('events.public.buyPlaceholder', { defaultValue: 'Buy / Reserve (soon)' })}
            </Button>
            {canManage && manageData?.event && (
              <Button variant="outline" size="sm" onClick={() => setShowManage(true)}>
                {t('events.manage.short', { defaultValue: 'Manage' })}
              </Button>
            )}
          </div>

          {/* Flier renders inline below the header/buttons, above the map */}
          {event.flier && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachmentFileUrl(event.flier)}
              alt={t('events.public.flierAlt', { defaultValue: 'Event flier' })}
              className="w-full rounded-md"
            />
          )}

          {/* Location map (staticmap route requires a signed-in session) */}
          {isSignedIn && lat != null && lng != null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/v1/places/staticmap?lat=${lat}&lng=${lng}`}
              alt={t('events.public.mapAlt', { defaultValue: 'Event location map' })}
              className="w-full rounded-md"
            />
          )}

          {/* Host */}
          {event.host?.type === 'ORG' && event.host.org && (
            <Link href={`/${locale}/o/${event.host.org.username}`} className="text-sm text-primary hover:underline">
              {t('events.public.hostedBy', { defaultValue: 'Hosted by' })} {event.host.org.name}
            </Link>
          )}
          {event.host?.type === 'USER' && event.host.profile?.userName && (
            <span className="text-sm text-muted-foreground">@{event.host.profile.userName}</span>
          )}
        </CardContent>
      </Card>

      {event.description && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="font-semibold mb-1">{t('events.public.about', { defaultValue: 'About' })}</h2>
            <p className="text-sm whitespace-pre-line">{event.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Proximity suggestions */}
      {nearby.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            {t('events.public.nearby', { defaultValue: 'Nearby events' })}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {nearby.map((n) => (
              <EventCard key={n.id} event={n} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {/* Get involved: linked lists (job boards) */}
      {(event.lists || []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            {t('events.public.getInvolved', { defaultValue: 'Get involved' })}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(event.lists || []).map((list) => (
              <Link key={list.id} href={`/${locale}/list/${list.publicUrl}`}>
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <h3 className="font-semibold">{list.name}</h3>
                    {list.publicTagline && (
                      <p className="text-sm text-muted-foreground">{list.publicTagline}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Host projects */}
      {(event.projects || []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">{t('events.public.projects', { defaultValue: 'Projects' })}</h2>
          <div className="flex flex-wrap gap-2">
            {(event.projects || []).map((project) => (
              <Link key={project.id} href={`/${locale}/p/${project.username}`}>
                <Card>
                  <CardContent className="py-2 px-3">
                    <span className="text-sm font-medium">{project.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">@{project.username}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Comments */}
      <section>
        <h2 className="text-lg font-semibold mb-3">
          {t('events.public.comments', { defaultValue: 'Comments' })}
        </h2>
        <CommentsSection entityType="event" entityId={event.id} />
      </section>

      {manageData?.event && (
        <ManageEventForm
          open={showManage}
          onOpenChange={setShowManage}
          event={manageData.event}
          onChanged={async () => {
            await mutateManage()
            await onChanged?.()
          }}
          onDeleted={async () => {
            await mutateManage()
            await onChanged?.()
          }}
        />
      )}
    </div>
  )
}
