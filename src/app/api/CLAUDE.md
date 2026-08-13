# API Surface

This directory contains the application's HTTP API.

## Layout

| Path | Purpose |
|---|---|
| `v1/` | Main REST API (see `v1/CLAUDE.md` for the index) |
| `cron/unread-chat-emails/` | Cron endpoint for hourly unread-chat email fan-out |
| `revalidate/` | Next.js cache revalidation helper (path/tag based) |

## Conventions

- Auth is via Clerk. Routes read the Clerk `userId` with `await auth()` from `@clerk/nextjs/server`, then resolve the internal `User` record from `@/lib/prisma`.
- Response shape is usually either `{ <resource>: ... }` or `{ error: string }` with an appropriate HTTP status.
- Errors returned to clients are generic; details are logged server-side.
- User-generated text is sanitized with `sanitizeText` / `sanitizeHTML` from `@/lib/utils/sanitize` before persistence.
- The machine-readable contract lives in `openapi.yaml`.

## Documentation Index

- `v1/CLAUDE.md` — summary of all v1 endpoints.
- `cron/unread-chat-emails/CLAUDE.md`
- `revalidate/CLAUDE.md`
- Per-resource docs live beside each route (e.g., `v1/chat/CLAUDE.md`).

## Owners

- `the-api-maintainer` (`.claude/skills/the-api-maintainer/SKILL.md`) owns this surface.
- `the-model-maintainer` (`.claude/skills/the-model-maintainer/SKILL.md`) owns the underlying Prisma schema.
