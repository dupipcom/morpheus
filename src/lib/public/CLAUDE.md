# Public Kit

Shared helpers for public-facing pages: a cached internal fetch wrapper (public-page pattern) and public URL slugs.

## Files

- `internalFetch.ts` — `internalFetch` / `cachedInternalGet`: internal GET requests with caching (public-page pattern, avoids external round-trips for server-rendered public views)
- `slug.ts` — `buildPublicSlug`, `ensureUniqueSlug`, `slugify`: collision-safe public URL slug generation (used for public tasklists/profiles)

## Consumers

- Public pages under `src/app/[locale]/profile/*` and magazine routes (internal fetch)
- `src/lib/utils/rruleUtils.ts` (`slugifyList` wraps `slugify`)
- `src/lib/services/list` (`generatePublicUrl` via `buildPublicSlug`)

## Cross-References

- `src/lib/utils/CLAUDE.md`
- `src/lib/CLAUDE.md`
