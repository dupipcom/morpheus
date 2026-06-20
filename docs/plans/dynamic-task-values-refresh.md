# Plan: Dynamic Task Premium/Earnings/TotalGains Refresh

## Problem Statement

When budget distribution is set to **Equal**, **Area**, or **Category** modes, task bounty values (premium, earnings, totalGains) can become stale or inconsistent because:

1. **Equal distribution**: Adding/removing tasks changes each task's share (e.g., 100/10 = 10 per task → 100/11 = 9.09 per task)
2. **Area distribution**: Task count per area affects per-task allocation
3. **Category distribution**: Task count per category affects per-task allocation

**Risk**: Users see one value when viewing tasks but receive a different amount when completing, leading to confusion or perceived loss.

## Current State Analysis

### How Values Are Currently Calculated

| Stage | Location | Behavior |
|-------|----------|----------|
| **Fetch (GET)** | `/api/v1/tasks`, `/api/v1/tasklists` | Calculates dynamically via `calculateTaskBudgetFromDistribution()` |
| **Job Start** | `initializeJobInvoice()` | Captures snapshot in `job.invoice` |
| **Job Complete** | `calculateAndApplyJobEarnings()` | Recalculates with safety checks, applies factors |

### Existing Safety Checks (in `calculateTaskBudgetFromDistribution`)

1. ✅ Earnings capped by `list.remainingBudget`
2. ✅ Earnings capped by `user.equity`
3. ⚠️ Earnings capped by stored `task.earnings` (may be stale)

### Current Gap

- Task fields (`earnings`, `premium`, `totalGains`) are **set once** when task is created
- When list structure changes (tasks added/removed), stored values become **stale**
- SAFETY CHECK 3 uses these stale values, which may no longer match the distribution calculation

## Proposed Solution

### Approach: Persist + Refresh + Lock

**Core Principle**: Ensure displayed values always match what users will receive by:
1. **Refreshing stored values** whenever list structure changes
2. **Locking values at job start** to guarantee the displayed amount is paid

### Implementation Steps

#### Step 1: Create Task Value Refresh Service
**File**: `src/lib/services/task/taskValueRefreshService.ts`

Create a service that recalculates and persists `earnings`, `premium`, `totalGains` for ALL tasks in a list:

```typescript
export async function refreshListTaskValues(listId: string): Promise<void> {
  // 1. Fetch list with all tasks
  // 2. For each task, call calculateTaskBudgetFromDistribution()
  // 3. Update task.earnings, task.premium, task.totalGains
}
```

#### Step 2: Trigger Refresh on List Mutations
Update these locations to call `refreshListTaskValues()`:

| File | Function | Trigger |
|------|----------|---------|
| `src/lib/services/tasklist/taskListCrudService.ts` | `createTaskList()` | After creating list with tasks |
| `src/lib/services/tasklist/taskListCrudService.ts` | `updateTaskList()` | When budget, premiumPercentage, or budgetDistribution changes |
| `src/app/api/v1/tasks/route.ts` | `POST` (create task) | After adding task to list |
| `src/app/api/v1/tasks/[taskId]/route.ts` | `DELETE` | After removing task from list |

#### Step 3: Ensure Job Uses Locked Earnings Values
Update `calculateAndApplyJobEarnings()` in `src/lib/services/job/earningsService.ts`:

- Use `job.invoice.quote` for earnings (locked at job start)
- Continue calculating premium dynamically with `applyPremiumFactors()`
- Honor invoice values even if `remainingBudget` is insufficient (allow negative)

```typescript
// Use locked earnings from invoice
const earnings = job.invoice?.quote ?? calculateTaskBudgetFromDistribution(...).budget
// Premium remains dynamic
const rawPremium = calculateTaskBudgetFromDistribution(...).premium
const premium = applyPremiumFactors(rawPremium, listRole, premiumFactorSettings)
```

#### Step 4: Update Remaining Budget Handling
In job completion flow, allow remaining budget to go negative:

```typescript
// After job completion, update remainingBudget (may become negative)
await prisma.list.update({
  where: { id: listId },
  data: { remainingBudget: (remainingBudget - earnings).toString() }
})
```

### Key Files to Modify

1. **New File**: `src/lib/services/task/taskValueRefreshService.ts`
   - `refreshListTaskValues(listId)` - recalculates all task values in a list
   - `refreshTaskValue(taskId, list)` - recalculates single task value

2. **Modify**: `src/lib/services/tasklist/taskListCrudService.ts`
   - Add refresh calls in `updateTaskList()` and `createTaskList()`

3. **Modify**: `src/app/api/v1/tasks/route.ts`
   - Add refresh call after task creation

4. **Modify**: `src/lib/services/job/earningsService.ts`
   - Update `calculateAndApplyJobEarnings()` to use invoice values
   - Add budget insufficiency handling

5. **Modify**: `src/lib/services/task/taskMigrationService.ts`
   - Remove SAFETY CHECK 3 (stale value check) - no longer needed if values are kept fresh

### Edge Cases to Handle

| Scenario | Behavior |
|----------|----------|
| Task added while another user is completing | New task gets fresh values; in-progress jobs use locked invoice earnings |
| Budget reduced below sum of in-progress jobs | Jobs complete with locked values; remaining budget can go negative |
| Distribution mode changed | All tasks get new values via synchronous refresh |
| Concurrent task completions | Each job uses its own locked invoice earnings; premium calculated dynamically |
| Empty list after all tasks removed | No-op (no tasks to refresh) |

### Implementation Order

1. Create `taskValueRefreshService.ts` with `refreshListTaskValues()`
2. Add refresh calls to task creation endpoint
3. Add refresh calls to `updateTaskList()` and `createTaskList()`
4. Update `calculateAndApplyJobEarnings()` to use locked invoice earnings
5. Remove stale SAFETY CHECK 3 from `calculateTaskBudgetFromDistribution()`
6. Add task deletion trigger (if endpoint exists)

## Verification Plan

1. **Unit Tests**:
   - Test `refreshListTaskValues()` recalculates correctly for each distribution mode
   - Test that adding a task triggers refresh of all sibling tasks

2. **Integration Tests**:
   - Create list with 10 tasks, verify each gets 1/10 of budget
   - Add 11th task, verify all tasks now show 1/11 of budget
   - Start job on task, add 12th task, verify in-progress job still has original value

3. **Manual Testing**:
   - Create Equal distribution list with budget 100 and 10 tasks
   - Verify each task shows $10 earnings
   - Add new task, verify all tasks now show ~$9.09
   - Start completion on one task, add another task
   - Complete the task, verify original $9.09 was paid (not new lower amount)

## Design Decisions

1. **Budget Insufficiency**: Pay full invoice amount even if it means negative remaining budget
   - Honors the quoted value to prevent user disappointment
   - Budget tracking may show deficit but users get what was promised

2. **Refresh Timing**: Synchronous refresh when list changes
   - Simpler implementation, ensures consistency
   - Acceptable performance for typical list sizes

3. **Premium Handling**: Keep premium dynamic (NOT locked at job start)
   - Premium continues to be calculated at completion time with current factors
   - Earnings are locked at job start via invoice
   - This matches current behavior where premium factors can change
