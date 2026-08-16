# Phase 3 — Do dry-out + shared primitives

**Goal:** finish the Do consolidation started in Phases 1–2 and extract the primitives that Be
(lists, events, tickets, orgs) will reuse, so the Be work adds features instead of copies.
**No behaviour change.** Pure refactor + tests-by-inspection. One PR.

## Why now

Phases 1–2 deleted the legacy completion system and the distribution machinery, but left:

- `getWeekNumber` implemented **3×**: `src/app/helpers.ts:29`,
  `src/lib/services/job/earningsService.ts:20`, `src/lib/services/day/dayProgressService.ts:183`
  (two of them return `number`, one returns `[number, number]` — a latent bug).
- List authorization spread over `authorizeListAccess` + `getUserListRole` called ad hoc in 5 route
  files (`tasks`, `tasks/[taskId]` ×2, `tasklists/[taskListId]` ×2, `jobs`), each re-deriving the
  same "is owner/manager/collaborator" branch.
- Social actions (`likes`, `comments`) are polymorphic in the DB but each entity type is
  special-cased in the route (`likes` knows `note|template|tasklist|comment`, `comments` knows
  `note|template|list|profile|event`) — the two lists already disagree.
- The public profile page pattern (`React.cache()` + `x-internal-fetch-secret` + `buildMetadata`)
  exists once, in `src/app/[locale]/profile/[userName]/page.tsx`, and Phases 5 and 8 both need it.
- Two service folders overlap: `src/lib/services/task/*` and `src/lib/services/tasklist/*`.

## 3.1 Date/time kit — `src/lib/utils/date.ts`

Single home for: `getWeekNumber(date): { week, year }`, `toDateKey(date): 'YYYY-MM-DD'`,
`fromDateKey`, `startOfDayUTC`, `formatDateForLocale(date, locale)` (the formatter duplicated
across views), `isSameDateKey`.

- Delete the three `getWeekNumber` copies; re-export from `src/app/helpers.ts` with a
  `@deprecated` note for one release so imports can migrate gradually.
- Rule documented in the file header: **all persisted dates are UTC `YYYY-MM-DD` strings**
  (`Job.occurrenceDate`, `Task.dtstart`, `Day.date`); `DateTime` columns are instants only.
  Events (Phase 8) are the first true instants and carry their own `timezone`.

## 3.2 Ownership kit — `src/lib/services/ownership/`

`ownershipService.ts` — the one place that answers "who owns this and what may the viewer do".

```ts
export type OwnerRef = { type: 'USER' | 'ORG'; userId?: string; orgId?: string }
export type EntityKind = 'list' | 'task' | 'job' | 'note' | 'event' | 'document' | 'profile' | 'wallet'
export type Capability = 'view' | 'edit' | 'manage' | 'delete' | 'moderate'

resolveOwner(kind, entity): OwnerRef
getViewerRole(viewerUserId, kind, entityOrId): Promise<'OWNER'|'MANAGER'|'COLLABORATOR'|'MEMBER'|'VIEWER'|null>
can(viewerUserId, capability, kind, entityOrId): Promise<boolean>
assertCan(...): Promise<void>   // throws ApiError(403)
```

- Phase 3 implements `USER` ownership only, wrapping today's `getUserListRole` /
  `authorizeListAccess` (which become thin re-exports). Phase 7 adds the `ORG` branch **in one
  file** instead of in every route.
- Route files replace their inline role branches with `await assertCan(user.id, 'edit', 'task', taskId)`.

## 3.3 Social kit — `src/lib/services/social/`

`socialService.ts` with a single registry of likeable/commentable entities:

```ts
const SOCIAL_ENTITIES = {
  note:     { model: 'note',     visibilityField: 'visibility' },
  template: { model: 'template', visibilityField: 'visibility' },
  tasklist: { model: 'list',     visibilityField: 'visibility' },
  comment:  { model: 'comment',  visibilityField: null },
  event:    { model: 'event',    visibilityField: 'visibility' },   // enabled in Phase 8
  task:     { model: 'task',     visibilityField: 'visibility' },   // enabled in Phase 5
} as const
```

- `toggleLike(viewerId, entityType, entityId)`, `getLikeState(viewerId, entityType, entityId)`,
  `getCounts(entityType, entityIds[])` (batched — kills the N+1 in feeds),
  `listComments`, `createComment`, `deleteComment`.
- `list`/`tasklist` alias normalised in one map (`normalizeEntityType`) so the two existing routes
  stop disagreeing.
- `/api/v1/likes` and `/api/v1/comments` become ~40-line routes over this service. Adding `event`
  in Phase 8 becomes a one-line registry entry.

## 3.4 Public page kit — `src/lib/public/`

- `internalFetch.ts` — `cachedInternalGet<T>(path)`: the `React.cache()` +
  `x-internal-fetch-secret` + `VERCEL_URL`/localhost base-URL logic currently inlined in
  `profile/[userName]/page.tsx` and `magazine/[articleslug]/page.tsx`. Both are refactored onto it.
- `slug.ts` — `buildPublicSlug(name, id)` = `slugify(name)-<last 4 of id>`, plus
  `ensureUniqueSlug(model, slug)` retry helper. Used by list `publicUrl` (Phase 5) and event
  `publicUrl` (Phase 8).
- `src/app/metadata.ts` — widen the `type` union from the current set to include `'list'` and
  `'event'` now, so Phases 5/8 only supply data.

## 3.5 Service folder consolidation

- Merge `src/lib/services/tasklist/*` into `src/lib/services/list/*`
  (`listService.ts`, `listCompletionService.ts`, `helpers.ts`), keeping `index.ts` re-exports so
  imports change in one mechanical pass. Rationale: the domain object is `List`; "tasklist" only
  survives as an API path and a like `entityType`.
- `src/lib/services/task/taskMigrationService.ts` — keep only the helpers still used by
  `/api/v1/tasks/migrate`; move dead helpers out.
- Add `src/lib/services/errors.ts`: `ApiError(status, code, message)` + `toResponse(error)` so
  routes stop hand-rolling `NextResponse.json({ error }, { status })` in every catch block.

## 3.6 API surface (unchanged contracts)

No endpoint is added or removed in this phase. Response shapes must be byte-identical — this is
the property the verification checks.

## Files touched

| Action | Path |
|--------|------|
| new | `src/lib/utils/date.ts`, `src/lib/services/ownership/{ownershipService.ts,index.ts}`, `src/lib/services/social/{socialService.ts,index.ts}`, `src/lib/public/{internalFetch.ts,slug.ts}`, `src/lib/services/errors.ts` |
| rename | `src/lib/services/tasklist/**` → `src/lib/services/list/**` |
| edit | `src/app/helpers.ts`, `src/lib/services/job/earningsService.ts`, `src/lib/services/day/dayProgressService.ts`, `src/app/api/v1/{likes,comments}/route.ts`, `src/app/api/v1/tasks/route.ts`, `src/app/api/v1/tasks/[taskId]/route.ts`, `src/app/api/v1/tasklists/[taskListId]/route.ts`, `src/app/api/v1/jobs/route.ts`, `src/app/[locale]/profile/[userName]/page.tsx`, `src/app/[locale]/magazine/[articleslug]/page.tsx`, `src/app/metadata.ts` |
| docs | `src/lib/services/CLAUDE.md` (new service map), `src/app/api/v1/{likes,comments}/CLAUDE.md` |

## Migrations

None. Schema untouched.

## Verification

- `npx prisma generate && npm run build && npm run lint`.
- Contract snapshot: before the refactor, capture responses for `GET /api/v1/tasklists`,
  `GET /api/v1/tasks?date=&listId=`, `GET /api/v1/jobs?listId=`, `GET /api/v1/likes?...`,
  `GET /api/v1/comments?...` into `/tmp`; after the refactor, diff them — must be empty.
- Manual: open `/app/do`, complete a task, request+approve a job, like a note, comment on a list,
  load a public profile page and a magazine article. All unchanged.
- `grep -rn "function getWeekNumber" src` returns exactly one hit.
