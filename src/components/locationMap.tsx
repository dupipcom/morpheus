'use client'

import React from 'react'
import Image from 'next/image'
import { ExternalLink } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import type { PlaceLocation } from '@/components/placePicker'

interface LocationMapProps {
  location: PlaceLocation | null
  zoom?: number
}

const DEFAULT_ZOOM = 14

/**
 * Static-first map: renders the Google Static Maps image proxied through
 * /api/v1/places/staticmap (the API key stays server-side) plus an
 * "Open in Maps" link. No map JS library, no client key, no bundle cost.
 */
export const LocationMap = ({ location, zoom = DEFAULT_ZOOM }: LocationMapProps) => {
  const { t } = useI18n()

  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return null
  }

  const lat = location.lat
  const lng = location.lng
  const staticMapSrc = `/api/v1/places/staticmap?lat=${lat}&lng=${lng}&zoom=${zoom}&size=640x360`
  const openInMapsHref = `https://www.google.com/maps?q=${lat},${lng}`

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-lg border border-border/60">
        <Image
          src={staticMapSrc}
          alt={location.name || t('components.locationMap.mapAlt', { defaultValue: 'Map' })}
          width={640}
          height={360}
          className="h-auto w-full object-cover"
          unoptimized
        />
      </div>
      <a
        href={openInMapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-primary no-underline transition-colors hover:text-primary/80"
      >
        <ExternalLink className="h-3 w-3 flex-shrink-0" />
        {t('components.locationMap.openInMaps', { defaultValue: 'Open in Maps' })}
      </a>
    </div>
  )
}
