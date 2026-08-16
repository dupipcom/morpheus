# Agent Service

## Purpose

DeepSeek-assistant RAG pipeline shared by the chat server action (`agentActions.ts`) and `GET /api/v1/hint`. Dashboard filters (date range + dimensions) drive a minimal MongoDB `Day` select; compact days are chunked to token budgets, embedded with `deepseek-embed` (cosine top-K), with recency fallback so chat keeps working when embeddings are unavailable. Everything is in-memory per request and discarded — nothing persisted (Vercel serverless).

## Files

- `chunker.ts` — token-budget chunking: compact days grouped week/month/year (coarsened past `MAX_CHUNKS`), notes and raw text split with paragraph-aware breaks
- `daySelect.ts` — dimension → Prisma select/where mapping, payload compaction, "honest" profit calc, single-line day serialization
- `embeddings.ts` — `deepseek-embed` batched embeddings + cosine similarity + top-K retrieval (per-request vector space)
- `index.ts` — barrel export of all modules
- `prompt.ts` — system-prompt builders for the two DeepSeek consumers (assistant chat, hint JSON-mode)
- `psychDoc.ts` — cognitive-psychology reference doc: heading-split at module load (mtime-keyed cache), lexical pre-filter + cosine re-rank
- `rag.ts` — orchestrator: fetch compact days/notes → chunk → embed → top-K, recency fallback
- `types.ts` — shared types + dimension constants
- `validation.ts` — server-side validation of the client filter context + delegation-scope resolution

## Key Exports

| Export | Purpose |
|---|---|
| `AGENT_DIMENSIONS` / `AgentDimension` | whitelist of assistant-askable dashboard dimensions |
| `AgentFilterContext` / `ResolvedAgentContext` | client → server contract and post-validation/delegation context |
| `validateAndClampFilterContext` | format-check/clamp dates, whitelist dimensions |
| `resolveAgentContext` | resolve target user via delegation records; never trusts client `userId` |
| `getAllowedDayVisibilities` | delegation scope → Day visibility allow-list (shared with user-dashboard-data route) |
| `buildDaySelectForDimensions` / `buildDayWhere` | minimal Prisma `Day` select/where from dimensions + range |
| `compactDay` / `dayChunkText` | trim a raw Day row to selected dimensions; single-line serialization |
| `calculateDayProfit` | "honest" profit from ticker `{earnings, premium}` |
| `chunkCompactDays` / `chunkNotes` / `chunkRawText` | chunkers with `estimateTokens`, `MAX_CHUNKS`, `MAX_CHUNK_TOKENS` |
| `embedTexts` / `cosineSimilarity` / `retrieveTopK` | DeepSeek embedding batch + cosine ranking; null on failure → caller fallback |
| `fetchCompactDays` / `fetchCompactNotes` | minimal `Day` payload and AI-opted-in notes for the resolved context |
| `buildRagForQuery` / `RagResult` | per-request RAG pipeline; recency fallback |
| `loadPsychDocChunks` / `pickDocChunksForQuery` | reference-doc loading and query ranking |
| `buildAssistantSystemPrompt` / `buildHintMessages` | prompt builders (hint uses JSON-mode, zod-validated) |

## Consumers

- `src/app/api/v1/hint/route.ts` — `GET /api/v1/hint`
- `src/components/agentActions.ts` — chat server action
- `src/app/api/v1/user-dashboard-data/route.ts` — `getAllowedDayVisibilities`
- Types only: `src/components/agentChat.tsx`, `src/views/dashboard/dashboardView.tsx`

## Cross-References

- `src/app/api/v1/hint/CLAUDE.md`, `src/app/api/v1/user-dashboard-data/CLAUDE.md`
- `src/lib/deepseek.ts` (embedding/chat clients)
- Sibling `src/lib/services/day` (`MoodKey` types), `src/lib/services/visibility/noteAccess`

## Notes

- `daySelect.ts` never selects `analysis`/`productivity` dimensions (recursion guard — they contain the assistant's own output).
- `calculateDayProfit` diverges from `day.calculateProfitFromTicker` (which reads a `profit` field no writer sets).
- Hint route uses `response_format {type:'json_object'}` (DeepSeek has no `json_schema` mode); contract enforced by zod at parse time.
