# Projects API

## Routes
- `GET /api/v1/projects` — projects the viewer participates in (project picker / list form selector)
- `POST /api/v1/projects` — create (creator = OWNER, always unpublished). Body: `{ name, username?, bio?, photoDocumentId?, coverDocumentId?, links?, supportUrl?, collaborators? }`. `username` is an explicit @handle (validated + availability-checked; auto-generated from `name` when omitted)
- `GET /api/v1/projects/available?username=` — `{ available: boolean }` handle availability in the shared `/@` namespace (Project/Profile/Organization usernames + handle shape)
- `GET /api/v1/projects/[projectId]` — detail + member lists (any member)
- `PUT /api/v1/projects/[projectId]` — update public-profile fields (OWNER/MANAGER): `{ name?, bio?, photoDocumentId?, coverDocumentId?, links?, supportUrl?, spotlight?, publicVisible?, collaborators? }`
- `GET /api/v1/projects/public` — discovery feed (spotlight first, cursor pagination, `q` filter)
- `GET /api/v1/projects/public/[username]` — allowlist-projected public payload (unauthenticated; 404 unless `publicVisible`)

## Auth
Clerk auth for CRUD; public routes unauthenticated. Update authorization via `getViewerRole(userId, 'project', …)` (OWNER/MANAGER manage).

## Dependencies
- `src/lib/services/projects` (CRUD, username generation, public serializer, discovery)
- `src/lib/services/ownership` (`project` EntityKind)

## Notes
- `username` handle doubles as the `/p/` URL segment and lives in the shared `/@` namespace (globally unique vs user usernames; Phase 7 adds orgs).
- Support/donate is `supportUrl` (link only); DPIP ledger transfers are a post-Phase-6 follow-up.
