# Phase 8 — Events core

**Goal:** a real `Event` entity with pages, discovery at `/app/be/events`, many-to-many links to
lists, media, location/map, social actions and notes-as-comments. Ticketing is deliberately **not**
here — it lands in Phase 9 on top of this.

Depends on: Phase 3 (social/public-page kits), Phase 4 (media + places + map), Phase 7 (org owner),
Phase 5 (public list surface it links to).

## 8.1 Naming collision — resolve first

The current `Event` model is a *life event* (name + quality, referenced from tasks via
`EventReference`, from notes via `noteIds`, from `Day.eventIds`, and from `Comment.eventId`;
`GET /api/v1/events` literally returns `lifeEvents`). It is unrelated to public events and must not
be overloaded.

**Resolution:** introduce `LifeEvent` (its own collection) as the home of today's data, and free
the `Event` name for the new model.

- `0027-split-life-events.js`: copy every document from the `Event` collection into `LifeEvent`
  (preserving `_id`), then rewrite **every** inbound reference:
  `Note.eventIds → lifeEventIds`, `Document.eventIds → lifeEventIds`, `Day.eventIds → lifeEventIds`,
  `Comment.eventId → lifeEventId` (the real relation — `Comment.entityType` is a *secondary*
  polymorphic field, so both the scalar relation and any `entityType: 'event'` rows are migrated),
  `Task.events EmbeddedType[]` left as-is (it stores `{ id, name }` snapshots whose ids still
  resolve against `LifeEvent`). Finally delete the copied source documents.
  Idempotent: keyed on "a `LifeEvent` with this `_id` already exists".
- Schema side: `LifeEvent` gains `comments Comment[]`, `Day.lifeEventIds`, `Note.lifeEventIds`,
  `Document.lifeEventIds`; `Comment` gains `lifeEventId`/`lifeEvent` and keeps `eventId`/`event`
  pointing at the **new** `Event`.
- Routing: life events move to `/api/v1/life-events`. The legacy `/api/v1/events` path cannot both
  redirect and host the new API, so the new events API is mounted at `/api/v1/events` **only after**
  the legacy consumers are updated in the same PR; the redirect shim is
  `/api/v1/events/legacy` → `/api/v1/life-events` for any out-of-tree caller, documented as
  removed next release. `lifeEventCombobox` and task references are updated in this PR.

## 8.2 Model

```prisma
model Event {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  // Identity
  name          String
  publicUrl     String   @unique           // slug-<id4>, ALWAYS generated at creation (never null:
                                           // Prisma-on-Mongo cannot declare a sparse unique index,
                                           // so multiple nulls would collide). Draft events simply
                                           // 404 publicly because of `status`, not a missing slug.
  summary       String?                    // one-liner for cards/OG
  description   String?                   // long form; inline links rendered with LinkPreview
  status        String   @default("DRAFT") // DRAFT | PUBLISHED | CANCELLED | COMPLETED
  visibility    Visibility @default(PRIVATE)
  // When
  startsAt      DateTime
  endsAt        DateTime?
  timezone      String   @default("UTC")   // IANA; the event's own wall clock
  doorsAt       DateTime?
  // Where
  isOnline      Boolean  @default(false)
  onlineUrl     String?
  location      Json?                      // { lat, lng, placeId?, name?, address? }
  venueName     String?
  // Media
  coverDocumentId String? @db.ObjectId
  flierDocumentId String? @db.ObjectId
  // Capacity & money (used by Phase 9)
  capacity      Int?
  currency      String   @default("DPIP")
  walletId      String?  @db.ObjectId      // proceeds wallet (kind: EVENT)
  // Ownership
  ownerType     String   @default("USER")  // USER | ORG
  userId        String   @db.ObjectId      // creator/steward
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  orgId         String?  @db.ObjectId
  org           Organization? @relation(fields: [orgId], references: [id])
  // Relations
  listIds       String[] @default([]) @db.ObjectId
  lists         List[]   @relation("EventLists", fields: [listIds], references: [id])
  rsvps         EventRsvp[]
  staff         EventStaff[]
  comments      Comment[]
  noteIds       String[] @default([]) @db.ObjectId
  documentIds   String[] @default([]) @db.ObjectId
  categories    Category[]
  tags          String[] @default([])
  @@index([status, startsAt])
  @@index([ownerType, orgId])
  @@index([startsAt])
}

model EventRsvp {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  status    String   // INTERESTED | GOING | NOT_GOING
  eventId   String   @db.ObjectId
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId    String   @db.ObjectId
  user      User     @relation("EventRsvps", fields: [userId], references: [id], onDelete: Cascade)
  @@unique([eventId, userId])
  @@index([eventId, status])
}

model EventStaff {          // door/gate permissions (used by Phase 10)
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt DateTime @default(now())
  eventId   String   @db.ObjectId
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId    String   @db.ObjectId
  user      User     @relation("EventStaff", fields: [userId], references: [id], onDelete: Cascade)
  role      String   @default("SCANNER")   // SCANNER | MANAGER
  @@unique([eventId, userId])
}
```

> Ticketing and attendance relations (`tiers`, `tickets`, `orders`, `soldCount`, `attendances`,
> `ticketsEnabled`, `refundPolicy`, `allowDoorDebt`) are **not** declared here: Prisma requires both
> sides of a relation to exist in one schema, and those models arrive in Phases 9 and 10, each of
> which lists the exact inverse fields it adds to `Event`, `Ticket` and `User`.

`List` gains the inverse: `eventIds String[] @default([]) @db.ObjectId` +
`events Event[] @relation("EventLists", ...)` — the **many-to-many between lists and events**.
Semantics: a linked list is the event's production backlog (its tasks/jobs are the work), and a
published list surfaces "Events" on its public page while the event page surfaces "Get involved"
linking to the list's job board.

Also add `Note.eventIds` (the new events) — notes referencing an event are the event's
**comment/discussion stream**, satisfying requirement 2c without a second comment system. The
polymorphic `Comment` model stays available for short replies (`entityType: 'event'`, one line in
the Phase 3 social registry) and likes gain `event` the same way.

## 8.3 Timezone rule

`startsAt`/`endsAt` are instants (UTC) plus an IANA `timezone` for display and for "is the event
running now" checks at the door. Never store wall-clock strings. All formatting goes through
`formatEventDate(event, locale)` in `src/lib/utils/date.ts` (Phase 3).

## 8.4 API

| Endpoint | Notes |
|----------|-------|
| `GET /api/v1/events?scope=mine\|org:<id>\|attending&status=&from=&to=&cursor=` | Authenticated management/feed listing. |
| `POST /api/v1/events` | Create; `ownerType/orgId` honoured via `assertCan(..., 'manage', 'org', orgId)`. Generates `publicUrl`, creates the event wallet (`kind: 'EVENT'`). |
| `GET/PUT/DELETE /api/v1/events/[eventId]` | Detail/update/cancel. DELETE on a published event with tickets → `status: CANCELLED` (soft), never a hard delete. |
| `POST /api/v1/events/[eventId]/publish` | DRAFT → PUBLISHED with validation (name, startsAt, location-or-online, cover). |
| `GET /api/v1/events/public?from=&to=&q=&near=&category=&cursor=` | Public discovery; `PUBLISHED` + `visibility PUBLIC` only; `near=lat,lng,radiusKm` filters by bounding box computed server-side. |
| `GET /api/v1/events/public/[publicUrl]` | Unauthenticated event payload (allowlist projection) + `viewer` block when authenticated. |
| `POST /api/v1/events/[eventId]/rsvp` | `{ status }` → upsert `EventRsvp`; returns fresh counts. |
| `POST /api/v1/events/[eventId]/lists` · `DELETE .../lists/[listId]` | Link/unlink lists (m:m). |
| `GET/POST/DELETE /api/v1/events/[eventId]/staff` | Manage door staff. |
| `POST /api/v1/likes` | `entityType: 'event'`. |
| `GET/POST /api/v1/comments?entityType=event` | Already polymorphic; registry entry only. |

Counts (`interestedCount`, `goingCount`, `likeCount`, `commentCount`) are computed with batched
`groupBy` in the service, never per-card in the UI.

## 8.5 Pages & components

- `src/app/[locale]/app/be/events/page.tsx` — replaces the disabled tab. Tabs: **Discover** (public
  feed), **Going/Interested**, **Mine / Org**. Filters: date range, online/in-person, near me,
  category, text. Cursor pagination.
- `src/app/[locale]/app/be/events/[eventId]/manage/page.tsx` — organiser console: edit, publish,
  linked lists, staff, tiers (Phase 9), attendance (Phase 10).
- `src/app/[locale]/event/[publicUrl]/page.tsx` — **public event page**, server component,
  `buildMetadata(..., type: 'event')` (OG image = cover, description = summary), JSON-LD `Event`
  structured data for search/social. Sections: cover, title/date/venue, action bar (Like ·
  Interested · Going · Buy/Reserve placeholder until Phase 9), description with inline link
  previews, flier (A3, click to open full size), map (`locationMap`) or online badge, host
  (user or org) card, linked lists / "Get involved" job board links, discussion (notes + comments).
- `src/components/eventCard.tsx`, `src/views/be/eventsView.tsx`,
  `src/views/forms/addEventForm.tsx` (name, summary, description, date/time + timezone, online
  toggle/URL, PlacePicker, cover + flier pickers with the Phase 4 crop presets, capacity,
  visibility, linked lists, owner selector).
- `beView.tsx` activity feed gains event cards (published events from friends/orgs you follow),
  merged into the existing notes+templates merge.
- `src/app/sitemap.ts` — published public events.

## Migrations

- `0027-split-life-events.js` (see 8.1) — includes `Day.eventIds`, `Comment.eventId` and the
  `Note`/`Document` arrays.
- `0028-backfill-event-slugs.js` — no existing rows to slug (the collection is new), but the script
  exists so a re-run after a failed publish repairs any event lacking a `publicUrl`.

## i18n

`events.*` (list/discover/filters), `events.form.*`, `events.rsvp.*`, `events.public.*`,
`events.manage.*`.

## Verification

- Life-event data survives the split: task→event references, `Day.eventIds`, note/document arrays
  and existing event comments all still resolve; `/api/v1/life-events` returns the same rows.
- Create a draft event → not visible publicly; publish → visible at `/en/event/<slug>` with correct
  OG tags and JSON-LD (validate with a rich-results checker).
- Timezone: an event created for 20:00 in `America/Sao_Paulo` shows 20:00 there and the correct
  converted local time for a viewer in `Europe/Lisbon`.
- Interested/Going toggles are idempotent and counts stay correct under double-click.
- Link a list → the event page links to its job board and the public list page lists the event.
- Post a note tagging the event → it appears in the event discussion; a private note does not.
- Org-owned event: only MANAGER+ of the org can edit; the public page credits the org.
