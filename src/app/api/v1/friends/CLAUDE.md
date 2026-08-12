# Friends API

## Routes
- `GET /api/v1/friends`
- `POST /api/v1/friends/unfriend`

## Auth
Requires Clerk auth; derives internal `User`.

## GET `/friends`
Returns the current user's friends with filtered profile details (same visibility pattern as friend-requests). Ensures the current user/profile exist.

## POST `/friends/unfriend`
Body: `{ friendId }` (internal `User` id). Removes the friendship from both users' `friends` arrays and, if present, both `closeFriends` arrays.

## Response
- `{ friends: [...] }`
- `{ success: true, message }`

## Dependencies
- `src/lib/utils/profileUtils`
- Prisma models: `User`, `Profile`
