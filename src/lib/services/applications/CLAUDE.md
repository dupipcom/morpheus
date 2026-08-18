# Applications Service

## Purpose

`TaskApplication` flow for public job posts (Phase 5): apply to a public task of a published list with `jobBoardEnabled`, review applications as owner/manager, and accept (candidate + list membership) / shortlist / decline.

## Files

- `applicationService.ts` — apply / list / update-status logic
- `types.ts` — inputs + `APPLICATION_STATUSES`
- `index.ts` — barrel re-export

## Key Exports

| Export | Purpose |
|---|---|
| `applyToTask` | Create PENDING application; 404 unpublished/non-public, 400 closed/filled/self-apply, 409 duplicate |
| `listApplications` | Owner/manager only; batch-enriched applicant profiles |
| `updateApplicationStatus` | Accept/shortlist/decline; ACCEPTED adds `Task.candidateIds` + list COLLABORATOR membership (idempotent) |

## Consumers

- `src/app/api/v1/tasks/[taskId]/apply/route.ts`
- `src/app/api/v1/tasks/[taskId]/applications/route.ts`
- `src/app/api/v1/tasks/[taskId]/applications/[applicationId]/route.ts`

## Notes

- Updates are sequential (no multi-document transactions on MongoDB standalone); every step is idempotent so re-running an accept repairs a partial crash. Phase 6 introduces the replica-set-backed transactional path for value movements.
- Status transitions are validated against `APPLICATION_STATUSES`; re-setting the same status is a no-op.

## Cross-References

- `src/lib/services/ownership` (`getViewerRole` for the owning list)
- `src/lib/services/visibility` (`batchEnrichUserProfiles`, `getCurrentUser`)
- `src/app/api/v1/tasks/CLAUDE.md`
- `src/lib/services/CLAUDE.md`
