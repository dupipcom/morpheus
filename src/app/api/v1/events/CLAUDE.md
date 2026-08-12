# Events API

## Routes
- `GET /api/v1/events`
- `POST /api/v1/events`
- `PUT /api/v1/events/[id]`
- `DELETE /api/v1/events/[id]`

## Auth
Requires Clerk auth; derives internal `User` by `userId`.

## GET
Returns the current user's life events: `{ lifeEvents: user.events }`.

## POST
Creates a life event. Body: `{ name, quality? }`. Requires `name`; sanitizes `name` with `sanitizeText`. Creates a `User` if missing.

## PUT/DELETE `[id]`
Updates or deletes an own event (`where: { id, userId }`). Requires `name` for update.

## Dependencies
- Prisma models: `Event`, `User`
