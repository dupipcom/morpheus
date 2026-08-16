# Finance Service

## Purpose

Single source of truth for the simplified task financial model, replacing `calculateTaskBudgetFromDistribution` and the inlined premium-factor blocks. Model: a list has a budget (fiat, or % of its budget sources), each task has a premium (fiat, or % of the list budget); earnings are the task's equal share of the list budget.

## Files

- `premiumService.ts` — budget/premium/earnings resolution for tasks

## Key Exports

| Export | Purpose |
|---|---|
| `resolveListBudget` | Effective fiat budget: `PERCENT` type → sum of `budgetSources.remainingAmount` × `budgetPercent / 100`; `FIAT` (default) → `list.budget` |
| `applyPremiumFactorsForRRule` | Applies user premium factors using RRULE `FREQ` as divisor selector: DAILY→`daily.auto`, WEEKLY→`weekly.auto`, else global factor |
| `resolveTaskPremium` | Premium fiat, or `PERCENT` of resolved list budget, then premium-factored via rrule |
| `resolveTaskEarnings` | Equal share of list budget across all tasks (`budget / numTasks`) |
| `resolveTaskFinancials` | Combined `{ earnings, premium, totalGains }` for a task |

## Consumers

- `src/app/api/v1/tasks/route.ts`, `src/app/api/v1/tasks/[taskId]/route.ts`
- `src/app/api/v1/tasklists/[taskListId]/clone/route.ts`
- `src/lib/services/job/earningsService.ts` (job invoice + earnings calculations)

## Cross-References

- `src/app/api/v1/tasks/CLAUDE.md`, `src/app/api/v1/jobs/CLAUDE.md`
- Uses `applyPremiumFactors` from `src/lib/utils/earningsUtils` and `rruleFrequency` from `src/lib/services/task/recurrenceService`
- `src/lib/services/CLAUDE.md`
