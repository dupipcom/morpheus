# User Service

## Purpose

One idempotent bootstrap helper that guarantees a `User` row (by Clerk id) and a public `Profile` row exist, pulling `username`/`imageUrl` from Clerk so `/@username` lookups work immediately after signup. Never throws — all errors are swallowed and logged so middleware-adjacent call sites stay safe.

## Files

- `ensureUserAndProfile.ts` — the only file in this service

## Key Exports

| Export | Purpose |
|---|---|
| `ensureUserAndProfile(clerkUserId, clerkUserOverride?)` | Idempotent user+profile ensure; handles P2002 races (user + profile create); optional pre-fetched Clerk user to avoid a `clerkClient()` call |

## Consumers

- `src/app/api/v1/user/route.ts`, `src/app/api/v1/user/ensure/route.ts`
- `src/app/api/v1/auth/route.ts`, `src/app/api/v1/profile/route.ts`
- `src/app/[locale]/app/layout.tsx` (per-request bootstrap)

## Cross-References

- `src/app/api/v1/user/CLAUDE.md`, `src/app/api/v1/auth/CLAUDE.md`, `src/app/api/v1/profile/CLAUDE.md`
- Related: `src/lib/services/auth/authService.ts` (`getAuthenticatedUser` performs the user lookup this helper bootstraps)
- `src/lib/services/CLAUDE.md`
