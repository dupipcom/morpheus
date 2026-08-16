# Social Service

## Purpose

Likes and comments for public content (notes, templates, tasklists, profiles) behind a single likeable/commentable entity registry. Extracted from the likes/comments API routes preserving response shapes and error strings; throws `ApiError` from `@/lib/services/errors` (routes convert via `toResponse`). `event`/`task` entities are declared for later phases but routes must not enable them until those phases land.

## Files

- `index.ts` — barrel re-export of the service functions
- `socialService.ts` — entity-registry-driven like/comment logic + comment profile shaping

## Key Exports

| Export | Purpose |
|---|---|
| `normalizeEntityType` | Canonicalize entity type (`list` → `tasklist`); unknown → null |
| `toggleLike` | Like/unlike an entity; returns `{ liked, likeCount }` |
| `getLikeState` | `{ isLiked, likeCount }` for a viewer (anonymous → isLiked false) |
| `getCounts` | Batched like counts per entityId via `groupBy` (kills feed N+1) |
| `listComments` | Comments sorted by like count desc then createdAt desc, with author profile |
| `createComment` | Sanitize (`sanitizeText`) + persist comment, return with profile |
| `deleteComment` | Ownership-enforced delete (403 otherwise) |

## Consumers

- `src/app/api/v1/likes/route.ts` (`toggleLike`, `getLikeState`)
- `src/app/api/v1/comments/route.ts` (`listComments`, `createComment`)

## Notes

- Tasklist likes persist with only entityType/entityId — the `@@unique([userId, entityType, entityId])` index drives the toggle (the Like schema has no tasklist relation field).

## Cross-References

- `src/app/api/v1/likes/CLAUDE.md`, `src/app/api/v1/comments/CLAUDE.md`
- `src/lib/services/errors` (`ApiError`, `toResponse`)
- `src/lib/services/CLAUDE.md`
