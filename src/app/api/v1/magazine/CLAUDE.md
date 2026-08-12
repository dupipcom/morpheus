# Magazine API

## Route
`GET /api/v1/magazine?locale=`

## Auth
Public.

## Behavior
Fetches all Payload CMS articles via `fetchAllArticles(locale)` from `src/lib/payload`.

## Response
`fetchAllArticles` result (articles array or object).

## Errors
- `500`: `{ error: 'Failed to fetch articles' }`.
