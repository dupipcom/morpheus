'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlacePicker, type PlaceLocation } from '@/components/placePicker'
import { useI18n } from '@/lib/contexts/i18n'

/**
 * Venue value for the event forms: the canonical PlaceLocation fields plus
 * name/address that may exist WITHOUT coordinates (typed before a search or
 * coordinate entry). The parent decides what to persist (see the forms'
 * buildFields — location only when lat/lng are present, venueName always).
 */
export interface EventVenueValue {
  lat?: number
  lng?: number
  placeId?: string
  name?: string
  address?: string
}

/**
 * Venue section shared by addEventForm and manageEventForm: venue name +
 * address as plain text fields, plus the place search/coordinates picker.
 *
 * Coordinates are a fallback for when Google Places cannot find the venue, so
 * the modes compose instead of replacing each other: picking a place fills
 * the text fields (typed details win when the pick only carries coordinates),
 * and clearing the location keeps whatever name/address the user typed.
 */
export const EventVenueFields = ({
  value,
  onChange,
  nameInputId = 'event-venue-name',
  addressInputId = 'event-venue-address'
}: {
  value: EventVenueValue | null
  onChange: (value: EventVenueValue | null) => void
  nameInputId?: string
  addressInputId?: string
}) => {
  const { t } = useI18n()

  // Text fields edit the same merged value as the picker; a value with
  // nothing but empty strings collapses back to null.
  const setField = (patch: Partial<EventVenueValue>) => {
    const merged = { ...(value ?? {}), ...patch }
    const hasCoordinates = typeof merged.lat === 'number' && typeof merged.lng === 'number'
    const hasText = Boolean(merged.name?.trim() || merged.address?.trim())
    onChange(hasCoordinates || hasText ? merged : null)
  }

  const handlePlaceChange = (place: PlaceLocation | null) => {
    if (!place) {
      // Removing the location chip keeps the typed name/address.
      const rest: EventVenueValue = {}
      if (value?.name?.trim()) rest.name = value.name
      if (value?.address?.trim()) rest.address = value.address
      onChange(rest.name || rest.address ? rest : null)
      return
    }
    // A picked Google place wins over typed details; manual coordinates
    // (no name/address on the payload) keep whatever the user typed.
    onChange({
      ...place,
      name: place.name?.trim() || value?.name,
      address: place.address?.trim() || value?.address
    })
  }

  // The picker chip only makes sense once coordinates exist; with just a
  // typed name/address the search box stays visible.
  const pickerValue: PlaceLocation | null =
    value && typeof value.lat === 'number' && typeof value.lng === 'number'
      ? { lat: value.lat, lng: value.lng, name: value.name, address: value.address }
      : null

  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor={nameInputId}>{t('events.form.venue', { defaultValue: 'Venue name' })}</Label>
        <Input
          id={nameInputId}
          value={value?.name ?? ''}
          onChange={(e) => setField({ name: e.target.value })}
          placeholder={t('events.form.venuePlaceholder', { defaultValue: 'Venue name...' })}
        />
      </div>
      <div>
        <Label htmlFor={addressInputId}>
          {t('events.form.venueAddress', { defaultValue: 'Address (optional)' })}
        </Label>
        <Input
          id={addressInputId}
          value={value?.address ?? ''}
          onChange={(e) => setField({ address: e.target.value })}
        />
      </div>
      <div>
        <Label>{t('events.form.venueLocation', { defaultValue: 'Location' })}</Label>
        <PlacePicker value={pickerValue} onChange={handlePlaceChange} inlineResults />
        <p className="text-xs text-muted-foreground">
          {t('events.form.venueLocationHint', {
            defaultValue: 'Search for the venue, or use Enter coordinates when it is not found.'
          })}
        </p>
      </div>
    </div>
  )
}
