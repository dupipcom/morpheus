# Ownership Service

## Purpose

The one place that answers "who owns this and what may the viewer do". Wraps the legacy `getUserListRole` / `authorizeListAccess` semantics. Phase 3 implements USER ownership only; the Phase 7 ORG branch lands here, in one file, instead of per-route.

## Files

- `ownershipService.ts` — owner resolution, role canonicalisation, capability checks
- `index.ts` — barrel re-export

## Key Exports

| Export | Purpose |
|---|---|
| `OwnerRef` | `{ type: 'USER' \| 'ORG', userId?, orgId? }` |
| `EntityKind` | `list \| task \| job \| note \| event \| document \| profile \| wallet` |
| `Capability` | `view \| edit \| manage \| delete \| moderate` |
| `ViewerRole` | `OWNER \| MANAGER \| COLLABORATOR \| MEMBER \| VIEWER` (FOLLOWER canonicalises to VIEWER) |
| `resolveOwner(kind, entity)` | Resolve the owning user reference |
| `getViewerRole(viewerUserId, kind, entityOrId)` | Canonical role or `null` |
| `can(viewerUserId, capability, kind, entityOrId)` | Boolean permission check |
| `assertCan(...)` | Throws `ApiError(403, 'FORBIDDEN', 'Forbidden')` when denied — for route handlers |

## Role → Capability Matrix

- `view`: OWNER / MANAGER / COLLABORATOR / MEMBER / VIEWER
- `edit`: OWNER / MANAGER / COLLABORATOR
- `manage` / `moderate`: OWNER / MANAGER
- `delete`: OWNER (MANAGER also admitted for `task` / `job`)

List-backed kinds (`list` / `task` / `job`) resolve roles from the owning `List.users`; direct-owner kinds (`note` / `event` / `document` / `profile` / `wallet`) admit only the owning user for now.

## Consumers

- `src/lib/services/auth/authService.ts` — thin wrappers (`getUserListRole`, `authorizeListAccess`)
- `src/app/api/v1/tasks/route.ts`, `src/app/api/v1/tasks/[taskId]/route.ts`
- `src/app/api/v1/jobs/route.ts`
- `src/app/api/v1/tasklists/[taskListId]/route.ts`

## Cross-References

- `src/lib/services/auth` (wrapper), `src/lib/services/errors` (`ApiError`)
- `src/app/api/v1/tasks/CLAUDE.md`, `src/app/api/v1/tasklists/CLAUDE.md`
- `src/lib/services/CLAUDE.md`
