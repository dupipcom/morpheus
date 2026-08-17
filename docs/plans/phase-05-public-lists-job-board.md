# Phase 5 — Public list profiles + job board + Projects + task deep links

**Goal:** a `List` gets a public face that shows *only what it chooses to show*, and its public
tasks become job posts people can apply to. A new **`Project`** entity sits above lists — owned by
a User in this phase (Orgs arrive in Phase 7) — with its own public profile whose lists act as its
job boards. Tasks get a deep link (`/app/do/list/{listId}/{taskId}`) that opens the list with that
task **first and highlighted**. Extends Phase 4 of `docs/do-rebuild-plan.md` with the job-board
requirement.

Depends on: Phase 3 (ownership/social/slug/public-page kits), Phase 4 (media + places).

Target data model (phases 5→8): **Users / Orgs → Projects → Lists → Tasks / Events / Users /
Orgs**. This phase introduces the user-owned core of that chain; Phase 7 adds ORG ownership of
lists and projects, Phase 8 links events to projects.

**Project handles share the `/@` namespace with users and orgs**: `@projectusername` resolves to
`/{locale}/p/{username}` (the `Project.username` handle is also the `/p/` URL segment), and
handles are globally unique across users, orgs and projects (cross-checked at creation against
both other collections). Phase 6's wallet-resolve endpoint honours the same namespace, so a
follow-up donate flow can address a project by `@handle`.

## 5.1 Model

`List` already has `bio`, `profilePhoto`, `links Json?`, `publicUrl String? @unique`,
`visibility`, and `requests ListRequest[]` (Phase 1). Add:

```prisma
model List {
  // ...
  publicTagline   String?
  publicVisible   Boolean  @default(false)  // explicit publish switch, independent of `visibility`
  coverDocumentId String?  @db.ObjectId
  location        Json?                     // org/venue location for the board
  jobBoardEnabled Boolean  @default(false)
  projectId       String?  @db.ObjectId     // optional: this list is one of a project's job boards
  project         Project? @relation(fields: [projectId], references: [id])
  @@index([publicVisible])
  @@index([projectId])
}
```

`List.publicUrl` is already `String? @unique` from Phase 1. **Prisma-on-Mongo cannot declare a
sparse/partial unique index**, so more than one row with `publicUrl: null` would violate it. This
phase therefore makes the slug **always present**: migration `0020` backfills every existing list
and `POST /api/v1/tasklists` generates one at creation, so the column is effectively non-null.
Privacy comes from `publicVisible`, never from the absence of a slug. (Keeping the field optional
in the schema avoids a breaking `prisma generate` on partially-migrated data; a follow-up flips it
to required once the backfill is verified.)

`Task` — job-post fields (a task is a job post when `visibility = PUBLIC` **and** the list has
`jobBoardEnabled`):

```prisma
model Task {
  // ...
  jobDescription String?    // long form, markdown + inline link previews
  requirements   String?
  openings       Int?       @default(1)
  applyBy        String?    // YYYY-MM-DD
  applications   TaskApplication[]
  @@index([visibility])
}

model TaskApplication {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  status     String   @default("PENDING")   // PENDING | SHORTLISTED | ACCEPTED | DECLINED | WITHDRAWN
  message    String?
  documentIds String[] @default([]) @db.ObjectId   // CV / portfolio via Phase 4
  taskId     String   @db.ObjectId
  task       Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  listId     String   @db.ObjectId
  userId     String   @db.ObjectId
  user       User     @relation("TaskApplications", fields: [userId], references: [id], onDelete: Cascade)
  @@unique([taskId, userId])
  @@index([listId, status])
}
```

Accepting an application adds the applicant to `Task.candidateIds` **and** creates the
`ListRequest`-equivalent membership (`UserReference{ userId, role: 'COLLABORATOR' }` on the list),
so the existing job/earnings flow works unchanged from there.

**`Project`** — the public container between users/orgs and lists. User-owned in this phase;
Phase 7 adds `ownerType: 'ORG'` + `orgId` (its doc lists the exact fields, per the schema-validity
rule), Phase 8 adds `eventIds`/`events`.

```prisma
model Project {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  name            String
  username        String   @unique             // handle + /p/ URL segment; ALWAYS generated at
                                               // creation; globally unique across user and org
                                               // usernames (cross-checked at creation, mirrored
                                               // by the /@ middleware lookup)
  bio             String?                      // sanitizeHTML
  photoDocumentId String?  @db.ObjectId        // profile photo (Phase 4 document)
  coverDocumentId String?  @db.ObjectId        // 16:9 cover (Phase 4 crop preset)
  links           Json?                        // [{ label, url }] — same shape as List.links
  supportUrl      String?                      // support/donate link today; DPIP transfers are a
                                               // post-Phase-6 follow-up (project wallet + ledger)
  spotlight       Boolean  @default(false)     // featured marker; boosts discovery ordering
  publicVisible   Boolean  @default(false)     // same opt-in publish switch as lists
  createdByUserId String   @db.ObjectId        // creator/steward (P7 convention)
  users           UserReference[]              // collaborators, embedded — copy of List.users
  lists           List[]
  // Phase 7 adds: ownerType/orgId + Organization.projects inverse
  // Phase 8 adds: eventIds/events inverse (declared there — both models exist from then on)
  @@index([publicVisible])
  @@index([spotlight])
}
```

Stats (`listCount`, `likeCount`, `memberCount`, and from Phase 8 `eventCount`) are **computed in
the public serializer**, never stored.

**Support/donate:** `supportUrl` is a plain link this phase. After Phase 6 ships the ledger, a
follow-up adds a project wallet and a donate flow that moves DPIP through `ledgerService` — decide
there whether projects reuse USER-kind wallets or `Wallet.kind` gains a PROJECT value.

**Privacy rule (hard requirement):** the public payload is built by an allowlist projection in the
service, never by deleting fields from a full record. Private tasks, budgets, earnings, member
financials, jobs and history never enter the public serializer — for lists **and** projects.

## 5.2 API

| Endpoint | Notes |
|----------|-------|
| `GET /api/v1/tasklists/public/[publicUrl]` | Unauthenticated. Returns `{ name, publicTagline, bio, profilePhoto, cover, links, location, ownerProfile, collaboratorProfiles, project: { publicUrl, name } \| null, publicTasks[], likeCount, viewer: { isLiked, isMember, hasPendingRequest, hasApplied } }`. `publicTasks` carry `{ id, name, jobDescription, requirements, openings, applyBy, premium (display only), area, categories, location }`. |
| `GET /api/v1/tasklists/public?cursor=&q=&area=&category=` | Job-board discovery feed across all published lists. Cursor pagination, `visibility: PUBLIC` + `publicVisible: true` only. |
| `PUT /api/v1/tasklists/[id]` | Extended with the public-profile fields + `jobBoardEnabled` + `projectId` (attaching requires the caller to be a project collaborator); generates `publicUrl` via `buildPublicSlug` on first publish. |
| `POST /api/v1/tasks/[taskId]/apply` | `{ message?, documentIds? }` → `TaskApplication` PENDING. Rejects if the task isn't public, applications closed (`applyBy` past) or `openings` filled. |
| `GET /api/v1/tasks/[taskId]/applications` | Owner/manager only. |
| `POST /api/v1/tasks/[taskId]/applications/[applicationId]` | `{ status }` — accept/shortlist/decline; ACCEPTED adds candidate + list membership. |
| `POST /api/v1/tasklists/[id]/candidate` | Existing `ListRequest` flow (general "join this list" ask, separate from applying to a specific task). |
| `POST /api/v1/tasklists/[id]/requests/[requestId]` | Approve/decline (owner/manager). |
| `POST /api/v1/likes` | `entityType: 'tasklist'` — already supported; `entityType: 'project'` is **new**: add `project` to `LIKEABLE_ENTITIES`/`SOCIAL_ENTITIES`/`MODEL_DELEGATES` in `src/lib/services/social/socialService.ts` (relation-less, like `tasklist`; comments on projects deferred). |
| `POST /api/v1/projects` | Create: `{ name, bio?, photoDocumentId?, coverDocumentId?, links?, supportUrl?, users? }` → `username` via `slugify` + `ensureUniqueSlug`, checked against `Profile.username` and `Organization.username` too; `publicVisible: false` (opt-in). |
| `GET/PUT /api/v1/projects/[projectId]` | Detail / update public-profile fields (collaborators with the owner role). PUT extends `publicVisible`, `spotlight`. |
| `GET /api/v1/projects/public/[username]` | Unauthenticated. `{ name, bio, photo, cover, links, supportUrl, spotlight, ownerProfile, stats: { listCount, likeCount, memberCount }, publishedLists[], likeCount, viewer: { isLiked, isMember } }`. `publishedLists` = the project's `publicVisible` lists rendered as job-board cards. |
| `GET /api/v1/projects/public?cursor=&q=` | Project discovery feed (spotlight first, then recently updated). |

## 5.3 Pages

- `src/app/[locale]/list/[publicUrl]/page.tsx` — server component using
  `cachedInternalGet` + `buildMetadata(..., type: 'list')` (OG image = cover or `profilePhoto`,
  description = `publicTagline || bio`), `notFound()` on miss. Bot/English metadata handled by the
  existing middleware cookie logic.
- `src/views/list/publicListView.tsx` — hero (cover, photo, name, tagline, links, location map from
  Phase 4), **"part of Project X" chip** when `projectId` is set, About, **Open positions** grid of
  public tasks, Support/Like, Donate stub, Repost, Request to join.
- `src/app/[locale]/list/[publicUrl]/jobs/[taskId]/page.tsx` — single job post page (own metadata,
  apply button, `ApplyDialog` with message + attachments).
- `src/app/[locale]/p/[username]/page.tsx` — **public project page**, server component,
  `buildMetadata(..., type: 'project')` (OG image = cover or photo, description = bio), `notFound()`
  on miss. Sections: hero (cover, photo, name, spotlight badge, links), About (bio), **Job boards**
  (the project's published lists), Support/Donate (link), Like. Events section arrives in Phase 8.
  Reached via `/@username` too — the middleware `/@` lookup (Phase 7) resolves users, orgs **and**
  projects.
- `src/app/[locale]/app/be/jobs/page.tsx` — logged-in job board discovery (filters by area,
  category, location, text) feeding off `GET /api/v1/tasklists/public`.
- `src/app/sitemap.ts` — include published lists, their public job posts, and published projects.

Client islands only for the action buttons; the page body stays a server component for SEO.

## 5.4 List settings UI

`addListForm.tsx` (rebuilt to ~250 lines in Phase 2) gains a collapsed **Public profile** section:
publish switch, tagline, bio, cover (Phase 4 picker, 16:9), links repeater, location, job-board
switch, a **Project** selector (existing projects where the user is a collaborator, or "none"), and
the read-only `publicUrl` with a copy button. Pending `ListRequest`s and `TaskApplication`s get a
review panel here.

`addTaskForm.tsx` gains a **Publish as job** section (visibility PUBLIC + description,
requirements, openings, applyBy) shown only when the list has `jobBoardEnabled`.

New `addProjectForm.tsx` — name, bio, photo + cover pickers (Phase 4 presets), links repeater,
support/donate link, spotlight switch, collaborators. Projects are managed from the Do area's list
picker ("Projects" group above personal lists).

## 5.5 Task deep link

Shared URL: **`/app/do/list/{listId}/{taskId}`** — opens the list with that task **first and
highlighted**.

- New route `src/app/[locale]/app/do/list/[listId]/[taskId]/page.tsx` rendering `DoPage` with
  `listId` + `taskId` (existing `/app/do/[listId]` stays for backward compat).
- `DoPage` threads `taskId` through `DoView` → `TaskGrid` as `initialTaskId` (props, no
  searchParams). `DoPage`'s default-redirect logic (`doPage.tsx:148-170`) must **not** redirect
  away when a valid deeplink is present — same guard chatView uses for deep links.
- Date resolution: grid queries are date-scoped (`GET /api/v1/tasks?listId=&date=`), so `DoPage`
  resolves the task by scanning `list.tasks` (`GET /api/v1/tasklists/[id]` already returns them)
  and sets the grid date to the task's occurrence date before first render; entry keys stay
  `taskId:occurrenceDate`.
- In `taskGrid.tsx`, `sortedTasks` boosts the deeplinked entry to index 0, and a once-only effect
  (copy the chat deep-link pattern: `deepLinkHandledRef` gated on data readiness) runs
  `document.querySelector('[data-task-id="…"]')` → `scrollIntoView({ behavior: 'smooth', block:
  'center' })` + `ring-2 ring-primary` highlight. Add `data-task-id` to the task card container
  (`task__container--${key}`).
- Stale/unknown `taskId` → toast via `task.deeplink.notFound` key and fall back to the plain list
  view (no redirect loop).

## Migrations

None. `Project` is a new model and `List.projectId` is optional — no backfill. (Migration `0020`
already shipped with Phase 1; the next free number stays 0021 for Phase 6.)

## i18n

New key groups: `list.public.*`, `jobs.board.*`, `jobs.apply.*`, `jobs.applicationStatus.*`,
`project.*` (profile/editor/donate), `task.deeplink.*`.

## Verification

- Publish a list → `/en/list/<slug>` renders; `curl` shows OG tags; bot cookie yields English.
- A private task never appears in the public payload (assert on the raw JSON, not the DOM).
- Apply to a job as another user → owner sees the application, accepts → applicant becomes a
  collaborator and can request a job on that task through the existing Do flow.
- Applying twice → 409; applying after `applyBy` → 400; applying to a task in an unpublished list → 404.
- `publicVisible: false` list returns 404 on the public route even with a valid slug.
- Create a project, attach a published list → `/p/<username>` renders with OG tags and
  `/@username` resolves to it; the project page lists the job board and the list page shows the
  "part of Project" chip. Unpublished project → 404 even with a valid handle. Project like toggles
  idempotently. Claiming a handle that matches an existing **user or org** username is rejected.
- Open `/app/do/list/{id}/{taskId}` → the grid shows the task first, ring-highlighted and scrolled
  into view; a stale taskId falls back to the plain list view without a redirect loop.
