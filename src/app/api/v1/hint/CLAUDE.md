# Hint (AI Insight) API

## Route
`GET /api/v1/hint?locale=&userId=`

## Auth
Requires Clerk auth. When `userId` targets another user, the current user must have a `Delegation` from that user.

## Purpose
Generates (or returns cached) cognitive-psychology insights across mood and task dimensions using an OpenAI RAG vector store.

## Behavior
- `locale` defaults to `en`.
- `userId` defaults to the requesting user's internal id.
- For delegated target access, resolves the effective delegation scope and restricts visible `Day` visibilities.
- If a persisted `analysis.hint` exists for today (full access only), returns it directly.
- Otherwise builds historical entries, ensures the RAG vector store/file, calls `openai.responses.create` with a JSON-schema output, parses it, and persists it into today's `Day.analysis.hint`.

## Response
- `200`: `{ result: parsedOutput }` (or cached hint).
- `403`: unauthorized/unknown delegation scope.
- `404`: user/target not found.
- `500`: `{ error: 'Failed to generate response' }`.

## Notes
`revalidate = 86400`, `maxDuration = 120`. RAG source file: `src/app/api/v1/hint/rag/cognitive-psychology-archiveorg.md`.
