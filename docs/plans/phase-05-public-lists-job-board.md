# Phase 5 — Public list profiles + job board

**Goal:** a `List` gets a public face that shows *only what it chooses to show*, and its public
tasks become job posts people can apply to. Extends Phase 4 of `docs/do-rebuild-plan.md` with the
job-board requirement.

Depends on: Phase 3 (ownership/social/slug/public-page kits), Phase 4 (media + places).

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
  @@index([publicVisible])
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

**Privacy rule (hard requirement):** the public payload is built by an allowlist projection in the
service, never by deleting fields from a full record. Private tasks, budgets, earnings, member
financials, jobs and history never enter the public serializer.

## 5.2 API

| Endpoint | Notes |
|----------|-------|
| `GET /api/v1/tasklists/public/[publicUrl]` | Unauthenticated. Returns `{ name, publicTagline, bio, profilePhoto, cover, links, location, ownerProfile, collaboratorProfiles, publicTasks[], likeCount, viewer: { isLiked, isMember, hasPendingRequest, hasApplied } }`. `publicTasks` carry `{ id, name, jobDescription, requirements, openings, applyBy, premium (display only), area, categories, location }`. |
| `GET /api/v1/tasklists/public?cursor=&q=&area=&category=` | Job-board discovery feed across all published lists. Cursor pagination, `visibility: PUBLIC` + `publicVisible: true` only. |
| `PUT /api/v1/tasklists/[id]` | Extended with the public-profile fields + `jobBoardEnabled`; generates `publicUrl` via `buildPublicSlug` on first publish. |
| `POST /api/v1/tasks/[taskId]/apply` | `{ message?, documentIds? }` → `TaskApplication` PENDING. Rejects if the task isn't public, applications closed (`applyBy` past) or `openings` filled. |
| `GET /api/v1/tasks/[taskId]/applications` | Owner/manager only. |
| `POST /api/v1/tasks/[taskId]/applications/[applicationId]` | `{ status }` — accept/shortlist/decline; ACCEPTED adds candidate + list membership. |
| `POST /api/v1/tasklists/[id]/candidate` | Existing `ListRequest` flow (general "join this list" ask, separate from applying to a specific task). |
| `POST /api/v1/tasklists/[id]/requests/[requestId]` | Approve/decline (owner/manager). |
| `POST /api/v1/likes` | `entityType: 'tasklist'` — already supported, now via the Phase 3 social kit. |

## 5.3 Pages

- `src/app/[locale]/list/[publicUrl]/page.tsx` — server component using
  `cachedInternalGet` + `buildMetadata(..., type: 'list')` (OG image = cover or `profilePhoto`,
  description = `publicTagline || bio`), `notFound()` on miss. Bot/English metadata handled by the
  existing middleware cookie logic.
- `src/views/list/publicListView.tsx` — hero (cover, photo, name, tagline, links, location map from
  Phase 4), About, **Open positions** grid of public tasks, Support/Like, Donate stub, Repost,
  Request to join.
- `src/app/[locale]/list/[publicUrl]/jobs/[taskId]/page.tsx` — single job post page (own metadata,
  apply button, `ApplyDialog` with message + attachments).
- `src/app/[locale]/app/be/jobs/page.tsx` — logged-in job board discovery (filters by area,
  category, location, text) feeding off `GET /api/v1/tasklists/public`.
- `src/app/sitemap.ts` — include published lists and their public job posts.

Client islands only for the action buttons; the page body stays a server component for SEO.

## 5.4 List settings UI

`addListForm.tsx` (rebuilt to ~250 lines in Phase 2) gains a collapsed **Public profile** section:
publish switch, tagline, bio, cover (Phase 4 picker, 16:9), links repeater, location, job-board
switch, and the read-only `publicUrl` with a copy button. Pending `ListRequest`s and
`TaskApplication`s get a review panel here.

`addTaskForm.tsx` gains a **Publish as job** section (visibility PUBLIC + description,
requirements, openings, applyBy) shown only when the list has `jobBoardEnabled`.

## Migrations

- `0020-backfill-list-publicurl.js` — `buildPublicSlug(name, id)` for every list, uniqueness retry,
  `publicVisible: false` for all existing lists (opt-in publishing, no accidental exposure).

## i18n

New key groups: `list.public.*`, `jobs.board.*`, `jobs.apply.*`, `jobs.applicationStatus.*`.

## Verification

- Publish a list → `/en/list/<slug>` renders; `curl` shows OG tags; bot cookie yields English.
- A private task never appears in the public payload (assert on the raw JSON, not the DOM).
- Apply to a job as another user → owner sees the application, accepts → applicant becomes a
  collaborator and can request a job on that task through the existing Do flow.
- Applying twice → 409; applying after `applyBy` → 400; applying to a task in an unpublished list → 404.
- `publicVisible: false` list returns 404 on the public route even with a valid slug.
