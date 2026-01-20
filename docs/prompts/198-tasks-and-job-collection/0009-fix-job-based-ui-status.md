# Fix: UI Reflects Job-Based Status, Not Task Status

## Problem

When completing a task (either by clicking it or setting status to "DONE"), the UI was not properly reflecting the job-based completion status. The issue was:

1. Jobs were being created with status "ACCEPTED" ✓
2. But the UI continued to show status from `Task.status` (global) instead of from Jobs (date-specific)
3. When setting status to "DONE" via menu, no jobs were created, only task status was updated

## Root Causes

### Issue 1: useTaskStatuses Hook Reading Wrong Field
**File**: `src/lib/hooks/useTaskStatuses.ts`

The hook was initializing task statuses from `task.status` (global status) instead of `task.dateStatus` (job-based status calculated for the specific date).

```typescript
// BEFORE (incorrect)
if (task.status) {
  // Uses global status
  statuses[key] = normalizeStatus(task.status)
}

// AFTER (correct)
const statusToUse = task.dateStatus !== undefined ? task.dateStatus : task.status
if (statusToUse) {
  // Prefers dateStatus (job-based) over global status
  statuses[key] = normalizeStatus(statusToUse)
}
```

### Issue 2: Setting Status to "DONE" Didn't Create Jobs
**File**: `src/lib/hooks/useTaskHandlers.ts`

When user set status to "DONE" via the task menu, `handleStatusChange` only updated `Task.status` field, but didn't create any Job records. This meant:
- No jobs existed for the date
- `dateStatus` remained "OPEN" (calculated from zero jobs)
- UI showed incorrect status

## Solution

### Fix 1: Use Job-Based Status in UI Hook ✅
Updated `useTaskStatuses.ts` to prefer `dateStatus` over `task.status`:

```typescript
// Line 29: Prefer job-based dateStatus
const statusToUse = task.dateStatus !== undefined ? task.dateStatus : task.status

// Also for count calculation
const count = task.dateCount !== undefined ? task.dateCount : (task.count || 0)
```

**Why this works**:
- API's `getTasksForDate()` calculates `dateStatus` from jobs for the specific date
- `dateStatus` reflects actual job completions (ACCEPTED jobs)
- Falls back to global status for non-date views

### Fix 2: Create Jobs When Setting Status to "DONE" ✅
Updated `handleStatusChange` in `useTaskHandlers.ts`:

```typescript
// Lines 274-309: Create jobs when status set to 'done'
if (newStatus === 'done' && userId) {
  const currentDateCount = task.dateCount !== undefined ? task.dateCount : (task.count || 0)
  const times = task.times || 1
  const jobsNeeded = times - currentDateCount

  // Create jobs to fill the remaining count
  if (jobsNeeded > 0) {
    const jobStatus = isOwnerOrManager ? 'ACCEPTED' : 'VALIDATING'

    for (let i = 0; i < jobsNeeded; i++) {
      await createJob({
        taskId,
        workerId: userId,
        status: jobStatus,
        occurrenceDate: date  // Date-specific
      })
    }

    // Refresh to get updated dateStatus from jobs
    await onRefreshTasks()
  }
}
```

**Why this works**:
- Creates actual Job records with `occurrenceDate` = current date
- Jobs have status "ACCEPTED" for owners/managers (auto-approved)
- Refresh fetches updated `dateStatus` calculated from new jobs
- UI now shows completion based on jobs, not task status

## Flow Now

### Scenario 1: Click Task to Complete
1. User clicks task
2. `handleTaskClick` creates Job with status="ACCEPTED", occurrenceDate=currentDate
3. Optimistic UI update shows "done"
4. `onRefreshTasks()` fetches fresh data with dateStatus="DONE", dateCount=1
5. `useTaskStatuses` reads dateStatus="DONE" and updates UI
6. Task shows as completed ✓

### Scenario 2: Set Status to "DONE" via Menu
1. User selects "DONE" from menu
2. `handleStatusChange` creates Job(s) to match task.times
3. Jobs created with status="ACCEPTED", occurrenceDate=currentDate
4. `onRefreshTasks()` fetches fresh data with dateStatus="DONE"
5. `useTaskStatuses` reads dateStatus="DONE" and updates UI
6. Also updates task.status field for backward compatibility
7. Task shows as completed ✓

### Scenario 3: View Different Date
1. User switches from Monday to Tuesday
2. API fetches tasks for Tuesday via `/api/v1/tasks?listId=X&date=2026-01-21`
3. `getTasksForDate()` filters jobs by occurrenceDate="2026-01-21"
4. Returns tasks with dateStatus/dateCount for Tuesday only
5. Task completed on Monday shows as OPEN on Tuesday ✓

## Testing

### Test 1: Complete Task on Monday
```bash
# Expected: Task shows DONE on Monday, OPEN on Tuesday
1. Click task on Monday
2. Verify UI shows "done" immediately
3. Refresh page
4. Verify still shows "done" on Monday
5. Switch to Tuesday
6. Verify shows "open" on Tuesday
```

### Test 2: Set Status via Menu
```bash
# Expected: Job created and task shows as completed
1. Open task menu
2. Select "DONE" status
3. Verify UI updates to "done"
4. Check debug endpoint to verify job created
5. Refresh page
6. Verify still shows "done"
```

### Test 3: Multi-Completion Task
```bash
# Expected: Task with times=3 shows progress
1. Create task with times=3
2. Click once → dateCount=1, dateStatus=IN_PROGRESS
3. Click twice more → dateCount=3, dateStatus=DONE
4. Switch to different date → dateCount=0, dateStatus=OPEN
```

## Debug Endpoint Usage

To verify job creation and status calculation:

```bash
curl "http://localhost:3000/api/v1/debug/task-state?taskId=TASK_ID&date=2026-01-20"
```

Response shows:
- `task.status` - Global status
- `jobs.byDate` - Count of jobs for the specific date
- `calculated.dateCount` - Should match jobs.byDate
- `calculated.shouldBeCompleted` - Whether dateStatus should be DONE

## Files Changed

1. `src/lib/hooks/useTaskStatuses.ts` - Prefer dateStatus over task.status
2. `src/lib/hooks/useTaskHandlers.ts` - Create jobs when setting status to DONE
3. Already done in 0008: `src/lib/utils/taskUtils.ts` - Use dateStatus in getTaskStatus

## Success Criteria

- ✅ Task completion persists across page refreshes
- ✅ Task completed on Monday shows OPEN on Tuesday
- ✅ Both click and menu actions create jobs with ACCEPTED status
- ✅ UI reflects job-based status, not task.status field
- ✅ Owners/managers see immediate completion (ACCEPTED jobs)
- ✅ Date-specific counts match actual jobs for that date
