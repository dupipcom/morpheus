'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils/utils'
import { useI18n } from '@/lib/contexts/i18n'

/** Canonical location JSON used everywhere (notes, jobs, events, attachments). */
export interface PlaceLocation {
  lat: number
  lng: number
  placeId?: string
  name?: string
  address?: string
}

interface PlacePrediction {
  placeId: string
  description: string
}

interface PlacePickerProps {
  value?: PlaceLocation | null
  onChange: (loc: PlaceLocation | null) => void
  compact?: boolean
  /**
   * Render results as a plain absolute dropdown instead of a Radix Popover.
   * REQUIRED when this picker lives inside another Popover: a nested Radix
   * layer portals outside the outer popover, and every interaction with it
   * dismisses the outer popover (making the search box unusable).
   */
  inlineResults?: boolean
}

const MIN_QUERY_LENGTH = 3
const DEBOUNCE_MS = 300

/**
 * Own input + debounced result list over /api/v1/places/autocomplete,
 * keyboard navigable, with "use my current location" and a manual
 * lat/lng escape hatch. Emits the canonical PlaceLocation shape.
 */
export const PlacePicker = ({ value, onChange, compact = false, inlineResults = false }: PlacePickerProps) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlacePrediction[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState(-1)
  const [manualMode, setManualMode] = useState(false)
  const [latInput, setLatInput] = useState('')
  const [lngInput, setLngInput] = useState('')
  const [locating, setLocating] = useState(false)

  // One session token per picker lifetime so billable session pooling works
  const sessionTokenRef = useRef<string | undefined>(undefined)
  if (!sessionTokenRef.current) {
    sessionTokenRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `places-${Date.now()}`
  }

  // Debounced search (300 ms), min 3 chars; abort in-flight requests
  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([])
      setOpen(false)
      setSearching(false)
      setError(null)
      return
    }
    setSearching(true)
    setError(null)
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/places/autocomplete?input=${encodeURIComponent(q)}&sessionToken=${encodeURIComponent(sessionTokenRef.current || '')}`,
          { signal: controller.signal }
        )
        if (!res.ok) {
          setError(t('components.placePicker.searchError', { defaultValue: 'Search failed. Try again.' }))
          setResults([])
          return
        }
        const data = (await res.json()) as { predictions?: PlacePrediction[] }
        setResults(data.predictions || [])
        setHighlighted(-1)
        setOpen(true)
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          setError(t('components.placePicker.searchError', { defaultValue: 'Search failed. Try again.' }))
        }
      } finally {
        setSearching(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, t])

  const pickResult = useCallback(
    async (prediction: PlacePrediction) => {
      try {
        const res = await fetch(
          `/api/v1/places/details?placeId=${encodeURIComponent(prediction.placeId)}&sessionToken=${encodeURIComponent(sessionTokenRef.current || '')}`
        )
        if (!res.ok) {
          setError(t('components.placePicker.detailsError', { defaultValue: 'Could not load this place.' }))
          return
        }
        const data = (await res.json()) as { location?: PlaceLocation }
        if (data.location) {
          onChange(data.location)
          setQuery('')
          setResults([])
          setOpen(false)
          setError(null)
        } else {
          setError(t('components.placePicker.detailsError', { defaultValue: 'Could not load this place.' }))
        }
      } catch {
        setError(t('components.placePicker.detailsError', { defaultValue: 'Could not load this place.' }))
      }
    },
    [onChange, t]
  )

  const useCurrentLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError(t('components.placePicker.geolocationError', { defaultValue: 'Location is not available on this device.' }))
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Raw lat/lng only — no reverse geocoding backend, the map and API accept it
        onChange({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocating(false)
        setQuery('')
        setOpen(false)
      },
      () => {
        setLocating(false)
        setError(t('components.placePicker.geolocationError', { defaultValue: 'Location is not available on this device.' }))
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30_000 }
    )
  }, [onChange, t])

  const applyManualCoordinates = useCallback(() => {
    const lat = parseFloat(latInput)
    const lng = parseFloat(lngInput)
    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
      setError(t('components.placePicker.invalidCoordinates', { defaultValue: 'Enter valid latitude and longitude.' }))
      return
    }
    onChange({ lat, lng })
    setManualMode(false)
    setLatInput('')
    setLngInput('')
    setError(null)
  }, [latInput, lngInput, onChange, t])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlighted((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = highlighted >= 0 && highlighted < results.length ? results[highlighted] : results[0]
      pickResult(target)
    }
  }

  const chipLabel = value?.name || value?.address || (value
    ? t('components.placePicker.coordinates', {
        defaultValue: '{lat}, {lng}',
        lat: value.lat.toFixed(6),
        lng: value.lng.toFixed(6),
      })
    : '')

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 text-sm">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="flex-1 min-w-0 truncate">
            {value.name && value.address ? (
              <>
                {value.name}
                <span className="text-muted-foreground"> · {value.address}</span>
              </>
            ) : (
              chipLabel
            )}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t('components.placePicker.removeLocation', { defaultValue: 'Remove location' })}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          {inlineResults ? (
            <div
              className="relative"
              onBlur={(e) => {
                // Close when focus leaves both the input and the results list
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setOpen(false)
                }
              }}
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (results.length > 0) setOpen(true)
                }}
                placeholder={t('components.placePicker.placeholder', { defaultValue: 'Search for a place...' })}
                role="combobox"
                aria-expanded={open}
                aria-controls="place-picker-results"
                aria-autocomplete="list"
                aria-label={t('components.placePicker.placeholder', { defaultValue: 'Search for a place...' })}
              />
              {open && (
                <div
                  id="place-picker-results"
                  className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
                >
                  {searching ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      {t('components.placePicker.searching', { defaultValue: 'Searching...' })}
                    </p>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      {t('components.placePicker.noResults', { defaultValue: 'No results found' })}
                    </p>
                  ) : (
                    <ul role="listbox" aria-label={t('components.placePicker.resultsLabel', { defaultValue: 'Place results' })}>
                      {results.map((r, i) => (
                        <li key={r.placeId}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={i === highlighted}
                            className={cn(
                              'w-full rounded-sm px-3 py-2 text-left text-sm transition-colors',
                              i === highlighted ? 'bg-muted' : 'hover:bg-muted'
                            )}
                            onMouseEnter={() => setHighlighted(i)}
                            // Keep focus in the input so the wrapper's blur
                            // check never closes the list before the click
                            // fires (Safari doesn't focus buttons on mousedown).
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickResult(r)}
                          >
                            {r.description}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (results.length > 0) setOpen(true)
                  }}
                  placeholder={t('components.placePicker.placeholder', { defaultValue: 'Search for a place...' })}
                  role="combobox"
                  aria-expanded={open}
                  aria-controls="place-picker-results"
                  aria-autocomplete="list"
                  aria-label={t('components.placePicker.placeholder', { defaultValue: 'Search for a place...' })}
                />
              </PopoverTrigger>
              <PopoverContent
                id="place-picker-results"
                align="start"
                className="w-(--radix-popover-trigger-width) p-1"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {searching ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    {t('components.placePicker.searching', { defaultValue: 'Searching...' })}
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    {t('components.placePicker.noResults', { defaultValue: 'No results found' })}
                  </p>
                ) : (
                  <ul className="max-h-60 overflow-y-auto" role="listbox" aria-label={t('components.placePicker.resultsLabel', { defaultValue: 'Place results' })}>
                    {results.map((r, i) => (
                      <li key={r.placeId}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === highlighted}
                          className={cn(
                            'w-full rounded-sm px-3 py-2 text-left text-sm transition-colors',
                            i === highlighted ? 'bg-muted' : 'hover:bg-muted'
                          )}
                          onMouseEnter={() => setHighlighted(i)}
                          // Keep focus in the input so the popover never
                          // dismisses the list before the click fires.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickResult(r)}
                        >
                          {r.description}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </PopoverContent>
            </Popover>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          {!compact && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={useCurrentLocation}
                disabled={locating}
              >
                {locating
                  ? t('components.placePicker.locating', { defaultValue: 'Locating...' })
                  : t('components.placePicker.useCurrentLocation', { defaultValue: 'Use my current location' })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setManualMode((m) => !m)}
              >
                {t('components.placePicker.enterCoordinates', { defaultValue: 'Enter coordinates' })}
              </Button>
            </div>
          )}

          {manualMode && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-28 space-y-1">
                <label htmlFor="place-picker-lat" className="text-xs text-muted-foreground">
                  {t('components.placePicker.latitude', { defaultValue: 'Latitude' })}
                </label>
                <Input
                  id="place-picker-lat"
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  placeholder="41.38"
                />
              </div>
              <div className="w-28 space-y-1">
                <label htmlFor="place-picker-lng" className="text-xs text-muted-foreground">
                  {t('components.placePicker.longitude', { defaultValue: 'Longitude' })}
                </label>
                <Input
                  id="place-picker-lng"
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                  placeholder="2.17"
                />
              </div>
              <Button type="button" size="sm" onClick={applyManualCoordinates}>
                {t('components.placePicker.applyCoordinates', { defaultValue: 'Apply' })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
