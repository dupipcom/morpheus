# Projects Service

## Purpose

Public `Project` entity — the container between users/orgs and lists. Phase 5 implements USER ownership (embedded `users UserReference[]`, OWNER/MANAGER/COLLABORATOR); Phase 7 adds `ownerType`/`orgId` (ORG ownership), Phase 8 adds `eventIds`/`events`. The `username` handle doubles as the `/p/` URL segment and lives in the shared `/@` namespace with user and org handles (global uniqueness cross-checked at creation). Support/donate is `supportUrl` (plain link) until the post-Phase-6 DPIP donate follow-up.

## Files

- `projectService.ts` — username generation, CRUD, public serializer, discovery feed
- `types.ts` — create/update inputs + public card shape
- `index.ts` — barrel re-export

## Key Exports

| Export | Purpose |
|---|---|
| `generateProjectUsername` | `slugify(name)` + uniqueness retry across `Project.username` and `Profile.username` (Phase 7 adds orgs) |
| `createProject` | Create (always unpublished, creator = OWNER, optional collaborators) |
| `updateProject` | Update public-profile fields; OWNER/MANAGER only; collaborators replace non-owners |
| `getPublicProject` | Allowlist-projected public payload + stats (listCount/likeCount/memberCount computed) + publishedLists + viewer block; 404 unless `publicVisible` |
| `listPublicProjects` | Discovery feed (spotlight first, then updatedAt desc), cursor pagination, batched like counts |

## Consumers

- `src/app/api/v1/projects/route.ts`, `src/app/api/v1/projects/[projectId]/route.ts`, `src/app/api/v1/projects/public/route.ts`, `src/app/api/v1/projects/public/[username]/route.ts`

## Notes

- Privacy: allowlist projection in `getPublicProject` — never delete fields from a full record.
- Stats are computed per request (counts), never stored.
- Ownership checks via `src/lib/services/ownership` (`getViewerRole(userId, 'project', …)`).

## Cross-References

- `src/lib/services/social` (`getLikeState`/`getCounts` — `entityType: 'project'`)
- `src/lib/services/visibility` (`batchEnrichUserProfiles`, `getCurrentUser`)
- `src/lib/public/slug` (`slugify`, `ensureUniqueSlug`)
- `src/app/api/v1/projects/CLAUDE.md`
- `src/lib/services/CLAUDE.md`
