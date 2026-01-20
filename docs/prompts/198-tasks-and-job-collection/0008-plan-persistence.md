# Fix Plan: Task Completion Persistence & Date-Specific State

## Issues Identified

### Issue 1: Task Completion Not Persisting
**Problem**: When completing a task, the Job is created but completion state doesn't persist correctly. The task doesn't show as completed after the action.

**Root Cause**:
- Frontend removed direct Task.status updates (correct for new architecture)
- BUT: Optimistic UI state might not be syncing with server response
- Job creation happens but UI doesn't reflect the new state from Jobs

### Issue 2: Migrated Tasks Appear "Always Completed"
**Problem**: Tasks with `count === times` (from old system) appear completed on ALL dates, not just the dates they were actually completed.

**Root Cause**:
- Old tasks have global `Task.status = 'DONE'`
- UI might be checking global `task.status` instead of date-specific `dateStatus`
- OR: Migrated completers converted to Jobs without proper `occurrenceDate` values

---

## Investigation Steps

### Step 1: Verify Job Creation
Check if Jobs are being created with correct data:
```sql
-- Check recent jobs
SELECT id, taskId, workerId, status, occurrenceDate, createdAt
FROM Job
ORDER BY createdAt DESC
LIMIT 20;
```

**Expected**: Jobs should have:
- `status: 'ACCEPTED'` (or 'VALIDATING' for collaborators)
- `occurrenceDate: 'YYYY-MM-DD'` format matching the current view date

### Step 2: Check getTasksForDate() Response
Add console.log to see what data is returned:
```typescript
// In component using tasks
console.log('Tasks for date:', tasks.map(t => ({
  name: t.name,
  globalStatus: t.status,      // Global task status
  dateStatus: t.dateStatus,    // Date-specific status
  globalCount: t.count,        // Global count
  dateCount: t.dateCount       // Date-specific count
})))
```

**Expected**:
- `dateStatus` should be 'DONE' when `dateCount >= times`
- `dateStatus` should be 'OPEN' when `dateCount === 0`
- Old completed tasks should have `dateCount: 0` for dates without jobs

### Step 3: Check UI Component Logic
Verify which status field the UI is using:
```typescript
// In task component rendering
const isCompleted = task.status === 'DONE'  // ❌ WRONG - global status
const isCompleted = task.dateStatus === 'DONE'  // ✅ CORRECT - date-specific
```

---

## Fix Implementation Plan

### Fix 1: Ensure UI Uses Date-Specific Status

**Files to Update**:
1. **`src/views/listView.tsx`** - Task rendering component
2. **`src/components/steadyTasks.tsx`** - If used for task display
3. Any other components rendering task status

**Changes Required**:
```typescript
// BEFORE (likely current code)
const status = task.status  // Global status
const count = task.count    // Global count

// AFTER (correct for date views)
const status = task.dateStatus || task.status  // Prefer date-specific
const count = task.dateCount ?? task.count     // Prefer date-specific
```

**Implementation**:
```typescript
// Add helper function to get date-aware task data
function getTaskDisplayData(task: any, isDateView: boolean) {
  if (isDateView && task.dateStatus !== undefined) {
    return {
      status: task.dateStatus,
      count: task.dateCount,
      completers: task.completers,
      isCompleted: task.dateStatus === 'DONE'
    }
  }

  // Fallback to global status for non-date views
  return {
    status: task.status,
    count: task.count,
    completers: [], // Not available in global view
    isCompleted: task.status === 'DONE'
  }
}
```

### Fix 2: Fix Optimistic Updates

**File**: `src/lib/hooks/useTaskHandlers.ts`

**Problem**: After job creation/deletion, the UI state might not refresh correctly.

**Solution**: Trigger data refetch after job operations

```typescript
// In handleTaskClick (after job creation/deletion)
try {
  // ... existing job creation/deletion code ...

  if (onRefreshUser) await onRefreshUser()

  // ADD: Force refresh of task data to get updated dateStatus/dateCount
  if (onRefresh) {
    await onRefresh()
  }

  // Clear optimistic state AFTER refresh completes
  pendingCompletionsRef.current.delete(key)
  // ... clear optimistic statuses/counts ...

} catch (error) {
  // ... error handling ...
}
```

**Alternative**: Use SWR mutate to update data without full refetch
```typescript
import { mutate } from 'swr'

// After job creation
await mutate(
  `/api/v1/tasks?listId=${listId}&date=${date}`,
  async (currentData: any) => {
    // Fetch fresh data from server
    const response = await fetch(`/api/v1/tasks?listId=${listId}&date=${date}`)
    return response.json()
  },
  { revalidate: false } // Don't trigger another fetch
)
```

### Fix 3: Handle Global Task Status

**File**: `src/app/api/v1/tasks/route.ts` (non-date queries)

**Current Code** (lines 139-146):
```typescript
// Calculate count from ACCEPTED jobs (global total across all dates)
const enrichedTasks = authorizedTasks.map((task: any) => {
  const acceptedJobs = task.jobs?.filter((job: any) => job.status === 'ACCEPTED') || []
  return {
    ...task,
    count: acceptedJobs.length  // Calculated from accepted jobs
  }
})
```

**Add**: Also update global task status based on count
```typescript
const enrichedTasks = authorizedTasks.map((task: any) => {
  const acceptedJobs = task.jobs?.filter((job: any) => job.status === 'ACCEPTED') || []
  const count = acceptedJobs.length
  const times = task.times || 1

  // Calculate global status
  let status = task.status
  if (count >= times) {
    status = 'DONE'
  } else if (count > 0) {
    status = 'IN_PROGRESS'
  } else {
    status = 'OPEN'
  }

  return {
    ...task,
    count,
    status  // Override with calculated status
  }
})
```

### Fix 4: Verify Migration Job Dates

**File**: `src/migrations/0014-sync-task-counts-with-jobs.js`

**Add**: Verification step to check migrated jobs have valid occurrenceDate

```javascript
// After main migration
console.log('\nVerifying job occurrence dates...')

const jobsWithoutDate = await prisma.job.count({
  where: {
    status: 'ACCEPTED',
    occurrenceDate: null
  }
})

console.log(`Jobs without occurrenceDate: ${jobsWithoutDate}`)

if (jobsWithoutDate > 0) {
  console.log('\n⚠️  WARNING: Found jobs without occurrenceDate')
  console.log('These jobs will not be counted in date-specific views')
  console.log('Consider setting occurrenceDate based on job.createdAt')
}
```

**If jobs missing dates**: Create follow-up migration to set occurrenceDate
```javascript
// Fix jobs without occurrenceDate
const jobsToFix = await prisma.job.findMany({
  where: {
    status: 'ACCEPTED',
    occurrenceDate: null
  },
  select: { id: true, createdAt: true }
})

for (const job of jobsToFix) {
  const dateStr = job.createdAt.toISOString().split('T')[0]
  await prisma.job.update({
    where: { id: job.id },
    data: { occurrenceDate: dateStr }
  })
}
```

### Fix 5: Add Debugging Endpoint

**File**: `src/app/api/v1/debug/task-state/route.ts` (NEW)

Create debug endpoint to inspect task state:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')
  const date = searchParams.get('date')

  if (!taskId) {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 })
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      jobs: {
        where: date ? { occurrenceDate: date } : undefined,
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const acceptedJobs = task.jobs.filter(j => j.status === 'ACCEPTED')

  return NextResponse.json({
    task: {
      id: task.id,
      name: task.name,
      status: task.status,
      count: task.count,
      times: task.times,
      firstOccurrence: task.firstOccurrence,
      lastOccurrence: task.lastOccurrence
    },
    jobs: {
      total: task.jobs.length,
      accepted: acceptedJobs.length,
      byDate: date ? acceptedJobs.filter(j => j.occurrenceDate === date).length : null,
      details: acceptedJobs.map(j => ({
        id: j.id,
        workerId: j.workerId,
        status: j.status,
        occurrenceDate: j.occurrenceDate,
        createdAt: j.createdAt
      }))
    },
    calculated: {
      globalCount: acceptedJobs.length,
      dateCount: date ? acceptedJobs.filter(j => j.occurrenceDate === date).length : null,
      shouldBeCompleted: acceptedJobs.length >= (task.times || 1)
    }
  })
}
```

---

## Testing Checklist

### Test Case 1: New Task Completion
1. Create new task with `times: 1`
2. Complete task on Monday
3. **Verify**:
   - Job created with `occurrenceDate: '2026-01-20'` (Monday's date)
   - Monday view shows task as DONE (`dateStatus: 'DONE'`, `dateCount: 1`)
   - Tuesday view shows task as OPEN (`dateStatus: 'OPEN'`, `dateCount: 0`)

### Test Case 2: Multi-Completion Task
1. Create task with `times: 3`
2. Complete once on Monday → Status: IN_PROGRESS
3. Complete twice more on Monday → Status: DONE
4. **Verify**:
   - Monday view: `dateCount: 3`, `dateStatus: 'DONE'`
   - Tuesday view: `dateCount: 0`, `dateStatus: 'OPEN'`

### Test Case 3: Migrated Completed Task
1. Find task with old `count: 5`, `times: 5`, `status: 'DONE'`
2. View on today's date
3. **Verify**:
   - If no jobs for today: `dateCount: 0`, `dateStatus: 'OPEN'`
   - Task should NOT appear as completed today

### Test Case 4: Recurring Task
1. Create daily recurring task with `times: 1`
2. Complete on Monday
3. View Tuesday
4. **Verify**:
   - Monday view: DONE
   - Tuesday view: OPEN (new occurrence)
   - Task appears on both days but with different completion states

### Test Case 5: Optimistic UI
1. Complete task (slow network)
2. **Verify**:
   - Task immediately shows as completed (optimistic)
   - After API response, state remains correct
   - If API fails, task reverts to previous state

---

## Rollout Steps

1. **Add debugging endpoint** (`debug/task-state`) to production
2. **Test with specific task IDs** that are showing issues
3. **Identify root cause** from debug data
4. **Apply Fix 1** (UI uses dateStatus) - Low risk, high impact
5. **Apply Fix 2** (optimistic updates) - Medium risk
6. **Apply Fix 3** (global status calculation) - Low risk
7. **Run Fix 4** (job date verification) if needed
8. **Monitor** for 24-48 hours
9. **Remove debugging endpoint** after verification

---

## Success Criteria

- ✅ Completing a task persists across page refreshes
- ✅ Task completed on Monday shows OPEN on Tuesday
- ✅ Migrated completed tasks don't appear completed on new dates
- ✅ Date-specific counts match actual jobs for that date
- ✅ Global task status reflects overall completion across all dates
- ✅ Optimistic UI works correctly with immediate feedback

---

## Notes

- **Backward Compatibility**: Keep global `Task.count` and `Task.status` for non-date views
- **Performance**: Date-specific queries already optimized with indexed `occurrenceDate`
- **Data Integrity**: All changes maintain existing Job records
- **Migration**: No schema changes required, only logic fixes
