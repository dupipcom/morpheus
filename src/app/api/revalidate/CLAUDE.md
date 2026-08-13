# Revalidate

## Route
`POST /api/revalidate`

## Purpose
Next.js cache revalidation helper. Revalidates supplied paths and/or tags.

## Auth
Allows either an authenticated Clerk session OR `secretKey === process.env.REVALIDATE_SECRET_KEY`.

## Request Body
```json
{ "paths": ["/@username"], "tags": ["tag"], "secretKey": "..." }
```

## Behavior
- If `paths` is an array, calls `revalidatePath(path)` for each.
- If `tags` is an array, calls `revalidateTag(tag)` for each.

## Response
- `200`: `{ revalidated: true, paths, tags, now }`
- `401`: `{ error: 'Not authenticated' }`
- `500`: `{ error: 'Internal server error' }`

## Notes
Called internally by `/api/v1/user` and `/api/v1/profile` after Clerk username/image changes to revalidate public profile paths.
