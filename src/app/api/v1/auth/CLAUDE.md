# Auth Webhook

## Route
`POST /api/v1/auth`

## Purpose
Receives Clerk webhook events and keeps the internal `User` and public `Profile` records in sync.

## Auth
Verifies `x-internal-fetch-secret` header against `INTERNAL_FETCH_SECRET` (if configured).

## Behavior
Handles these `evt.type` values:
- `user.created`: upserts `User`, then creates a public `Profile` (with Clerk username/image when present).
- `session.created`: ensures a `Profile` exists.
- `user.updated`: syncs Clerk username to the `Profile`.
- `user.deleted`: deletes the `User` (cascade).

Uses `revalidatePath(`/@${clerkUsername}`)` after username changes.

## Response
- `200`: `{ user }` (the affected User, or `null`).
- `400`: `{ error: 'No user ID provided' }`.
- `401`: `{ error: 'Unauthorized' }`.
- `500`: `{ error }`.

## Dependencies
- Prisma models: `User`, `Profile`
