# Search API

## Route
`GET /api/v1/search?q=`

## Auth
Requires Clerk auth.

## Behavior
Searches `List`, `Profile`, and `Note` collections with visibility/friendship enforcement.

- Requires `q` with length ≥ 2 (empty/short returns `{ results: [] }`).
- Resolves bidirectional friends and close-friends for the current user.
- `searchLists`: own lists, public lists, and FRIENDS/CLOSE_FRIENDS lists owned by bidirectional friends.
- `searchProfiles`: filters by query match and visibility; returns max 5.
- `searchNotes`: own notes, public notes, and FRIENDS/CLOSE_FRIENDS notes.

## Response
`{ results: [{ id, name, type, ... }] }`.

## Dependencies
- `src/lib/services/visibility`
- `src/lib/utils/profileUtils`
- Prisma models: `List`, `Profile`, `Note`, `User`
