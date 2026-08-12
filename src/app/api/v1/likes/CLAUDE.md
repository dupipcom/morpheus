# Likes API

## Routes
- `GET /api/v1/likes?entityType=&entityId=`
- `POST /api/v1/likes`

## Auth
GET is public (optional auth to resolve `isLiked`). POST requires Clerk auth.

## Supported `entityType`
`note`, `template`, `tasklist`, `comment`.

## GET
Returns `{ isLiked, likeCount }` for the given entity. Like count is always computed; `isLiked` is `false` for anonymous users.

## POST
Toggles like/unlike:
- If a like exists (unique `userId_entityType_entityId`), deletes it and returns `{ liked: false, likeCount }`.
- Otherwise creates a like and returns `{ liked: true, likeCount }`.

Verifies the entity exists before toggling. Sets legacy relation field (`noteId`/`templateId`/`commentId`/`taskListId`) for backwards compatibility.

## Errors
- `400`: missing/invalid `entityType`/`entityId`.
- `401`: unauthorized (POST).
- `404`: entity or user not found.
- `409`: `P2002` already-liked race.
