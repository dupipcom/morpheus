# Organizations API

## Routes
- `GET /api/v1/orgs` — orgs the viewer belongs to (with role)
- `POST /api/v1/orgs` — create (Clerk org + mirror + OWNER + `general` channel + org wallet)
- `GET /api/v1/orgs/[orgId]` — detail (members only; includes members/lists/projects)
- `PUT /api/v1/orgs/[orgId]` — public-profile fields (OWNER/ADMIN)
- `GET /api/v1/orgs/[orgId]/members` — members (any member)
- `POST /api/v1/orgs/[orgId]/members` — add member (proxied to Clerk, then mirrored; OWNER/ADMIN)
- `GET /api/v1/orgs/public/[username]` — public payload (unauthenticated; 404 unless published + ACTIVE)

## Auth
Clerk auth for CRUD; public route unauthenticated. Org-role checks via `OrgMembership` (`assertOrgManagerRole` for content creation as org).

## Dependencies
- `src/lib/services/org` (mirror, sync, creation, public payload)
- `src/lib/services/ownership` (ORG branch of `getViewerRole`)

## Notes
- `/{locale}/o/{username}` is the app-dir route; `/@username` resolves via middleware → `/api/v1/resolve-handle`.
- Handles are globally unique across users, orgs and projects.
