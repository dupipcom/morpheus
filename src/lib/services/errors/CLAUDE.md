# Errors Service

## Purpose

Shared structured HTTP error type for the service layer. Services throw `ApiError` instead of returning error shapes; route handlers catch and convert with `toResponse`, keeping routes thin and error contracts consistent.

## Files

- `index.ts` — `ApiError` class + `toResponse` helper

## Key Exports

| Export | Purpose |
|---|---|
| `ApiError` | `Error` subclass carrying `status`, machine-readable `code` (e.g. `FORBIDDEN`, `NOT_FOUND`, `P2002`), and a user-safe `message` |
| `toResponse(error)` | Converts an `ApiError` into `NextResponse.json({ error, code }, { status })` |

## Usage Pattern

```ts
throw new ApiError(403, 'FORBIDDEN', 'Forbidden')

// route handler:
catch (error) {
  if (error instanceof ApiError) return toResponse(error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```

## Consumers

- `src/app/api/v1/comments/route.ts`, `src/app/api/v1/likes/route.ts`
- `src/app/api/v1/tasks/route.ts`, `src/app/api/v1/tasks/[taskId]/route.ts`
- `src/lib/services/social/socialService.ts`, `src/lib/services/ownership/ownershipService.ts`

## Cross-References

- Error conventions: `src/app/api/CLAUDE.md`, `src/app/api/v1/CLAUDE.md`
- `src/lib/services/CLAUDE.md`
