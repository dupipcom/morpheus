/**
 * CalDAV Service for Stalwart Mail
 * Fetches calendar availability via CalDAV (RFC 4791 / RFC 6638)
 * Authenticated via Clerk OIDC tokens against https://mail.dupip.com
 */

export { fetchCalendarAvailability } from './caldavService'
export type { BusySlot, CalendarAvailabilityResult } from './types'
