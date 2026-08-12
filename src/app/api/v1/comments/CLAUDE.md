# Comments API

## Routes
- `GET /api/v1/comments?entityType=&entityId=`
- `POST /api/v1/comments`
- `PUT /api/v1/comments/[commentId]`
- `DELETE /api/v1/comments/[commentId]`

## Auth
GET is public (no auth check). POST/PUT/DELETE require Clerk auth and derive the internal `User` by `userId`.

## GET
Lists comments for an entity, sorted by like count desc then createdAt desc, with author profile and like count.

Query params:
- `entityType`: `note` | `template` | `tasklist`/`list` | `profile` | `event`
- `entityId`: the entity ObjectId.

## POST
Creates a comment for the given entity. Body: `{ content, entityType, entityId }`. Sanitizes `content` with `sanitizeText`. Verifies the entity exists.

## PUT/DELETE `[commentId]`
Updates (own) or deletes (own) a comment. Both enforce `comment.userId === user.id`.

## Errors
- `400`: missing/invalid `entityType`, `entityId`, or `content`.
- `401`: unauthorized.
- `403`: not the owner (update/delete).
- `404`: entity or comment not found.

## Notes
`entityType` maps to a different relation field on `Comment` (`noteId`, `templateId`, `listId`, `profileId`, `eventId`). The `comment` model also stores the legacy `noteId` for backwards compatibility.
