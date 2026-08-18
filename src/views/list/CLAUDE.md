# List Public Views

## Purpose

Public-facing Phase 5 surfaces for lists, job posts and projects. Page shells are server components (SEO, `buildMetadata`-style metadata, `cachedInternalGet` against the public API); the views receive the allowlist-projected payloads and render only action buttons as client islands.

## Files

| File | Purpose |
|---|---|
| `publicListView.tsx` | `/list/[publicUrl]` body — hero, project chip, links, about, open positions grid; like + request-to-join islands |
| `publicJobView.tsx` | `/list/[publicUrl]/jobs/[taskId]` body — job post detail + apply dialog (`POST /api/v1/tasks/[taskId]/apply`) |
| `publicProjectView.tsx` | `/p/[username]` body — hero (spotlight badge), stats, about, job boards, like + support/donate islands |

## API Dependencies

- `GET /api/v1/tasklists/public/[publicUrl]` — list payload (server-side via `cachedInternalGet`)
- `GET /api/v1/projects/public/[username]` — project payload (server-side via `cachedInternalGet`)
- `POST /api/v1/likes` — like/unlike (`tasklist`, `project`)
- `POST /api/v1/tasklists/[id]/candidate` — join request
- `POST /api/v1/tasks/[taskId]/apply` — job application

## Notes

- Public payloads are allowlist projections built in the services — the views never receive private fields.
- Events section on the project page arrives in Phase 8.
- Photo/cover are Phase 4 document ids rendered as plain `<img>` sources.

## Cross-References

- Page shells: `src/app/[locale]/list/[publicUrl]/page.tsx`, `src/app/[locale]/list/[publicUrl]/jobs/[taskId]/page.tsx`, `src/app/[locale]/p/[username]/page.tsx`
- Services: `src/lib/services/list/publicListService.ts`, `src/lib/services/projects/projectService.ts`
- `src/views/CLAUDE.md`
