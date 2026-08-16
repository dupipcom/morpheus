# Visibility Service

## Purpose

Centralized visibility-aware query building and profile enrichment for public content, eliminating N+1 queries and route duplication. `noteAccess.ts` is a separate leaf (NOT re-exported from `index.ts`) shared by the notes API and the agent RAG: it resolves delegation scopes directly into note-visibility allow-lists — no hierarchical expansion, and legacy `AI_ENABLED`-visibility notes are treated as PRIVATE.

## Files

- `index.ts` — barrel: re-exports `types.ts` and `visibilityService.ts` (not `noteAccess`)
- `types.ts` — shared types (VisibilityLevel, CurrentUser, ProfileData, VisibilityWhereClause, …)
- `visibilityService.ts` — where-clause builders + batch profile enrichment
- `noteAccess.ts` — delegation-scope → note-visibility filter (notes API + agent RAG)
- `__tests__/noteAccess.test.ts` — unit tests for scope→visibility mapping

## Key Exports

| Export | Purpose |
|---|---|
| `buildVisibilityWhereClause` | PUBLIC + own + friends/close-friends OR clause for `userId` fields |
| `buildVisibilityWhereClauseForUserArray` | Same for `users: [{userId, role}]` (OWNER) entities |
| `getCurrentUser` | Resolve friends/closeFriends for a Clerk userId (null if unauthenticated) |
| `getRelationship` | Bidirectional owner/friend/close-friend check |
| `extractProfileData` | Normalize stored profile JSON into `ProfileData` with field visibilities |
| `batchEnrichUserProfiles` | Single-query profile fetch + visibility-filtered enrichment (Map by id) |
| `getOwnerId` / `enrichEntitiesWithProfiles` | Owner extraction (userId or users[]) + generic entity enrichment |
| `resolveNoteVisibilityFilter` | (noteAccess) scopes → `NoteVisibility[]` allow-list; undefined = full owner access |
| `getNoteVisibilitiesForScope` | (noteAccess) single-scope mapping (PRIVATE → PRIVATE + AI_ENABLED legacy) |

## Consumers

- `noteAccess`: `src/app/api/v1/hint/route.ts`, `src/app/api/v1/notes/route.ts`, `src/lib/services/agent/validation.ts` (agent RAG)
- `visibilityService`: `src/app/api/v1/search/route.ts`, `src/app/api/v1/notes/public/route.ts`, `src/app/api/v1/templates/public/route.ts`

## Cross-References

- `src/app/api/v1/notes/CLAUDE.md`, `src/app/api/v1/search/CLAUDE.md`, `src/app/api/v1/templates/CLAUDE.md`, `src/app/api/v1/hint/CLAUDE.md`
- Delegation util `src/lib/utils/delegation` (`getDelegationScopes`)
- `src/lib/services/CLAUDE.md`
