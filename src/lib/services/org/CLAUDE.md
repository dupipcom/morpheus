# Organization Service

## Purpose

Clerk Organizations remain the identity/membership source of truth; Prisma mirrors them (`Organization`/`OrgMembership`) for local joins and indexes. The `Organization` row IS the org's public profile (`/{locale}/o/{username}`, reached via the shared `/@username` short form) — no `Profile` row exists for orgs. Handles are globally unique across users, orgs and projects.

## Files

- `orgService.ts` — webhook upserts, pull-repair sync, creation (Clerk + mirror + OWNER + `general` channel + org wallet), public payload
- `index.ts` — barrel re-export

## Key Exports

| Export | Purpose |
|---|---|
| `generateOrgUsername` | Handle generation, cross-checked vs `Profile.username` and `Project.username` |
| `upsertOrganization` / `upsertMembership` | Idempotent webhook mirrors (keyed on clerkOrgId / (orgId, userId)) |
| `syncOrganization` | Pull-based repair from Clerk (webhook loss tolerance; no-ops when Clerk unreachable) |
| `markOrphaned` / `removeMembership` | Clerk deletion handling (retained data stays readable by the steward) |
| `createOrganization` | Clerk org + mirror + OWNER + org wallet (kind ORG) + `general` channel |
| `listOrgsForUser` | The viewer's orgs with role |
| `getPublicOrg` | Allowlist-projected public payload + stats; 404 unless publicVisible + ACTIVE |

## Consumers

- `src/app/api/v1/auth/route.ts` (organization.* webhook events)
- `src/app/api/v1/orgs/**`
- `src/lib/services/ownership` (ORG branch reads `OrgMembership`)
- `src/lib/services/wallet` (recipient resolution for orgs)

## Notes

- `ChatOrgMembership` is kept this phase; both models are synced by the same webhook handler. Removal is a follow-up.
- Sequential writes (no multi-document transactions on MongoDB standalone); every step idempotent.

## Cross-References

- `src/app/api/v1/orgs/CLAUDE.md`
- `src/lib/services/ownership` (the single ORG extension point)
- `src/lib/services/CLAUDE.md`
