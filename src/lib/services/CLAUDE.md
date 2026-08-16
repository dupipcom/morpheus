# Services

Business logic layer (`src/lib/services/`). Routes stay thin: auth → resolve user → authorize → service call → respond.

## Service map

| Directory | Purpose | Key exports |
|---|---|---|
| `agent/` | AI assistant RAG (dashboard filters, chunking, embeddings) | per-request vector space, `GET /api/v1/hint` support |
| `auth/` | Auth helpers | `getAuthenticatedUser`, `getUserListRole`, `authorizeListAccess` (thin wrappers over `ownership/`) |
| `chat/` | Realtime chat (orgs, channels, DMs, threads, Ably events) | — |
| `day/` | Day model progress/transform services | `updateDayProgress` |
| `finance/` | Simplified financial engine | `premiumService` (`resolveListBudget`, `resolveTaskPremium`) |
| `job/` | Job workflow | `earningsService`, `statusValidator`, `taskSync`, `auditLogger` |
| `list/` | Task list CRUD + completion (formerly `tasklist/`) | `getTaskListsForUser`, `createTaskList`, `ensureDefaultTaskLists`, `calculateListCompletionFromJobs` |
| `ownership/` | One place that answers "who owns this and what may the viewer do" | `resolveOwner`, `getViewerRole`, `can`, `assertCan` |
| `social/` | Likes + comments with a single likeable/commentable entity registry | `toggleLike`, `getLikeState`, `getCounts`, `listComments`, `createComment`, `deleteComment`, `normalizeEntityType` |
| `task/` | Task recurrence/occurrence engine | `getTasksForDate`, `taskOccursOnDate`, `taskCompletionService` |
| `visibility/` | Visibility-aware where clauses + profile enrichment | `buildVisibilityWhereClause`, `batchEnrichUserProfiles` |
| `errors.ts` | Shared API error type | `ApiError(status, code, message)`, `toResponse(error)` |

## Conventions

- Services are stateless; dependencies passed as parameters.
- Return typed results, not raw Prisma models.
- Money: server-side recomputation only (never trust client numbers).
- Ownership checks prefer `ownership/assertCan`; new public feeds reuse `visibility/` helpers.
- Errors thrown as `ApiError`; routes convert with `toResponse`.

## Shared kits (not services)

- `src/lib/utils/date.ts` — date kit: `getWeekNumber({week,year})`, `toDateKey`, `fromDateKey`, `startOfDayUTC`, `formatDateForLocale`, `isSameDateKey`. All persisted dates are UTC `YYYY-MM-DD` strings.
- `src/lib/public/` — `internalFetch.cachedInternalGet` (public-page pattern) + `slug` (`buildPublicSlug`, `ensureUniqueSlug`).

## Owners

- `the-api-maintainer` owns the API surface consuming these services.
- `the-model-maintainer` owns the Prisma schema behind them.
