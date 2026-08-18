# Public Tasklists API

## Routes
- `GET /api/v1/tasklists/public` — job-board discovery feed across published lists (cursor pagination; `q`/`area`/`category` filters)
- `GET /api/v1/tasklists/public/[publicUrl]` — allowlist-projected public payload for a published list (unauthenticated; optional session enriches the viewer block)

## Auth
None required (public). When a Clerk session is present, the `viewer` block gains `isLiked` / `isMember` / `hasPendingRequest` / `hasApplied`.

## Dependencies
- `src/lib/services/list/publicListService` (`listPublicTaskLists`, `getPublicTaskList`)
- `src/lib/services/social` (`getLikeState`, `getCounts`)
- `src/lib/services/visibility` (`batchEnrichUserProfiles`)

## Notes
- A list is publicly visible when `publicVisible: true` AND `visibility: 'PUBLIC'`; 404 otherwise (no existence leak).
- Privacy: allowlist projection in the service — private tasks/budgets/earnings never enter the payload.
