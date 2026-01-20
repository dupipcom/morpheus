# Task Count/Times Migration: Job-Based Completion Tracking

## Overview

Migrate task completion tracking from the Task model's `count` field (global total) to a date-aware system using the Jobs collection's `occurrenceDate` field. This enables per-occurrence completion tracking for recurring tasks while properly maintaining occurrence date metadata.

## Current State

### Schema
```prisma
model Task {
  times               Int?           // Target completions per occurrence
  count               Int?           // PROBLEM: Global total (all dates)
  firstOccurrence     DateTime?      // When task first appeared
  lastOccurrence      DateTime?      // Last completion date
  nextOccurrence      DateTime?      // Next scheduled occurrence
  recurrence          RecurrenceRule?
  jobs                Job[]
}

model Job {
  occurrenceDate      String?        // YYYY-MM-DD format
  status              JobStatus      // ACCEPTED = counts toward completion
  workerId            String
  taskId              String
}
```

### Problem
- `Task.count` stores global total across all dates
- Can't distinguish "completed today" vs "completed yesterday" for recurring tasks
- `firstOccurrence`, `lastOccurrence`, `nextOccurrence` fields exist but aren't maintained properly
- Jobs already track date-specific completions but aren't used as source of truth

### Current Data Flow
1. User completes task → Creates Job with `occurrenceDate`
2. Task.count incremented (global)
3. `getTasksForDate()` aggregates Jobs to calculate date-specific counts (good!)
4. Occurrence dates not updated on completion/deletion

## Implementation Plan

### Phase 1: Create Completion Service

**File**: `src/lib/services/task/taskCompletionService.ts` (NEW ~150 lines)

Create centralized service for all completion count logic:

```typescript
// Core functions:
- getTaskCompletionCountForDate(taskId, occurrenceDate)
  → { count, completers, status }

- getTaskTotalCompletionCount(taskId)
  → number (sum of all accepted jobs)

- updateTaskOccurrenceDates(taskId, operation, occurrenceDate)
  → Updates first/last/next occurrence dates

- calculateStatusFromCount(count, times)
  → TaskStatus (OPEN/IN_PROGRESS/DONE)
```

**Key Logic**:
- Query Jobs filtered by `occurrenceDate` and `status: ACCEPTED`
- Count = `jobs.length` (not Task.count)
- Set `firstOccurrence` on first completion ever (if null)
- Update `lastOccurrence` on every completion
- Calculate `nextOccurrence` using existing `calculateNextOccurrence()` from taskRecurrenceService

**Export**: Add to `src/lib/services/task/index.ts`

---

### Phase 2: Update API Endpoints

#### 2.1 Jobs POST - Update Occurrence Dates
**File**: `src/app/api/v1/jobs/route.ts` (~10 lines)

After creating job (line ~220):
```typescript
const job = await prisma.job.create({ ... })

// NEW: Update task occurrence dates
await updateTaskOccurrenceDates(
  taskId,
  'complete',
  occurrenceDate || formatDateLocal(new Date())
)
```

#### 2.2 Jobs DELETE - Recalculate Occurrence Dates
**File**: Add to `src/app/api/v1/jobs/route.ts` or create `[jobId]/route.ts` (~40 lines)

When deleting job:
```typescript
// Get job info before deletion
const job = await prisma.job.findUnique({ where: { id: jobId } })
await prisma.job.delete({ where: { id: jobId } })

// Recalculate lastOccurrence from remaining jobs
const latestJob = await prisma.job.findFirst({
  where: { taskId: job.taskId, status: 'ACCEPTED' },
  orderBy: { createdAt: 'desc' }
})

await prisma.task.update({
  where: { id: job.taskId },
  data: { lastOccurrence: latestJob?.occurrenceDate ? new Date(latestJob.occurrenceDate) : null }
})
```

#### 2.3 Tasks GET - Calculate Count from Jobs
**File**: `src/app/api/v1/tasks/route.ts` (~20 lines)

For non-date queries (line ~82-125), calculate count from jobs:
```typescript
const tasks = await prisma.task.findMany({
  where: { listId },
  include: { jobs: { where: { status: 'ACCEPTED' } } }
})

const enrichedTasks = tasks.map(task => ({
  ...task,
  count: task.jobs.length  // Calculated from accepted jobs
}))
```

**Note**: Date-filtered queries (lines 31-64) already use `getTasksForDate()` which calculates date-specific counts correctly.

#### 2.4 Tasks PUT - Make Count Read-Only
**File**: `src/app/api/v1/tasks/[taskId]/route.ts` (~5 lines)

Remove count from update payload (line ~164):
```typescript
// REMOVE: if (body.count !== undefined) updateData.count = body.count
// Count is now read-only, calculated from Jobs
```

---

### Phase 3: Update Frontend Hooks

**File**: `src/lib/hooks/useTaskHandlers.ts` (~30 lines)

Remove direct Task.count updates from three handlers:

**handleTaskClick** (lines 204-211):
```typescript
// Before: body: JSON.stringify({ count: newCount, status: taskStatus })
// After: Don't send count - backend calculates from jobs
await fetch(`/api/v1/tasks/${taskId}`, {
  method: 'PUT',
  body: JSON.stringify({ status: taskStatus })  // Optional
})
```

**handleIncrementCount** (lines 350-357): Same change
**handleDecrementCount** (lines 466-473): Same change

**Optimistic UI**: Keep `optimisticCounts` ref for date-specific display, but fetch from Jobs instead of Task.count

---

### Phase 4: Data Migration (Optional Cleanup)

**File**: `src/migrations/2026-01-migrate-task-counts-to-jobs.ts` (NEW ~50 lines)

Sync Task.count with actual job totals (for backward compatibility):
```typescript
export async function migrateTaskCountsToJobs() {
  const tasks = await prisma.task.findMany({
    include: { jobs: { where: { status: 'ACCEPTED' } } }
  })

  for (const task of tasks) {
    const calculatedCount = task.jobs.length
    if (task.count !== calculatedCount) {
      await prisma.task.update({
        where: { id: task.id },
        data: { count: calculatedCount }
      })
    }
  }
}
```

**When to Run**: After Phase 3 deployment (optional, for data consistency)

---

### Phase 5: Schema Changes (Future)

**File**: `prisma/schema.prisma`

For now: **No changes needed**
- Keep `count` field for backward compatibility during transition
- `firstOccurrence`, `lastOccurrence`, `nextOccurrence` already exist - just maintain them properly

Future consideration: Make `count` a computed field (not stored)

---

## Edge Cases Handled

### One-Time Tasks (No Recurrence)
- `firstOccurrence`: Set on first completion (any date)
- `lastOccurrence`: Update on each completion
- `nextOccurrence`: Always null
- Count: Sum of all accepted jobs across all dates

### New Tasks (No Jobs Yet)
- `count`: 0
- `firstOccurrence`: null
- `lastOccurrence`: null
- `nextOccurrence`: null or calculated from recurrence start date
- Status: OPEN

### Legacy Embedded Tasks
- Trigger `ensureTaskMigrated()` on first access (already exists)
- Migration converts completers to Jobs (already implemented)
- After migration, use Jobs for count (no special handling)

### Collaborative Lists with Validation
- Only ACCEPTED jobs count toward completion
- VALIDATING jobs don't increment count
- Already correctly filtered in `getTasksForDate()`

### Multi-Worker Completions (Same Date)
- Each worker creates separate Job
- Count = number of accepted jobs (can exceed `times`)
- Status = DONE when count >= times
- UI shows all completers for the date

---

## Critical Files Summary

### Must Create/Modify
1. **`src/lib/services/task/taskCompletionService.ts`** (NEW ~150 lines)
   - Core completion count and occurrence date logic

2. **`src/app/api/v1/jobs/route.ts`** (~10 lines)
   - Update occurrence dates on job creation

3. **`src/lib/hooks/useTaskHandlers.ts`** (~30 lines)
   - Remove direct Task.count updates from frontend

### Should Modify
4. **`src/app/api/v1/tasks/route.ts`** (~20 lines)
   - Calculate count from jobs for non-date queries

5. **`src/app/api/v1/tasks/[taskId]/route.ts`** (~5 lines)
   - Prevent count updates via API (make read-only)

6. **Jobs DELETE endpoint** (~40 lines)
   - Add to existing route or create `[jobId]/route.ts`

### Reference Pattern
7. **`src/lib/services/task/taskRecurrenceService.ts`**
   - Reuse `calculateNextOccurrence()` function
   - Follow existing date-aware patterns

---

## Testing Checklist

### Backend
- [ ] `getTaskCompletionCountForDate()` returns correct count for specific date
- [ ] Only ACCEPTED jobs are counted
- [ ] `getTaskTotalCompletionCount()` sums across all dates
- [ ] `firstOccurrence` set on first completion only
- [ ] `lastOccurrence` updated on each completion
- [ ] `nextOccurrence` calculated for recurring tasks
- [ ] Deleting job recalculates `lastOccurrence`

### Frontend
- [ ] Completing task creates Job with correct `occurrenceDate`
- [ ] Optimistic UI shows correct date-specific count
- [ ] Switching dates shows different completion states
- [ ] Uncompleting task removes correct Job
- [ ] Multi-worker completions show all completers

### Integration
- [ ] Task completed Monday shows count=1 Monday, count=0 Tuesday
- [ ] Recurring task shows separate counts per occurrence
- [ ] Global count matches sum of all accepted jobs

---

## Benefits

### User Experience
- **Date-Specific Progress**: See completion status per day/week/month
- **Multi-Worker Support**: Track who completed what, when
- **Historical Tracking**: View past occurrences and patterns

### Technical
- **Single Source of Truth**: Jobs = completion data
- **Audit Trail**: Every completion tracked with timestamp and worker
- **Scalability**: Can add review scores, earnings per job
- **Consistency**: No sync issues between Task.count and actual completions

### Business
- **Accountability**: Know who completed tasks and when
- **Analytics**: Aggregate completion data by user, date, list
- **Compliance**: Audit trail for completed work

---

## Performance Notes

- **Existing indexes** support all queries (no new indexes needed)
- `getTasksForDate()` already joins Jobs for date filtering
- Count calculated in-memory from included jobs: `task.jobs.length`
- For global count: Query uses indexed `Job.taskId` + `Job.status`

---

## Rollback Strategy

If issues arise:
1. **Phase 3 Rollback**: Revert frontend to update Task.count directly
2. **Phase 2 Rollback**: Revert API to accept count in PUT body
3. **Phase 1 Rollback**: Remove completion service, use Task.count field

**Data Integrity**: Task.count preserved during transition, can revert safely

---

## Verification Steps

After implementation:

1. **Create recurring daily task** (e.g., "Meditate")
2. **Complete on Monday** → Verify:
   - Job created with occurrenceDate = Monday
   - Task.firstOccurrence = Monday
   - Task.lastOccurrence = Monday
   - Task.nextOccurrence = Tuesday
   - Monday view shows count=1, status=DONE
   - Tuesday view shows count=0, status=OPEN

3. **Complete on Tuesday** → Verify:
   - New Job created with occurrenceDate = Tuesday
   - Task.firstOccurrence = Monday (unchanged)
   - Task.lastOccurrence = Tuesday
   - Task.nextOccurrence = Wednesday
   - Tuesday view shows count=1, status=DONE

4. **Uncomplete Tuesday** → Verify:
   - Tuesday Job deleted
   - Task.lastOccurrence = Monday (recalculated)
   - Task.nextOccurrence recalculated
   - Tuesday view shows count=0, status=OPEN

5. **Collaborative task** (multi-worker) → Verify:
   - Each worker creates separate Job
   - Both completers shown in UI
   - Count reflects total completions for that date

6. **Check global count** → Verify:
   - GET /api/v1/tasks (no date) returns total across all dates
   - Matches number of ACCEPTED jobs in database
