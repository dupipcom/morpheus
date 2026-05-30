/**
 * CalDAV Service – queries Stalwart Mail for calendar freebusy data.
 *
 * Stalwart exposes a standard CalDAV endpoint at:
 *   https://mail.dupip.com/dav/calendars/user/{username}@dpip.cc/default/
 *
 * Authentication is via ****** from Clerk OIDC (the same identity provider
 * configured in Stalwart).
 *
 * We use a REPORT request with calendar-query to fetch VEVENT components
 * within the requested time range, then extract busy periods.
 */

import type { BusySlot, CalendarAvailabilityResult } from './types'

const STALWART_BASE_URL = process.env.STALWART_CALDAV_URL || 'https://mail.dupip.com'

/**
 * Fetch calendar availability (busy slots) for a given user within a date range.
 *
 * @param username - The dpip.cc username (without @dpip.cc)
 * @param rangeStart - Start of the query window
 * @param rangeEnd - End of the query window
 * @param accessToken - Clerk OIDC JWT for authenticating to Stalwart
 */
export async function fetchCalendarAvailability(
  username: string,
  rangeStart: Date,
  rangeEnd: Date,
  accessToken: string
): Promise<CalendarAvailabilityResult> {
  const calendarUrl = `${STALWART_BASE_URL}/dav/calendars/user/${username}@dpip.cc/default/`

  const timeRangeStart = formatCalDAVDate(rangeStart)
  const timeRangeEnd = formatCalDAVDate(rangeEnd)

  // CalDAV REPORT request body (calendar-query with time-range filter)
  const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data>
      <c:comp name="VCALENDAR">
        <c:prop name="VERSION"/>
        <c:comp name="VEVENT">
          <c:prop name="SUMMARY"/>
          <c:prop name="DTSTART"/>
          <c:prop name="DTEND"/>
          <c:prop name="DURATION"/>
          <c:prop name="TRANSP"/>
        </c:comp>
      </c:comp>
    </c:calendar-data>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${timeRangeStart}" end="${timeRangeEnd}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`

  try {
    const response = await fetch(calendarUrl, {
      method: 'REPORT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': '1',
      },
      body: requestBody,
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { busy: [], error: 'Calendar authentication failed' }
      }
      if (response.status === 404) {
        // No calendar found – user may not have one set up
        return { busy: [] }
      }
      return { busy: [], error: `Calendar request failed: ${response.status}` }
    }

    const xml = await response.text()
    const busy = parseCalendarResponse(xml, rangeStart, rangeEnd)
    return { busy }
  } catch (error) {
    console.error('CalDAV fetch error:', error)
    return { busy: [], error: 'Failed to connect to calendar service' }
  }
}

/**
 * Parse the CalDAV multistatus XML response and extract busy time slots.
 * Only includes events where TRANSP != TRANSPARENT (i.e., they block time).
 */
function parseCalendarResponse(xml: string, rangeStart: Date, rangeEnd: Date): BusySlot[] {
  const slots: BusySlot[] = []

  // Extract all calendar-data content from the multistatus response
  const calDataRegex = /<(?:[A-Za-z]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?calendar-data>/gi
  let calMatch: RegExpExecArray | null

  while ((calMatch = calDataRegex.exec(xml)) !== null) {
    const icalData = decodeXmlEntities(calMatch[1])
    const events = extractEvents(icalData)

    for (const event of events) {
      // Skip transparent events (they don't block availability)
      if (event.transp === 'TRANSPARENT') continue

      const start = parseICalDate(event.dtstart)
      const end = event.dtend
        ? parseICalDate(event.dtend)
        : event.duration
          ? addDuration(start, event.duration)
          : new Date(start.getTime() + 3600000) // default 1h

      // Only include events that overlap with our query range
      if (end > rangeStart && start < rangeEnd) {
        slots.push({
          start: start.toISOString(),
          end: end.toISOString(),
        })
      }
    }
  }

  // Sort by start time
  slots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  return slots
}

interface ParsedEvent {
  dtstart: string
  dtend?: string
  duration?: string
  transp?: string
  summary?: string
}

function extractEvents(icalData: string): ParsedEvent[] {
  const events: ParsedEvent[] = []
  const eventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi
  let match: RegExpExecArray | null

  while ((match = eventRegex.exec(icalData)) !== null) {
    const block = match[1]
    events.push({
      dtstart: extractProperty(block, 'DTSTART') || '',
      dtend: extractProperty(block, 'DTEND') || undefined,
      duration: extractProperty(block, 'DURATION') || undefined,
      transp: extractProperty(block, 'TRANSP') || undefined,
      summary: extractProperty(block, 'SUMMARY') || undefined,
    })
  }
  return events
}

/**
 * Extract a property value from an iCal block.
 * Handles properties with parameters (e.g., DTSTART;TZID=...:20240101T090000)
 */
function extractProperty(block: string, name: string): string | null {
  const regex = new RegExp(`^${name}(?:;[^:]*)?:(.+)$`, 'mi')
  const match = block.match(regex)
  return match ? unfoldICalLine(match[1].trim()) : null
}

/** Unfold iCal continuation lines (RFC 5545 §3.1) */
function unfoldICalLine(line: string): string {
  return line.replace(/\r?\n[ \t]/g, '')
}

/** Parse an iCal date/datetime string into a JS Date */
function parseICalDate(value: string): Date {
  // Format: 20240101T090000Z or 20240101T090000 or 20240101
  const cleaned = value.replace(/[^0-9TZ]/g, '')

  if (cleaned.length === 8) {
    // Date only: YYYYMMDD
    const y = parseInt(cleaned.slice(0, 4))
    const m = parseInt(cleaned.slice(4, 6)) - 1
    const d = parseInt(cleaned.slice(6, 8))
    return new Date(Date.UTC(y, m, d))
  }

  // DateTime: YYYYMMDDTHHmmss[Z]
  const y = parseInt(cleaned.slice(0, 4))
  const m = parseInt(cleaned.slice(4, 6)) - 1
  const d = parseInt(cleaned.slice(6, 8))
  const h = parseInt(cleaned.slice(9, 11))
  const min = parseInt(cleaned.slice(11, 13))
  const s = parseInt(cleaned.slice(13, 15)) || 0

  if (cleaned.endsWith('Z')) {
    return new Date(Date.UTC(y, m, d, h, min, s))
  }
  // No timezone indicator – treat as UTC for availability purposes
  return new Date(Date.UTC(y, m, d, h, min, s))
}

/** Add an iCal DURATION (e.g. PT1H30M, P1D) to a date */
function addDuration(date: Date, duration: string): Date {
  const result = new Date(date)
  const match = duration.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/)
  if (!match) return new Date(result.getTime() + 3600000) // fallback 1h

  const days = parseInt(match[1] || '0')
  const hours = parseInt(match[2] || '0')
  const minutes = parseInt(match[3] || '0')
  const seconds = parseInt(match[4] || '0')

  result.setUTCDate(result.getUTCDate() + days)
  result.setUTCHours(result.getUTCHours() + hours)
  result.setUTCMinutes(result.getUTCMinutes() + minutes)
  result.setUTCSeconds(result.getUTCSeconds() + seconds)
  return result
}

/** Format a Date to CalDAV time-range format (YYYYMMDDTHHmmssZ) */
function formatCalDAVDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Decode XML entities in calendar-data content */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}
