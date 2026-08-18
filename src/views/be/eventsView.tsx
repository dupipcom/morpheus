'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import useSWR, { mutate as globalMutate } from 'swr'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EventCard } from '@/components/eventCard'
import { AddEventForm } from '@/views/forms/addEventForm'
import { ManageEventForm } from '@/views/forms/manageEventForm'
import { EventPortalDetail } from './eventPortalDetail'
import type { EventSummary, EventManage } from './eventTypes'

/**
 * Events (Phase 8): Discover (public feed), Going/Interested, Mine/Org.
 * Shared by the standalone /be/events page and the BeView Events tab.
 */
export function EventsView() {
  const { locale } = useParams<{ locale: string }>()
  const { t } = useI18n()

  const [tab, setTab] = useState('discover')
  const [showCreate, setShowCreate] = useState(false)
  const [manageEvent, setManageEvent] = useState<EventManage | null>(null)
  const [portalEvent, setPortalEvent] = useState<{ publicUrl: string } | null>(null)

  const discoverKey = '/api/v1/events/public?limit=50'
  const attendingKey = '/api/v1/events?scope=attending&limit=50'
  const mineKey = '/api/v1/events?scope=mine&limit=50'

  const { data: discoverData } = useSWR<{ events: EventSummary[] }>(tab === 'discover' ? discoverKey : null, jsonFetcher, {
    revalidateOnFocus: false
  })
  const { data: attendingData } = useSWR<{ events: EventSummary[] }>(
    tab === 'attending' ? attendingKey : null,
    jsonFetcher,
    { revalidateOnFocus: false }
  )
  const { data: mineData, mutate: mutateMine } = useSWR<{ events: EventSummary[] }>(tab === 'mine' ? mineKey : null, jsonFetcher, {
    revalidateOnFocus: false
  })

  const events = tab === 'discover' ? (discoverData?.events || []) : tab === 'attending' ? (attendingData?.events || []) : (mineData?.events || [])

  // Revalidate every list after a manage action. The bound mutateMine works
  // (the user is on the mine tab while managing); the other two keys are
  // unmounted there, hence the global mutate.
  const refreshAll = async () => {
    await mutateMine()
    globalMutate(discoverKey)
    globalMutate(attendingKey)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('events.title', { defaultValue: 'Events' })}</h1>
          <p className="text-sm text-muted-foreground">
            {t('events.subtitle', { defaultValue: 'Discover events and create your own' })}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          {t('events.create', { defaultValue: 'New event' })}
        </Button>
      </div>

      {portalEvent ? (
        <EventPortalDetail
          publicUrl={portalEvent.publicUrl}
          locale={locale}
          onBack={() => setPortalEvent(null)}
        />
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="discover">{t('events.discover', { defaultValue: 'Discover' })}</TabsTrigger>
          <TabsTrigger value="attending">{t('events.attending', { defaultValue: 'Going / Interested' })}</TabsTrigger>
          <TabsTrigger value="mine">{t('events.mine', { defaultValue: 'Mine / Org' })}</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="pt-4">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                locale={locale}
                status={event.status}
                onOpen={() => setPortalEvent({ publicUrl: event.publicUrl })}
                onManage={tab === 'mine' ? () => setManageEvent(event as EventManage) : undefined}
              />
            ))}
            {events.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground">
                {t('events.empty', { defaultValue: 'No events yet.' })}
              </p>
            )}
          </section>
        </TabsContent>
      </Tabs>
      )}

      <AddEventForm
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={async (event) => {
          // Deep-link the flow: land on Mine/Org and open the manage step on
          // the new draft so it can be completed and published.
          setTab('mine')
          setManageEvent(event)
        }}
      />

      <ManageEventForm
        open={manageEvent !== null}
        onOpenChange={(open) => {
          if (!open) setManageEvent(null)
        }}
        event={manageEvent}
        onChanged={refreshAll}
        onDeleted={refreshAll}
      />
    </div>
  )
}
