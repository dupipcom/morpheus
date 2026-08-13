# Things API

## Routes
- `GET /api/v1/things`
- `POST /api/v1/things`

## Auth
Requires Clerk auth; derives internal `User`.

## GET
Returns the current user's things: `{ things: user.things }`.

## POST
Creates a thing. Body: `{ name, quality?, noteIds? }`. Requires `name`; sanitizes with `sanitizeText`. Creates a `User` if missing.

## Dependencies
- Prisma models: `Thing`, `User`
