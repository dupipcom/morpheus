# Friend Requests API

## Route
`GET /api/v1/friend-requests`

## Auth
Requires Clerk auth; derives internal `User`.

## Behavior
Returns the current user's incoming friend requests with filtered profile details. Ensures the current user and profile exist (creates if missing). For each requester, it:
- Resolves bidirectional friendship/close-friendship.
- Extracts profile data from the nested `Profile.data` structure.
- Applies `filterProfileFields` visibility filtering for non-owner viewing.

## Response
`{ friendRequests: [{ id, userId, profile }] }`.

## Dependencies
- `src/lib/utils/profileUtils` (`filterProfileFields`)
- Prisma models: `User`, `Profile`
