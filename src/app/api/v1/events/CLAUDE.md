# Events API

## Routes
- `GET/POST /api/v1/events` — management feed (`scope=mine|org:<id>|attending`) / create (DRAFT)
- `GET/PUT/DELETE /api/v1/events/[eventId]` — detail / update / cancel (published → soft CANCELLED)
- `POST /api/v1/events/[eventId]/publish` — DRAFT → PUBLISHED with validation (name, startsAt, location-or-online; cover optional)
- `POST /api/v1/events/[eventId]/rsvp` — idempotent RSVP upsert, fresh counts
- `POST/DELETE /api/v1/events/[eventId]/lists` — link/unlink lists (m:m)
- `POST/DELETE /api/v1/events/[eventId]/projects` — link/unlink projects (m:m)
- `GET/POST/DELETE /api/v1/events/[eventId]/staff` — door staff (SCANNER | MANAGER)
- `GET /api/v1/events/public` — public discovery (PUBLISHED + PUBLIC; from/to/q/near/category/project)
- `GET /api/v1/events/public/[publicUrl]` — allowlist-projected public payload
- `GET /api/v1/events/legacy` — redirect shim → `/api/v1/life-events` (removed next release)

## Life events (moved in Phase 8)
- `GET/POST /api/v1/life-events`, `PUT/DELETE /api/v1/life-events/[id]` — the pre-Phase-8 life-event API (`LifeEvent` model)

## Auth
Clerk auth for CRUD; public routes unauthenticated. Ownership via the ownership kit (`getViewerRole(userId, 'event', …)` — USER/ORG through the Phase 7 branch).

## Notes
- Timezone rule: `startsAt`/`endsAt` are UTC instants + IANA `timezone` for display (never wall-clock strings).
- Ticketing/attendance relations arrive in Phases 9/10 — no inverse fields declared here.
- Counts are computed with batched groupBy, never per-card.
- `PUT /events/[eventId]` uses `!== undefined` semantics for `venueName`/`coverDocumentId`/
  `flierDocumentId`/`capacity`: a string/number sets, `null` clears (the manage dialog sends
  `null` to remove a cover/flier).
- Event covers/fliers go through the attachments pipeline (`POST /api/v1/attachments` with
  `entityType: 'event'`); the UI consumes them via `GET /api/v1/attachments/[documentId]/file`
  and the manage dialog (`src/views/forms/manageEventForm.tsx`).

## Dependencies
- `src/lib/services/events` (eventService)
- `src/lib/services/social` (likes/comments `entityType: 'event'` — enabled in Phase 8)
