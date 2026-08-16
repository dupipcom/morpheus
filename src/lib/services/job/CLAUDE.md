# Job Service

## Purpose

Job workflow domain: status-transition validation and authorization, financial calculations for job invoices and earnings, task-status sync, and compliance audit logging. Financials are resolved through the finance service (`premiumService`) with server-side recomputation; jobs are never deleted (terminal statuses for compliance).

## Files

- `statusValidator.ts` — status transition rules + authorization logic
- `earningsService.ts` — job invoice / earnings / reversal financials
- `taskSync.ts` — syncs Job status to Task status
- `auditLogger.ts` — structured audit log (ISO 27001 / SOC II / DORA)
- `types.ts` — Job/status/invoice types

## Key Exports

| Export | Purpose |
|---|---|
| `STATUS_TRANSITIONS` / `validateStatusTransition` | Allowed transitions per status (REJECTED/CANCELLED terminal) |
| `isAuthorizedForTransition` | Role check; workers can NEVER approve/reject — only OWNER/MANAGER |
| `initializeJobInvoice` | Captures quote/premium/exposure on Job at IN_PROGRESS initiation |
| `updateJobWithTaskValues` | Re-syncs Job earnings/premium/totalGains with latest task values |
| `calculateAndApplyJobEarnings` | Applies earnings: updates user stash/profit/equity/totalGains + Day.ticker/snapshot |
| `reverseJobEarnings` | Subtracts earnings when a job is uncompleted |
| `TASK_STATUS_MAP` / `syncTaskStatus` | Job→Task status mapping (ACCEPTED→DONE, REJECTED→OPEN, …) |
| `createAuditLog` / `logJobStatusChange` / `logJobAcceptance` / `logAuthorizationFailure` | Compliance audit entries (financial amounts never logged — PCI) |

## Consumers

- `src/app/api/v1/jobs/route.ts`, `src/app/api/v1/jobs/[jobId]/route.ts`
- `src/app/api/v1/tasks/[taskId]/route.ts`
- Components (types): `src/components/jobDetailsCard.tsx`, `src/components/taskGrid.tsx`

## Cross-References

- `src/app/api/v1/jobs/CLAUDE.md`, `src/app/api/v1/tasks/CLAUDE.md`
- Uses `src/lib/services/finance/premiumService` and `src/lib/utils/earningsUtils` (`calculateStashAndEarningsDeltas`, `calculateUpdatedUserValues`)
- `src/lib/services/CLAUDE.md`
