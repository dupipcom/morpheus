'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Clock, CalendarCheck, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils/utils'
import { useI18n } from '@/lib/contexts/i18n'
import { DateRange } from 'react-day-picker'
import { SignUpButton } from '@clerk/nextjs'

interface BusySlot {
  start: string
  end: string
}

interface MeetMeRowProps {
  preferredTime: string
  duration: string
  availability: string
  startDate: Date | undefined
  endDate: Date | undefined
  onPreferredTimeChange: (value: string) => void
  onDurationChange: (value: string) => void
  onAvailabilityChange: (value: string) => void
  onDateRangeChange: (start: Date | undefined, end: Date | undefined) => void
  className?: string
  /** When set, enables booking mode for viewing another user's profile */
  bookingTargetUsername?: string
  /** Whether the current viewer is logged in */
  isLoggedIn?: boolean
}

const TIME_SLOTS = ['morning', 'afternoon', 'evening'] as const
const DURATIONS = ['15', '30', '45', '60'] as const
const AVAILABILITY_OPTIONS = ['weekdays', 'weekends', 'everyday'] as const

function getSlotHighlight(slot: string, preferredTime: string): string {
  if (slot === preferredTime) {
    return 'bg-[#c8f7c8] dark:bg-[#2a5a2a] text-foreground'
  }
  return 'bg-muted/40 text-muted-foreground'
}

function getTimeRangeForSlot(slot: string, date: Date): { start: Date; end: Date } {
  const d = new Date(date)
  d.setMinutes(0, 0, 0)
  switch (slot) {
    case 'morning':
      d.setHours(9)
      break
    case 'afternoon':
      d.setHours(14)
      break
    case 'evening':
      d.setHours(18)
      break
    default:
      d.setHours(10)
  }
  const start = new Date(d)
  const end = new Date(d)
  end.setMinutes(end.getMinutes() + 30)
  return { start, end }
}

export function MeetMeRow({
  preferredTime,
  duration,
  availability,
  startDate,
  endDate,
  onPreferredTimeChange,
  onDurationChange,
  onAvailabilityChange,
  onDateRangeChange,
  className,
  bookingTargetUsername,
  isLoggedIn = true,
}: MeetMeRowProps) {
  const { t } = useI18n()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingDate, setBookingDate] = useState<Date | undefined>(undefined)
  const [bookingMessage, setBookingMessage] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingResult, setBookingResult] = useState<{ success?: boolean; error?: string } | null>(null)
  const [busySlots, setBusySlots] = useState<BusySlot[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(null)

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Fetch calendar availability when a booking date is selected
  const fetchAvailability = useCallback(async (date: Date) => {
    if (!bookingTargetUsername) return

    setAvailabilityLoading(true)
    setAvailabilityWarning(null)

    // Query the full day in UTC
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    try {
      const params = new URLSearchParams({
        username: bookingTargetUsername,
        start: dayStart.toISOString(),
        end: dayEnd.toISOString(),
      })
      const response = await fetch(`/api/v1/meet-me/availability?${params}`)
      if (response.ok) {
        const data = await response.json()
        setBusySlots(data.busy || [])
        if (data.warning) {
          setAvailabilityWarning(data.warning)
        }
      } else {
        setBusySlots([])
        setAvailabilityWarning(t('profile.meetMe.calendarUnavailable'))
      }
    } catch {
      setBusySlots([])
      setAvailabilityWarning(t('profile.meetMe.calendarUnavailable'))
    } finally {
      setAvailabilityLoading(false)
    }
  }, [bookingTargetUsername, t])

  // Re-fetch availability when the booking date changes
  useEffect(() => {
    if (bookingDate && bookingTargetUsername) {
      fetchAvailability(bookingDate)
    } else {
      setBusySlots([])
      setAvailabilityWarning(null)
    }
  }, [bookingDate, bookingTargetUsername, fetchAvailability])

  const handleRangeSelect = (range: DateRange | undefined) => {
    onDateRangeChange(range?.from, range?.to)
  }

  const formatWindow = () => {
    if (startDate && endDate) {
      const fmt = (d: Date) =>
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      return `${fmt(startDate)} — ${fmt(endDate)}`
    }
    return t('profile.meetMe.noWindowSet')
  }

  const handleBookMeeting = async () => {
    if (!bookingTargetUsername || !bookingDate || !preferredTime) return

    setBookingLoading(true)
    setBookingResult(null)

    const durationMinutes = parseInt(duration || '30', 10)
    const { start, end } = getTimeRangeForSlot(preferredTime, bookingDate)
    end.setTime(start.getTime() + durationMinutes * 60 * 1000)

    try {
      const response = await fetch('/api/v1/meet-me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileUsername: bookingTargetUsername,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          message: bookingMessage,
        }),
      })

      if (response.ok) {
        setBookingResult({ success: true })
        setBookingMessage('')
        setBookingDate(undefined)
      } else {
        const data = await response.json()
        setBookingResult({ error: data.error || 'Failed to book meeting' })
      }
    } catch (error) {
      console.error('Failed to book meeting:', error)
      setBookingResult({ error: 'Network error' })
    } finally {
      setBookingLoading(false)
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-4 h-[80px] w-full',
        className
      )}
    >
      {/* Time slot indicators */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {TIME_SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => onPreferredTimeChange(slot)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer',
              getSlotHighlight(slot, preferredTime)
            )}
          >
            {t(`profile.meetMe.${slot}`)}
          </button>
        ))}

        {/* Compact info */}
        <span className="text-xs text-muted-foreground ml-2 truncate hidden sm:inline">
          {duration ? `${duration}min` : ''}{availability ? ` · ${t(`profile.meetMe.${availability}`)}` : ''}
          {startDate && endDate ? ` · ${formatWindow()}` : ''}
        </span>

        <span className="text-[10px] text-muted-foreground ml-auto mr-2 hidden md:inline">
          {userTimezone}
        </span>
      </div>

      {/* Pick time button with popover (settings mode) */}
      {!bookingTargetUsername && (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              {t('profile.meetMe.pickTime')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="end">
            <div className="space-y-4">
              {/* Duration */}
              <div className="space-y-1">
                <Label className="text-xs">{t('profile.meetMe.duration')}</Label>
                <Select value={duration} onValueChange={onDurationChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t('profile.meetMe.selectDuration')} />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d} {t('profile.meetMe.minutes')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Availability */}
              <div className="space-y-1">
                <Label className="text-xs">{t('profile.meetMe.availability')}</Label>
                <Select value={availability} onValueChange={onAvailabilityChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t('profile.meetMe.selectAvailability')} />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABILITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {t(`profile.meetMe.${opt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date range (window) */}
              <div className="space-y-1">
                <Label className="text-xs">{t('profile.meetMe.window')}</Label>
                <Calendar
                  mode="range"
                  selected={startDate && endDate ? { from: startDate, to: endDate } : undefined}
                  onSelect={handleRangeSelect}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  numberOfMonths={1}
                />
              </div>

              <p className="text-[10px] text-muted-foreground">
                {t('profile.meetMe.timezoneNote', { timezone: userTimezone })}
              </p>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Book meeting button (booking mode - viewing another user's profile) */}
      {bookingTargetUsername && isLoggedIn && (
        <Popover open={bookingOpen} onOpenChange={setBookingOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              <CalendarCheck className="mr-1.5 h-3.5 w-3.5" />
              {t('profile.meetMe.bookMeeting')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="end">
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">{t('profile.meetMe.selectDate')}</Label>
                <Calendar
                  mode="single"
                  selected={bookingDate}
                  onSelect={setBookingDate}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  numberOfMonths={1}
                />
              </div>

              {/* Calendar availability display */}
              {bookingDate && (
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    {t('profile.meetMe.calendarAvailability')}
                    {availabilityLoading && (
                      <span className="text-muted-foreground animate-pulse">…</span>
                    )}
                  </Label>
                  {availabilityWarning && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {availabilityWarning}
                    </p>
                  )}
                  {!availabilityLoading && busySlots.length === 0 && !availabilityWarning && (
                    <p className="text-[10px] text-green-600 dark:text-green-400">
                      {t('profile.meetMe.dayFree')}
                    </p>
                  )}
                  {!availabilityLoading && busySlots.length > 0 && (
                    <div className="space-y-0.5 max-h-24 overflow-y-auto">
                      {busySlots.map((slot, idx) => {
                        const startTime = new Date(slot.start).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: userTimezone,
                        })
                        const endTime = new Date(slot.end).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: userTimezone,
                        })
                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            <span>{t('profile.meetMe.busySlot', { start: startTime, end: endTime })}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">{t('profile.meetMe.message')}</Label>
                <Input
                  value={bookingMessage}
                  onChange={(e) => setBookingMessage(e.target.value)}
                  placeholder={t('profile.meetMe.messagePlaceholder')}
                  className="h-8 text-xs"
                />
              </div>

              {bookingResult?.success && (
                <p className="text-xs text-green-600">{t('profile.meetMe.bookingSuccess')}</p>
              )}
              {bookingResult?.error && (
                <p className="text-xs text-red-600">{bookingResult.error}</p>
              )}

              <Button
                size="sm"
                className="w-full"
                disabled={!bookingDate || bookingLoading}
                onClick={handleBookMeeting}
              >
                {bookingLoading ? t('profile.meetMe.booking') : t('profile.meetMe.confirmBooking')}
              </Button>

              <p className="text-[10px] text-muted-foreground">
                {t('profile.meetMe.timezoneNote', { timezone: userTimezone })}
              </p>
            </div>
          </PopoverContent>
        </Popover>
      )}
      {/* Sign-up CTA for non-logged-in users in booking mode */}
      {bookingTargetUsername && !isLoggedIn && (
        <SignUpButton>
          <Button variant="outline" size="sm" className="shrink-0">
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            {t('profile.meetMe.pickTime')}
          </Button>
        </SignUpButton>
      )}
    </div>
  )
}
