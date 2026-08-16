# Lib

Core application library under `src/lib/`: business-logic services, shared utils/hooks/constants/contexts, the chat library, and SDK initializations. Each subdirectory has its own `CLAUDE.md`.

## Layout

| Path | Purpose | Doc |
|---|---|---|
| `services/` | Business-logic layer (auth, tasks, jobs, finance, RAG, SMS, …) | `services/CLAUDE.md` |
| `chat/` | Chat library: orgs/channels/DMs/threads, Ably realtime, unread email digest | `chat/CLAUDE.md` |
| `utils/` | Pure helpers: earnings/budget math, sanitization, RRULE, date kit, SWR fetchers | `utils/CLAUDE.md` |
| `hooks/` | Custom React hooks (SWR data fetching, task handlers, feature flags) | `hooks/CLAUDE.md` |
| `constants/` | Mobile nav geometry, delegation role keys, visibility enums | `constants/CLAUDE.md` |
| `contexts/` | `I18nProvider`, `NotesRefreshProvider` | `contexts/CLAUDE.md` |
| `public/` | Public-page kit: cached internal fetch + public slugs | `public/CLAUDE.md` |

## Top-Level Files

| File | Purpose |
|---|---|
| `prisma.ts` | PrismaClient singleton (globalThis-cached, non-production); imports from `@/generated/prisma/client` |
| `types.ts` | `ListProductivity` interface + `Productivity` record type |
| `i18n.ts` | `Locale` type (33 locales), `loadTranslations`/`loadTranslationsSync`, dot-notation `t`, `formatDate`, `isValidLocale`, `getBestLocale` (Accept-Language matching) |
| `deepseek.ts` | `deepseekChat` AI-SDK provider (`deepseek-chat`) + lazy OpenAI-compatible client for embeddings and JSON-mode completions; model/URL constants |
| `openai.ts` | Bare OpenAI client — preserved for future AI integrations, currently disabled in the chat UI in favor of DeepSeek |
| `payload.ts` | `server-only` PayloadSDK init + cached fetchers (`fetchPages`, `fetchArticles`, `fetchEpisodeBySlug`, paginated variants for sitemaps) |
| `logger.ts` | `logger(str)` console logger with `dpip::morpheus::` prefix and color coding |
| `clerkLocalization.ts` | Maps locale JSON `common.*` keys onto Clerk's `userProfile`/`userButton` labels; `useClerkLocalization` hook |
| `contexts.ts` | Legacy `GlobalContext` (theme, session, revealRedacted, selectedDate, isNavigating, dayData) — slimmed during the Do rebuild; task lists moved to `useTaskLists` SWR |

## Conventions

- Services are stateless and throw `ApiError` (`services/errors`); routes convert with `toResponse`.
- Money is recomputed server-side only (never trust client numbers).
- User text is sanitized with `utils/sanitize` before persistence.
- Client data fetching goes through SWR hooks in `hooks/` and `utils/userUtils.ts`; local filtering preferred over refetch-on-query-change.
- Dates: all persisted dates are UTC `YYYY-MM-DD` strings (`utils/date.ts`).

## Cross-References

- Controller layer: `src/app/api/v1` (see `src/app/api/v1/CLAUDE.md`)
- Views: `src/views/` (see `src/views/CLAUDE.md`)
- Schema: `prisma/schema.prisma` (patterns in `.claude/rules/04-database.md`)

## Owners

- `the-api-maintainer` owns the service layer and its consumers.
- `the-model-maintainer` owns the Prisma schema behind the services.
