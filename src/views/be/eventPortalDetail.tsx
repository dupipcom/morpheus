'use client'

import useSWR from 'swr'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'
import { EventDetailView } from './eventDetailView'
import type { EventDetailPayload } from './eventTypes'

/**
 * In-app event detail (portal tab): clicking a card inside /app/be swaps the
 * events tab for the detail view. The standalone /event/[publicUrl] page stays
 * the canonical shareable URL — it is untouched and reuses the same
 * EventDetailView.
 */
export function EventPortalDetail({
  publicUrl,
  locale,
  onBack
}: {
  publicUrl: string
  locale: string
  onBack: () => void
}) {
  const { t } = useI18n()

  const { data, mutate, isLoading, error } = useSWR<{ event: EventDetailPayload }>(
    `/api/v1/events/public/${publicUrl}`,
    jsonFetcher,
    { revalidateOnFocus: false }
  )

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        {t('events.portal.back', { defaultValue: 'Back to events' })}
      </Button>

      {isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading', { defaultValue: 'Loading...' })}</p>
      )}

      {error && (
        <p className="text-sm text-muted-foreground">
          {t('events.portal.unavailable', { defaultValue: 'This event is not publicly available.' })}
        </p>
      )}

      {data?.event && (
        <EventDetailView
          event={data.event}
          locale={locale}
          onChanged={async () => {
            await mutate()
          }}
        />
      )}
    </div>
  )
}
