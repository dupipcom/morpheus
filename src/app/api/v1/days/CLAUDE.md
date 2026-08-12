# Days API

## Routes
- `GET /api/v1/days`
- `POST /api/v1/days`

## Auth
Uses `getAuthenticatedUser()` from `src/lib/services/auth` (Clerk → internal `User`).

## GET
Fetches day records for the current user.

Query params:
- `date` (single day; returns `{ day }` or `{ day: null }`)
- `year` (list by year)
- `startDate` + `endDate` (list by range)

Returns `{ days: [...] }` for list queries, transformed via `transformDayForAnalytics`.

## POST
Creates or updates a day for the current user. Body:
```json
{ "date": "YYYY-MM-DD", "mood": {...}, "contacts": [...], "things": [...], "lifeEvents": [...] }
```

Behavior:
- Requires `date`.
- Extracts person/thing/event IDs and quality mappings, builds analysis data, parses mood updates.
- Updates existing day (merges mood/analysis) or creates a new one with financial snapshots (`balance`, `stash`, `equity`) and date periods.

## Dependencies
- `src/lib/services/day` (transforms and helpers)
- Prisma models: `Day`, `User`
