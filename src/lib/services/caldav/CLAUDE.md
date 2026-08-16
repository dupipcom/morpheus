# CalDAV Service

## Purpose

Queries Stalwart Mail's CalDAV endpoint (`https://mail.dupip.com/dav/calendars/user/{username}@dpip.cc/default/`) for freebusy data using a `REPORT` calendar-query with a time-range filter, then extracts busy slots from VEVENT components. Authenticated via a Clerk OIDC bearer token (same IdP as Stalwart). Backs calendar-availability features (meet-me).

## Files

- `caldavService.ts` — REPORT request builder, multistatus XML parsing, iCal/VEVENT extraction, busy-slot computation
- `index.ts` — barrel: re-exports `fetchCalendarAvailability` + types
- `types.ts` — `BusySlot` and `CalendarAvailabilityResult` interfaces

## Key Exports

| Export | Purpose |
|---|---|
| `fetchCalendarAvailability(username, rangeStart, rangeEnd, accessToken)` | fetch busy slots for a dpip.cc user over a window; returns `{ busy, error? }` — never throws |
| `BusySlot` | `{ start, end }` ISO-8601 strings |
| `CalendarAvailabilityResult` | `{ busy: BusySlot[], error?: string }` |

## Consumers

- `src/app/api/v1/meet-me/availability/route.ts` — sole consumer

## Cross-References

- `src/app/api/v1/meet-me/CLAUDE.md`
- `src/lib/services/CLAUDE.md`

## Notes

- Graceful degradation: 404 → empty busy (no calendar set up), 401/403 → `'Calendar authentication failed'`.
- `TRANSP=TRANSPARENT` events are skipped; events without DTEND/DURATION default to 1h.
- Base URL from `STALWART_CALDAV_URL` env var, defaulting to `https://mail.dupip.com`.
