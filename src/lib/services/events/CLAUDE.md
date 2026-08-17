# Events Service

## Purpose

Public `Event` entity (Phase 8): pages, discovery at `/app/be/events`, RSVP, list/project links, staff, likes and notes-as-comments discussion. Ticketing is deliberately NOT here (Phase 9). The pre-Phase-8 life-event model was renamed `LifeEvent` (migration 0027); its API lives at `/api/v1/life-events`.

## Files

- `eventService.ts` — CRUD, publish validation, discovery (near bounding box computed server-side), allowlist-projected public payload, RSVP upsert, link/staff mutations, soft cancel
- `index.ts` — barrel re-export

## Key Exports

| Export | Purpose |
|---|---|
| `createEvent` | DRAFT + `publicUrl` (always generated) + proceeds wallet (kind EVENT); ORG ownership honours `assertOrgManagerRole` |
| `publishEvent` | DRAFT → PUBLISHED with validation (name, startsAt, location-or-online, cover) |
| `listEvents` | Management feed: `scope=mine|org:<id>|attending`, status filter, cursor |
| `listPublicEvents` | Public discovery (PUBLISHED + PUBLIC only); `near=lat,lng,radiusKm`, `project`, `category`, `q` filters; batched RSVP counts |
| `getPublicEvent` | Allowlist-projected payload + viewer RSVP/like block + host (user or org) + linked lists/projects |
| `upsertRsvp` | Idempotent INTERESTED/GOING; NOT_GOING removes the row; returns fresh counts |
| `setListLink` / `setProjectLink` | m:m link/unlink |
| `setStaff` | Door/gate staff upsert/remove (used by Phase 10) |
| `cancelEvent` | Published → CANCELLED (soft); drafts hard-delete |

## Consumers

- `src/app/api/v1/events/**`
- Phase 9 (ticketing) and Phase 10 (attendance) will add their relations here

## Notes

- Timezone rule: `startsAt`/`endsAt` are UTC instants + IANA `timezone` for display (never wall-clock strings).
- Counts are computed with batched `groupBy`, never per-card in the UI.

## Cross-References

- `src/app/api/v1/events/CLAUDE.md`
- `src/lib/services/social` (likes/comments `entityType: 'event'`)
- `src/lib/services/ownership` (USER/ORG via the Phase 7 branch)
- `src/lib/services/CLAUDE.md`
