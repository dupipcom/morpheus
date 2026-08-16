# Services

Business logic layer (`src/lib/services/`). Routes stay thin: auth → resolve user → authorize → service call → respond. Each service has its own `CLAUDE.md` with purpose, files, exports, and consumers.

## Service map

| Directory | Doc | Purpose | Key exports |
|---|---|---|---|
| `agent/` | `agent/CLAUDE.md` | AI assistant RAG (dashboard filters, chunking, embeddings) | `buildRagForQuery`, `buildAssistantSystemPrompt`, `buildHintMessages`, `resolveAgentContext` |
| `auth/` | `auth/CLAUDE.md` | Auth helpers | `getAuthenticatedUser`, `getUserListRole`, `authorizeListAccess` (thin wrappers over `ownership/`) |
| `caldav/` | `caldav/CLAUDE.md` | Stalwart freebusy for meet-me availability | `fetchCalendarAvailability` |
| `day/` | `day/CLAUDE.md` | Day model progress/transform services | `updateDayProgress`, `transformDayForAnalytics` |
| `errors/` | `errors/CLAUDE.md` | Shared API error type | `ApiError(status, code, message)`, `toResponse(error)` |
| `finance/` | `finance/CLAUDE.md` | Simplified financial engine | `resolveListBudget`, `resolveTaskPremium`, `resolveTaskFinancials` |
| `job/` | `job/CLAUDE.md` | Job workflow | `earningsService`, `statusValidator`, `taskSync`, `auditLogger` |
| `list/` | `list/CLAUDE.md` | Task list CRUD + completion (formerly `tasklist/`) | `getTaskListsForUser`, `createTaskList`, `ensureDefaultTaskLists`, `calculateListCompletionFromJobs` |
| `ownership/` | `ownership/CLAUDE.md` | One place that answers "who owns this and what may the viewer do" | `resolveOwner`, `getViewerRole`, `can`, `assertCan` |
| `sms/` | `sms/CLAUDE.md` | Telnyx SMS conversations + webhook verification | `sendSmsMessage`, `handleTelnyxWebhook`, `verifyTelnyxWebhookSignature` |
| `social/` | `social/CLAUDE.md` | Likes + comments with a single likeable/commentable entity registry | `toggleLike`, `getLikeState`, `getCounts`, `listComments`, `createComment`, `deleteComment` |
| `task/` | `task/CLAUDE.md` | Task recurrence/occurrence engine | `getTasksForDate`, `taskOccursOnDate`, `taskCompletionService` |
| `user/` | `user/CLAUDE.md` | Idempotent user+profile bootstrap | `ensureUserAndProfile` |
| `virtual-number/` | `virtual-number/CLAUDE.md` | Telnyx virtual numbers gated by plan quota | `assignNumber`, `getVirtualNumberEntitlement` |
| `visibility/` | `visibility/CLAUDE.md` | Visibility-aware where clauses + profile enrichment + note access scopes | `buildVisibilityWhereClause`, `batchEnrichUserProfiles`, `resolveNoteVisibilityFilter` |

## Conventions

- Services are stateless; dependencies passed as parameters.
- Return typed results, not raw Prisma models.
- Money: server-side recomputation only (never trust client numbers).
- Ownership checks prefer `ownership/assertCan`; new public feeds reuse `visibility/` helpers.
- Errors thrown as `ApiError`; routes convert with `toResponse`.
- Barrel `index.ts` per service; shared types in `types.ts`.

## Cross-References

- The controller layer lives under `src/app/api/v1` (see `src/app/api/v1/CLAUDE.md`).
- Client-side chat logic lives in `src/lib/chat` (see `src/lib/chat/CLAUDE.md`) — not a service.
- Pure utility helpers live in `src/lib/utils` (see `src/lib/utils/CLAUDE.md`).

## Owners

- `the-api-maintainer` owns the API surface consuming these services.
- `the-model-maintainer` owns the Prisma schema behind them.
