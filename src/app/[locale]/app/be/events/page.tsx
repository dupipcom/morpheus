'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EventCard } from '@/components/eventCard'
import { AddEventForm } from '@/views/forms/addEventForm'

/**
 * Events (Phase 8): Discover (public feed), Going/Interested, Mine/Org.
 * Replaces the disabled BeView tab.
 */
export default function EventsPage() {
  const { locale } = useParams<{ locale: string }>()
  const { t } = useI18n()

  const [tab, setTab] = useState('discover')
  const [showCreate, setShowCreate] = useState(false)

  const discoverKey = '/api/v1/events/public?limit=50'
  const attendingKey = '/api/v1/events?scope=attending&limit=50'
  const mineKey = '/api/v1/events?scope=mine&limit=50'

  const { data: discoverData } = useSWR<{ events: any[] }>(tab === 'discover' ? discoverKey : null, jsonFetcher, {
    revalidateOnFocus: false
  })
  const { data: attendingData, mutate: mutateAttending } = useSWR<{ events: any[] }>(
    tab === 'attending' ? attendingKey : null,
    jsonFetcher,
    { revalidateOnFocus: false }
  )
  const { data: mineData, mutate: mutateMine } = useSWR<{ events: any[] }>(tab === 'mine' ? mineKey : null, jsonFetcher, {
    revalidateOnFocus: false
  })

  const events = tab === 'discover' ? (discoverData?.events || []) : tab === 'attending' ? (attendingData?.events || []) : (mineData?.events || [])

  return (
    <main className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="discover">{t('events.discover', { defaultValue: 'Discover' })}</TabsTrigger>
          <TabsTrigger value="attending">{t('events.attending', { defaultValue: 'Going / Interested' })}</TabsTrigger>
          <TabsTrigger value="mine">{t('events.mine', { defaultValue: 'Mine / Org' })}</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="pt-4">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event: any) => (
              <EventCard key={event.id} event={event} locale={locale} />
            ))}
            {events.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground">
                {t('events.empty', { defaultValue: 'No events yet.' })}
              </p>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <AddEventForm
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={async () => {
          await mutateMine()
          await mutateAttending()
        }}
      />
    </main>
  )
}
