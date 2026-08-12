# Friend Request API

## Routes
- `POST /api/v1/friend-request` — send a friend request by username.
- `POST /api/v1/friend-request/action` — accept or decline an incoming request.

## Auth
Requires Clerk auth; derives internal `User` by `userId`.

## POST `/friend-request`
Body: `{ targetUserName }`. Looks up target by root-level `Profile.username`. Guards against self, already-friends, already-close-friends, and duplicate requests. Pushes the current user's internal id into the target's `friendRequests` array.

## POST `/friend-request/action`
Body: `{ action, requesterId }`. `action` must be `accept` or `decline`; `requesterId` is an internal `User` id.
- `accept`: removes from `friendRequests` and pushes each user into the other's `friends`.
- `decline`: removes from `friendRequests` only.

## Errors
- `400`: missing fields, invalid action, self, already friends, duplicate request.
- `401`: unauthorized.
- `404`: target/requester/request not found.

## Dependencies
- Prisma models: `User`, `Profile`
