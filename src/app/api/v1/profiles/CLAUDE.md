# Profiles API

## Routes
- `GET /api/v1/profiles?query=`
- `GET /api/v1/profiles/by-ids?ids=`

## Auth
`/profiles` is public (optional auth for friendship-aware ranking). `/profiles/by-ids` is public.

## GET `/profiles`
Searches profiles by `query` (username/first/last name). Filters by visibility and friendship, sorts close friends → friends → public, and returns top 5 with relationship flags.

## GET `/profiles/by-ids`
Takes comma-separated `ids` (internal `User` ObjectIds) and returns `{ profiles: [{ userId, userName }] }` (max 100).

## Dependencies
- Prisma model: `Profile`
