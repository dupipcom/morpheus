# Auth Service

## Purpose

Centralized authentication and authorization for API routes — eliminates the duplicate auth patterns that used to live in 40+ route files. Combines Clerk auth + Prisma user lookup into one call, and canonicalizes list-role authorization through the ownership kit while preserving the legacy `ListRole` response shape (`VIEWER` → `FOLLOWER`).

## Files

- `authService.ts` — auth + list-role authorization functions
- `index.ts` — barrel re-export of types + service
- `types.ts` — shared types for server-side auth/authorization

## Key Exports

| Export | Purpose |
|---|---|
| `getAuthenticatedUser` | Clerk auth + user lookup → `AuthResult` (user or error/status) |
| `getAuthenticatedUserWithFields` | Same, with extra `select` fields returned as `userData` |
| `getUserListRole` | Thin wrapper over ownership `getViewerRole`, maps `VIEWER`→`FOLLOWER`; `MEMBER` maps to null |
| `checkListMembership` | Boolean membership check against allowed roles (default OWNER/MANAGER/COLLABORATOR) |
| `authorizeListAccess` | Wrapper over `getViewerRole` returning detailed `AuthorizationResult` |
| `isResourceOwner` | Sync check: direct `userId` field or OWNER in `users[]` array pattern |
| `canModifyResource` | Sync check: direct owner, or OWNER/MANAGER in `users[]` |

## Consumers

- Job routes: `src/app/api/v1/jobs/[jobId]/route.ts`
- Task routes: `src/app/api/v1/tasks/[taskId]/route.ts`
- List routes: `src/app/api/v1/tasklists/[taskListId]/route.ts`
- Other routes: `src/app/api/v1/days/route.ts`, `src/app/api/v1/delegated-users/route.ts`, `src/app/api/v1/user-dashboard-data/route.ts`, `src/app/api/v1/virtual-number/route.ts`, `src/app/api/v1/virtual-number/numbers/route.ts`

## Cross-References

- Wraps the ownership kit — see `src/lib/services/ownership` (source of `getViewerRole`/`ViewerRole`)
- `src/app/api/v1/jobs/CLAUDE.md`, `src/app/api/v1/tasklists/CLAUDE.md`
- `src/lib/services/CLAUDE.md`
