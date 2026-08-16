# Do Module Rebuild — Follow-up on #441

> **Superseded.** Phases 1 and 2 of this document are implemented and merged. The remaining work
> (Phases 3 and 4) has been folded into the consolidated program plan at
> [`docs/plans/README.md`](./plans/README.md), which also covers the Be module (events, ticketing,
> DPIP ledger, organizations, subscription allowances). Keep this file for the Phase 1–2 rationale
> and findings; do not plan new work from it.

## Context

Issue #441 ("r0.1.0") merged the Do module as it stands: budgets with distribution modes (#298/#299), Task-collection integration replacing templateTasks/ephemeralTasks (#302/#310), job earnings/invoice (#307/#315), CANCELLED-status compliance (#313). Those incremental PRs left the module overly complex: a 951-line addListForm with area/category/per-task budget distributions, a multiplexed `tasklists` POST, legacy fallbacks, duplicated loading paths, and **two parallel completion systems** (legacy embedded completers vs job-based) both mutating user money.

Goal: rebuild the Do module (reusing as much as possible), removing redundant code and complex structures down to the minimum functionality of the mission: crowdfunding + social task management with lists, cadence-based tasks, jobs with evidence, budgets/wallets, and public list profiles.

## Decisions (confirmed with user)

1. **Data migration**: Preserve everything — all existing Do data (lists, tasks, jobs, days, tickers) must survive via idempotent migrations in `src/migrations/`. Dropped typed fields get snapshotted into a `legacy Json?` field.
2. **Delivery**: Phased PRs — Phase 1 model+API, Phase 2 frontend rebuild, Phase 3 attachments/geo/Write, Phase 4 public profile + social.
3. **Cadence**: RRULE via the `rrule` npm package (RFC-5545 string per task), replacing `RecurrenceFrequency` enum / `RecurrenceRule` on Task / List.role prefixes.
4. **Budgets**: Strip to minimum — list budget (fiat OR % of one or more user Budget records), task premium (fiat OR % of list budget). Remove area/category/per-task `BudgetDistribution` machinery and UI.
5. **Storage**: iDrive e2 (S3-compatible endpoint; `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`; presigned direct uploads — Vercel body limit ~4.5MB, file cap 5MB).
6. **Video compression**: client-side `@ffmpeg/ffmpeg` wasm (cap ~720p H.264 mp4). Images: HEIC decoded via `heic2any`, re-encoded via canvas (max 2048px, webp/jpeg). EXIF geo extracted client-side via `exifr`.
7. **Geolocation**: Google Places API data via our own UI components (search input + results list; NO Google autocomplete widget), proxied through server routes with `GOOGLE_PLACES_API_KEY` (server-only).

## Key findings (verified)

**Backend** (`prisma/schema.prisma`, 1111 lines):
- Two completion systems: legacy embedded (`List.completedTasks` buckets + `Completer[]` — NOT schema fields, written via `as Record<string, unknown>` casts; `tasklist/completionService.ts` (458), `taskStatusService.ts` (446), `earningsService.ts` (195), `dayService.ts` (442), `handlers/updateTaskCompletion.ts` (335)) vs job-based (`Job.occurrenceDate` + `task/taskRecurrenceService.ts` `getTasksForDate` + `job/earningsService.ts` (534) + `listCompletionService.ts`). Dual-write risk, duplicated money math.
- `Task` (693-736): standalone, `recurrence RecurrenceRule?`, `times`/`count`, legacy `budget/earnings/premium/totalGains`. `Job` (738-777): 7-status machine, `occurrenceDate String?`, `invoice JobInvoice?`. `List` (643-691): `role`, `templateTasks` (deprecated), legacy budget fields + `budgetDistribution`, `publicUrl` (unused), `walletId`. `Budget` (833-858) and `Document` (878-899) models: defined but **never used in src/**. `Note` (521-556): has `listIds/documentIds/profileIds` arrays but no `taskIds`/location/attachments.
- `getTasksForDate` (taskRecurrenceService.ts:144-246): hand-rolled frequency switch; weekly tasks aggregate jobs across the whole week; per-date status derived from ACCEPTED jobs (count >= times → DONE); one-off lists show COMPLETED tasks. **This is the base to port to RRULE.**
- `/api/v1/tasklists` POST is a multiplexed dispatcher on body flags (8 operations). Financial engine `calculateTaskBudgetFromDistribution` (taskMigrationService.ts:162-303, 6 priority levels) + `applyPremiumFactors` (earningsUtils.ts, daily /30, weekly /4, global) inlined in 4 places. Duplicated: `getUserListRole` ×2, `getWeekNumber` ×4, day creation in 5 places, clone routes copy templateTasks not Task records.
- Signup defaults: lazy `ensureDefaultTaskLists` (taskListCrudService.ts:165-240) on GET /tasklists, from seeded Templates role `daily.default`/`weekly.default`, localized via `translateTemplateTasks` using `DAILY_ACTIONS`/`WEEKLY_ACTIONS` (`src/app/constants.ts`) + `actions.{localeKey}` locale keys. Clerk webhook `POST /api/v1/auth` creates User+Profile only — no lists, no locale available server-side.
- API docs to update: `src/app/api/openapi.yaml` + per-route CLAUDE.md (v1 index, tasklists, tasks, jobs, notes).

**Frontend**:
- Pages: `app/[locale]/app/do/page.tsx` (341) and `do/[listId]/page.tsx` (381) — ~95% identical. Views: `views/do/doView.tsx` (155, 30s polling, mutateTasksRef indirection), `views/list/listView.tsx` (801, legacy completedTasks merge + auto-migrate effect).
- Forms: `addListForm.tsx` (951! 7× BudgetDistributionInput, embedded add-task dialog, 15 useState slices), `addTaskForm.tsx` (324, **5 write paths**), `addTemplateForm.tsx` (212, 3rd duplicate add-task dialog).
- Components: `doToolbar.tsx` (731), `taskGrid.tsx` (868, job handlers duplicated with useTaskHandlers), `taskItem.tsx` (202), `recurrencePicker.tsx` (340), `jobDetailsCard.tsx`, `jobSubmissionDialog.tsx`, `jobReviewDialog.tsx`, `datePickerButton.tsx` (writes GlobalContext.selectedDate).
- **Dead**: jobReviewModal.tsx, jobHistoryPanel.tsx, steadyTasks.tsx (disabled flag), tickerStrip.tsx + useTickerData.ts, useOptimisticEarnings.ts, useJobs.ts, useProfile fn, src/app/contexts.ts, 4 taskUtils exports.
- Duplicated: stableTaskLists pattern ×4, date formatter ×4, getStatusColor ×2 (diverged STATUS_OPTIONS), extractUserIds ×3, profiles/by-ids fetch ×2.
- `publishNote.tsx` (199): the Write composer (Be pages only) — POSTs `{content, visibility, date, recipientId}` only. No attachments/tags/geo.

**Infra**: NO S3/upload/compression/geo/EXIF code anywhere; no sharp/ffmpeg/heic deps; no storage env vars. Public-profile SEO pattern to copy: `app/[locale]/profile/[userName]/page.tsx` (generateMetadata + React.cache() fetch with `x-internal-fetch-secret`), `src/app/metadata.ts` `buildMetadata` (reads `dpip_bot_en` cookie; add `'list'` type), middleware bot detection, sitemap.ts. Like toggle exists for `entityType: 'tasklist'`. Friend-request accept/decline = the approve pattern to imitate. Wallets (Kaleido) mature — reuse as-is; donate = dialog stub.

---

## Phase 1 — Model + API (+ migrations) — PR A

### 1.1 Schema changes (`prisma/schema.prisma`)

**Task** — add/change:
- `rrule String?` (RFC-5545, e.g. `FREQ=WEEKLY;INTERVAL=1;BYDAY=TH`), `dtstart String?` (YYYY-MM-DD). One-off tasks: `rrule = null`.
- Remove (after migration): `recurrence`, `nextOccurrence`, `lastOccurrence`, `firstOccurrence`, `count` (derived from ACCEPTED jobs), `budget`, `earnings`, `totalGains`, embedded `documents DocumentReference[]`.
- Repurpose `premium Float?` + add `premiumType String?` (`FIAT` | `PERCENT`).
- Add: `location Json?` (`{lat, lng, placeId?, name?, address?}`), `documentIds String[] @default([]) @db.ObjectId` + `documents Document[] @relation("TaskDocuments")`.
- Add `legacy Json?` — snapshot of dropped field values (preserve everything).
- Keep: `times Int?` (target per occurrence — the counter), `status`, `localeKey`, `categories`, `area`, `visibility`, `quality`, `redacted`, `candidateIds`, raisedTransactions.

**List** — add/change:
- Budget: keep `budget Float?` (fiat) + add `budgetType String?` (`FIAT` | `PERCENT`), `budgetPercent Float?`, `budgetSourceIds String[] @default([]) @db.ObjectId` + `budgetSources Budget[] @relation("ListBudgetSources")` (criterion 12: multiple budgets).
- Public profile: add `bio String?`, `profilePhoto String?`, `links Json?`; make `publicUrl String? @unique` (sparse).
- Remove (after migration): `templateTasks`, `remainingBudget`, `premiumPercentage`, `budgetDistribution`, `listBudgetId/listBudget`, `relatedBudgetIds/relatedBudgets`. Snapshot into `legacy Json?`.
- Keep: `role` (data only, no longer recurrence source), `users`, `history`, `ticker`, `progress`, `completion`, `dueDate`, `walletId`, `templateId`, relations.

**Budget** — simplify (model was unused): drop `type`/`taskAllocations`/`defaultForLists`/`relatedToListIds`/`relatedToLists` + `BudgetEntryType` enum; keep `name/description/totalAmount/remainingAmount/ownerId` + new `budgetSourceForListIds String[] @default([]) @db.ObjectId` + `lists List[] @relation("ListBudgetSources")`; keep `walletIds` m:m.

**Job** — add: `justification String?` (criterion: justify on request), `documentIds String[] + documents Document[] @relation("JobDocuments")` (evidence), `location Json?` (auto-filled from EXIF). Keep status machine, `occurrenceDate`, reviews, `invoice`, earnings fields, notes relations.

**Document** (activate as THE attachment model) — add: `mimeType String?`, `kind String?` (`image|video|document`), `thumbnailUrl String?`, `posterUrl String?`, `width Int?`, `height Int?`, `location Json?`, `userId String @db.ObjectId` + `user User` (owner), `taskIds String[]` + `jobIds String[]` + back-relations (TaskDocuments/JobDocuments). Keep existing fileUrl/fileName/fileSize/fileFormat/fileDuration/visibility + listIds/noteIds.

**Note** — add: `taskIds String[] @default([]) @db.ObjectId` (tagged tasks), `location Json?`, `repostedListId String? @db.ObjectId`. (`documentIds`/`listIds`/`profileIds` already exist.)

**ListRequest** (new, criterion 15):
```prisma
model ListRequest {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  status    String   @default("PENDING")   // PENDING | ACCEPTED | DECLINED
  message   String?
  listId    String   @db.ObjectId
  list      List     @relation(fields: [listId], references: [id], onDelete: Cascade)
  userId    String   @db.ObjectId
  user      User     @relation("ListRequests", fields: [userId], references: [id], onDelete: Cascade)
  @@unique([listId, userId])
}
```
(+ `User.listRequests ListRequest[]` back-relation.)

**Untouched**: `Day` (stop legacy writes; `tasks EmbeddedTask[]` stays as historical snapshots), `Template`/`EmbeddedTask`/`RecurrenceRule` (kept for template reads only — new list creation converts template recurrence → rrule when creating Task records).

**New indexes**: `Task @@index([listId, status])`, `Job @@index([listId, occurrenceDate])`, `List.publicUrl @unique`, `ListRequest @@unique([listId, userId])`, `Note @@index([taskIds])`.

### 1.2 Data migrations (`src/migrations/`, idempotent)

- `0017-convert-task-recurrence-to-rrule.js` — per Task: build RRULE string from `recurrence` (frequency/interval/byWeekday/byMonthDay/byMonth/endDate/occurrenceCount; missing rule → derive from List.role prefix: `daily.` → `FREQ=DAILY`, `weekly.` → `FREQ=WEEKLY`); set `dtstart` from `firstOccurrence` (date part); snapshot `{recurrence, first/last/nextOccurrence, count, budget, earnings, premium, totalGains}` → `task.legacy`; unset removed fields.
- `0018-simplify-list-budgets.js` — per List: snapshot `{templateTasks, remainingBudget, premiumPercentage, budgetDistribution, listBudgetId, relatedBudgetIds}` → `list.legacy`; map `premiumPercentage > 0` → `budgetType: PERCENT, budgetPercent`, else `budget > 0` → `FIAT`; unset removed fields.
- `0019-convert-task-documents.js` — `Task.documents DocumentReference[]` → real `Document` records (fileUrl/fileName, kind from extension) + `Task.documentIds`.
- `0020-backfill-list-publicurl.js` (Phase 4): slugify(name) + `-` + last 4 chars of id, uniqueness retry.
- (Optional) `0021-create-missing-default-lists.js` — close gaps for existing users lacking daily/weekly defaults (en fallback; lazy path already covers most).

Run order documented in `scripts/README-migration.md`; `npx prisma generate` after schema change.

### 1.3 Services — kill legacy, centralize

**Delete**: `tasklist/completionService.ts`, `tasklist/taskStatusService.ts`, `tasklist/earningsService.ts`, `tasklist/ephemeralTaskService.ts`, `app/api/v1/tasklists/handlers/` (updateTaskCompletion), `lib/utils/budgetDistributionUtils.ts`, `job/noteHelper.ts` (if unimported), legacy functions inside `tasklist/dayService.ts` and `taskMigrationService.ts` (keep migration helpers + `/tasks/migrate` route for back-compat).

**New/refactored**:
- `src/lib/services/task/recurrenceService.ts` (replaces taskRecurrenceService): `getTasksForDate(listId, date)` using `rrule`: `rrulestr(task.rrule)`; date check via occurrence set (UTC midnight dates — see Risks); keep weekly job aggregation + per-date status derivation (ACCEPTED count vs `times`); one-off (no rrule) always appears; COMPLETED filtered except one-off lists.
- `src/lib/services/finance/premiumService.ts`: single `resolveTaskPremium(task, list)` (PERCENT → list budget × pct; list budget: FIAT → `budget`, PERCENT → Σ `budgetSources.remainingAmount` × `budgetPercent`/100) + `applyPremiumFactors` (factor divisor now derived from RRULE FREQ instead of list role). Replaces `calculateTaskBudgetFromDistribution` at all 4 call sites (tasks GET, tasks/[taskId], tasklists GET, job/earningsService).
- `src/lib/services/list/listService.ts`: slimmed `getTaskListsForUser`, `createList`, `updateList`, `deleteList`, `ensureDefaultTaskLists` (constants-based, no Template dependency), `getUserListRole` moved to `auth/authService.ts` only.

### 1.4 API surface (thin routes; standard Clerk auth pattern)

| Endpoint | Notes |
|---|---|
| `GET /api/v1/tasklists` | Slim payload (no legacy merge, no distributions); keeps `ensureDefaultTaskLists` fallback |
| `POST /api/v1/tasklists` | **Create only** — `{name, visibility, area, categories, collaborators, budget, budgetType, budgetPercent, budgetSourceIds, bio?, profilePhoto?, links?, tasks?[]}` (initial tasks with rrule). Generates `publicUrl` |
| `GET/PUT/DELETE /api/v1/tasklists/[id]` | **New** — detail (incl. pending ListRequests for owners) / update / delete |
| `POST /api/v1/tasklists/[id]/clone` | Fix: clone `Task` records, not templateTasks |
| `GET /api/v1/tasks?date=&listId=` | Canonical date-aware mode via recurrenceService (legacy filter modes dropped unless a consumer is found) |
| `POST /api/v1/tasks` | `{name, listId, rrule, dtstart, times, premium, premiumType, location?, categories, area}` |
| `PUT /api/v1/tasks/[taskId]` | Update; `status: COMPLETED` = complete task (criterion 5) |
| `DELETE /api/v1/tasks/[taskId]?scope=all\|onwards\|today` | Criterion 7: `all` → delete task+jobs; `today` → cancel/delete jobs with `occurrenceDate === date`; `onwards` → delete jobs ≥ date + set task `COMPLETED`/`completedOn` (preserves history) |
| `POST /api/v1/jobs` | `{taskId, occurrenceDate, justification}` — justification **required** unless requester OWNER/MANAGER (criterion); role→initial status as today (collab → VALIDATING/REQUESTED, owner → ACCEPTED) |
| `PUT /api/v1/jobs/[jobId]` | Status transitions (slimmed, keep validator + earnings apply/reverse via premiumService); evidence: `{documentIds, location, note}` |
| `DELETE /api/v1/jobs/[jobId]` | Keep (soft CANCELLED) |
| `GET/POST /api/v1/days` | POST slimmed (no embedded task merge) |
| `GET/POST /api/v1/tasks/migrate` | Keep, deprecation note |

Update `src/app/api/openapi.yaml` + affected route CLAUDE.md files.

### 1.5 Phase 1 verification
`npx prisma generate` → `npm run build` → `npm run lint`; run migrations 0017-0019 against dev DB and verify: rrule strings parse (`rrulestr`), list `legacy` snapshots contain old fields, documents created; manual: tasklists GET, tasks?date&listId parity with pre-change behavior, complete task → job → Day ticker + stash/profit, delete scopes.

---

## Phase 2 — DoView frontend rebuild — PR B

**Delete (dead)**: jobReviewModal, jobHistoryPanel + useJobs, steadyTasks (+viewMenu if orphaned), tickerStrip + useTickerData, useOptimisticEarnings, src/app/contexts.ts, dead taskUtils exports, budgetDistributionInput.tsx, recurrencePicker.tsx, addTemplateForm.tsx (templates leave the Do UI; API stays).

**Merge / rebuild**:
- `do/page.tsx` + `do/[listId]/page.tsx` → shared client component `src/views/do/DoPage.tsx` parameterized by listId; both route files become thin wrappers.
- `doView.tsx` + `listView.tsx` → `src/views/do/DoView.tsx`: plain SWR (`/api/v1/tasks?date&listId` + `/api/v1/jobs?listId&date`), **no** legacy merge (325-548), **no** auto-migrate effect (607-666), no stableTaskLists/mutateTasksRef indirection.
- Forms reduced to minimum:
  - `addListForm.tsx` (~250): name, visibility, collaborators (useFriendProfiles), budget section (fiat input OR percent + budget-source multi-select), edit mode + delete. **Remove**: template/clone picker, due date, cadence select, embedded add-task dialog, all distribution UI.
  - `addTaskForm.tsx` (~200): name, cadence picker, counter (`times`), premium (fiat or %), single write path (POST/PUT `/api/v1/tasks`). Area/category removed from form (defaulted on create; fields stay in model).
- Job flow → one `src/components/jobDialog.tsx` (request+justification / submit evidence / review accept-validate-reject) + slim `jobDetailsCard.tsx`; delete `jobSubmissionDialog`/`jobReviewDialog`. `useTaskHandlers` becomes the single job-action source (remove taskGrid's duplicate handlers).

**New components**:
- `src/components/cadencePicker.tsx` — Google-Calendar-like presets (Does not repeat / Daily / Weekly / Monthly / Yearly) + custom: every N; weekly on chosen weekdays; monthly day-N or nth-weekday; ends never/on date/after N occurrences. Emits an RRULE string via `rrule` lib. Styling follows existing recurrencePicker/shadcn patterns.
- `src/components/deleteTaskDialog.tsx` — scope prompt: All entries / From today onwards / Today only → DELETE with `?scope=`.
- Counter UX in `taskItem.tsx`: show `dateCount/times` per date; each tap creates a job for that occurrenceDate (existing handleTaskClick flow adapted — no legacy paths).
- `src/lib/hooks/useTaskLists.ts` — replaces GlobalContext taskLists + 30s polling (SWR `/api/v1/tasklists`, revalidateOnFocus false); GlobalContext keeps only `selectedDate` (+ note-refresh). `providers.tsx` slimmed.
- `doToolbar.tsx` slimmed: list Select, DatePickerButton, plus menu (Add task / Add list), badges reduced to premium + completion % + earnings (via `useListEarnings` hook on `/api/v1/jobs?listId&workerId=me&status=ACCEPTED`).

**i18n**: new keys (`tasks.deleteScopes.*`, `forms.addTaskForm.cadence.*`, counter, justification, evidence labels) added to en.json + all 33 locales (the-i18n); fix the known `areaPremiumDistributionLabel` mismatch (keys removed with the UI anyway).

**Final data flow**: DoPage → DoToolbar (useTaskLists, ?date= URL param) → DoView → TaskGrid ← SWR tasks-for-date → TaskItem (tap = POST /api/v1/jobs; counter; status menu; delete-scope dialog) + JobDialog (PUT /api/v1/jobs/[id]).

**Phase 2 verification**: build + lint; manual: create list (minimal form), task "every 2 days" appears on correct dates, one-off task persists until completed, 3× counter tap → done, status→completed, delete scopes, job request with justification → owner approve → evidence submit → review, migrated existing data renders correctly.

---

## Phase 3 — Attachments + geolocation + Write — PR C

### Storage (iDrive e2)
- Deps: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `heic2any`, `exifr`, `@ffmpeg/ffmpeg` (+ `@ffmpeg/core` loaded from CDN via `toBlobURL`, not bundled).
- Env: `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_BASE_URL` (`.env.public` defaults + `.env.local` secrets).
- `src/lib/storage/s3.ts` — client singleton + presigned PUT helper.
- Routes: `POST /api/v1/attachments/presign` (auth; validate format allowlist + ≤5MB; → `{uploadUrl, key, publicUrl}`); `POST /api/v1/attachments` (auth; `{key, fileName, fileFormat, fileSize, mimeType, kind, width, height, duration?, location?, entityType, entityId}` → create Document + attach to Task/List/Job/Note with ownership/membership check).
- `src/lib/utils/mediaCompression.ts`: images — HEIC/HEIF → heic2any → canvas re-encode (webp/jpeg q0.8, max 2048px; re-encode if >5MB); videos — ffmpeg.wasm → H.264 720p 30fps mp4 + poster frame; EXIF (exifr) extracted BEFORE strip (GPS → location).
- Format allowlist: images `heic,heif,jpg,jpeg,png,webp,gif`; video `mp4,mov,webm`; documents `pdf`. Cap 5MB post-compression; ≤4 per post.
- `src/components/attachmentPicker.tsx` — input + previews + compression progress + per-file location (EXIF auto-filled, editable via PlacePicker); reused by job evidence, task form, list form, Write composer.

### Geolocation (own UI over Google Places)
- Env: `GOOGLE_PLACES_API_KEY` (server-only). Routes: `GET /api/v1/places/autocomplete?input=` and `GET /api/v1/places/details?placeId=` (server-side proxy).
- `src/components/placePicker.tsx` — own input + debounced result list (shadcn Popover) → `{lat, lng, placeId, name, address}` stored in `location Json?`.
- Rule: photo EXIF GPS auto-attached to the Job's location.

### Write toolbar extensions (`publishNote.tsx`)
- Add AttachmentPicker, PlacePicker, and `entityTagPicker.tsx` (search profiles + user's lists + visible tasks → chips).
- POST `/api/v1/notes` accepts `documentIds`, `location`, `profileIds`, `listIds`, `taskIds`, `repostedListId` (sanitized + validated).
- **Tag visibility rule** (server): in note GET responses, `resolveNoteTags(note, viewerId)` (extend `src/lib/services/visibility/visibilityService.ts`) filters tagged tasks: public tasks visible to all; private-list tasks only if viewer is a list member. Notes rendering (notesList/noteContent) renders tag chips via this.
- Repost (Phase 4 button) → PublishNote prefilled with `repostedListId` + `listIds`.

**Phase 3 verification**: >5MB rejected; HEIC accepted + converted; photo EXIF → job location; compressed video ≤5MB plays; document attaches to task; Write post with profile/list/task tags renders chips; private-list task tag hidden from non-members.

---

## Phase 4 — Public list profile + social actions — PR D

- `src/app/[locale]/list/[publicUrl]/page.tsx` — copy profile-page pattern: `generateMetadata` via `buildMetadata(..., type: 'list')` (add `'list'` to the union in `src/app/metadata.ts`; OG image = profilePhoto, description = bio), React.cache()d fetch of public endpoint with `x-internal-fetch-secret`, `notFound()` on miss. Bots: existing middleware cookie logic already handles English metadata.
- `GET /api/v1/tasklists/public/[publicUrl]` — public read (only `visibility: PUBLIC`): name/bio/photo/links, wallet address, collaborator profiles, task summary, support (like) count, viewer's isLiked/isMember/hasPendingRequest.
- Buttons (client island):
  - **Candidate** → `POST /api/v1/tasklists/[id]/candidate` `{message?}` → ListRequest PENDING (unique; disabled if already requested/member).
  - **Approve/decline** → `POST /api/v1/tasklists/[id]/requests/[requestId]` `{status}` (OWNER/MANAGER) → ACCEPTED adds `UserReference{userId, role: COLLABORATOR}`. Pending list + controls in list settings UI.
  - **Support** → `POST /api/v1/likes` `entityType: 'tasklist'` (existing route; verify tasklist mapping) + count.
  - **Donate** → `donateDialog.tsx` stub: "Soon we'll support token fundraising for lists" (+ wallet address display).
  - **Repost** → opens PublishNote prefilled (criterion 18).
- `src/app/sitemap.ts`: include public lists.
- **Signup defaults (criterion 1)**: client sets Clerk `unsafeMetadata.locale` at signup completion (`useUser().update`); `POST /api/v1/auth` `user.created` calls `ensureDefaultTaskLists` with that locale (fallback `en`) creating lists+tasks directly from `DAILY_ACTIONS`/`WEEKLY_ACTIONS` constants (no Template dependency; idempotent — checks role before creating; webhook retries safe). Lazy GET /tasklists path stays as fallback for existing users.

**Phase 4 verification**: curl public URL → OG tags (bot cookie honored); candidate → approve → collaborator appears; support toggles count; donate stub; repost → note in Be feed with list tag.

---

## Cross-phase notes

- Per PR: `the-committer` for commits, `npm run build` + `npm run lint` + manual checklist (builder/linter/tester skills); migration scripts run via `the-migrator`.
- Phase 1 lands schema+migrations first so Phase 2's frontend never reads legacy fields; legacy routes keep serving until Phase 2 replaces their consumers.

## Risks

- **RRULE timezones**: store `dtstart`/`occurrenceDate` as YYYY-MM-DD; evaluate RRULE against UTC-midnight dates (`RRule` without tz / `tzid: 'UTC'`) to avoid DST drift. Weekly aggregation semantics preserved from current code.
- **Vercel limits**: presigned direct uploads avoid the ~4.5MB body limit; ffmpeg.wasm via CDN keeps bundles small; `maxDuration` for presign route if needed.
- **Schema drift**: dropped embedded types leave stale fields in Mongo docs (documented, harmless); `legacy Json?` snapshots keep data recoverable.
- **Premium factors**: keep `dailyPremiumFactor`/`weeklyPremiumFactor`/`globalPremiumFactor`; divisor derived from RRULE FREQ instead of list role.
- **Webhook idempotency**: `ensureDefaultTaskLists` already checks for existing lists before creating; safe under Clerk retries.
- **i18n**: 33 locales × new keys per phase; use the-i18n pattern with en.json source of truth.
