# Persons API

## Routes
- `GET /api/v1/persons`
- `POST /api/v1/persons`
- `PUT /api/v1/persons/[id]`
- `DELETE /api/v1/persons/[id]`

## Auth
Requires Clerk auth; derives internal `User`.

## GET
Returns the current user's persons: `{ contacts: user.persons }`.

## POST
Creates a person. Body: `{ name, interactionQuality? }`. Requires `name`; sanitizes with `sanitizeText`. Creates a `User` if missing.

## PUT/DELETE `[id]`
Updates or deletes an own person (`where: { id, userId }`). Update requires `name` and stores `quality`.

## Dependencies
- Prisma models: `Person`, `User`
