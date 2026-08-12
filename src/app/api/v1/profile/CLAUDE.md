# Profile API

## Routes
- `GET /api/v1/profile`
- `POST /api/v1/profile`
- `GET /api/v1/profile/[userName]`
- `GET /api/v1/profile/[userName]/notes`

## Auth
`/profile` GET/POST require Clerk auth. `/[userName]` and `/[userName]/notes` are public but relationship-aware.

## GET `/profile`
Returns current user + profile + collaborating task lists. Ensures a `Profile` exists, syncs username/image from Clerk, and returns lists where the user is a COLLABORATOR/MANAGER.

## POST `/profile`
Creates/updates the current user's profile. Username and profile picture always come from Clerk; firstName/lastName/bio/charts/links/meetMe are sanitized and stored with visibility flags. Revalidates the public profile path via `/api/v1/revalidate`.

## GET `/profile/[userName]`
Returns a public profile by root-level username, filtering fields by owner/friend/close-friend relationship. Includes public charts, visible templates and task lists (with preview comments and `isLiked`).

## GET `/profile/[userName]/notes`
Returns relationship-filtered notes for a profile. Supports `visibility` and `sort`/`order`. Notes include `isLiked` and `relevanceScore`.

## Dependencies
- `src/lib/utils/profileUtils`
- `src/lib/utils/noteRelevance`
- `src/lib/services/visibility`
- Prisma models: `Profile`, `User`, `Template`, `List`, `Note`, `Like`, `Comment`
