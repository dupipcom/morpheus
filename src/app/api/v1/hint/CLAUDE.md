# Hint (AI Insight) API

## Route
`GET /api/v1/hint?locale=&userId=`

## Auth
Requires Clerk auth. When `userId` targets another user, the current user must have a `Delegation` from that user.

## Purpose
Generates (or returns cached) cognitive-psychology insights across mood and task dimensions using DeepSeek (`deepseek-chat`) with a per-request in-memory RAG context (user data chunks + cognitive-psychology reference excerpts embedded via `deepseek-embed`).

## Behavior
- `locale` defaults to `en`.
- `userId` defaults to the requesting user's internal id.
- For delegated target access, resolves the effective delegation scope and restricts visible `Day` visibilities (a defensive `DOC_ENABLED` scope maps to no days — it is not grantable). Notes are never part of the hint context.
- If a persisted `analysis.hint` exists for today (full access only), returns it directly.
- Otherwise fetches the minimal Day payload via the shared agent services (`src/lib/services/agent/`), chunks it, retrieves the most relevant chunks, calls DeepSeek Chat Completions with `response_format: {type:'json_object'}`, validates the 11-field output with zod (one corrective retry on invalid output), and persists it into today's `Day.analysis.hint`.

## Response
- `200`: `{ result: parsedOutput }` (or cached hint).
- `403`: unauthorized/unknown delegation scope.
- `404`: user/target not found.
- `500`: `{ error: 'Failed to generate response' }`.

## Notes
`revalidate = 86400`, `maxDuration = 120`. RAG source file: `src/app/api/v1/hint/rag/cognitive-psychology-archiveorg.md` (chunked by `psychDoc.ts`). Requires `DEEPSEEK_API_KEY`.
