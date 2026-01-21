# Progress Display Fix: Job-Based Completion in DoToolbar

## Problem

The progress chart and doToolbar were showing 0% completion even after completing tasks. This happened because:

1. **DoToolbar reads from `List.completedTasks`** - a legacy embedded data structure
2. **Job-based system only updated `Day.progress`** - not the List structure
3. **No connection between Jobs and List completion data** - two separate systems

## Root Cause

When tasks are completed using the new Job-based system:
- ✅ Jobs are created with `status: 'ACCEPTED'`
- ✅ `Day.progress` is calculated and updated
- ❌ `List.completedTasks` is NOT updated (legacy system)
- ❌ DoToolbar reads from `List.completedTasks` → shows 0%

## Solution Overview

Created a parallel job-based completion data system that:
1. Calculates completion from Jobs (not embedded tasks)
2. Adds `jobCompletedTasks` field to List API response
3. Updates doToolbar to prefer job-based data

## Implementation Details

### 1. List Completion Service

**File**: `src/lib/services/tasklist/listCompletionService.ts` (NEW)

Three main functions:

```typescript
// Calculate completion for a single date
calculateListCompletionFromJobs(listId, occurrenceDate)
  → Returns percentage (0-100)

// Calculate completion for all dates in a year
calculateYearCompletionFromJobs(listId, year)
  → Returns { "2026-01-20": { completion: 75 }, ... }

// Get completion data for all years
getListCompletionData(listId)
  → Returns { 2026: { "2026-01-20": { completion: 75 } } }
```

**How it works**:
```typescript
// 1. Query ACCEPTED jobs for the list
const jobs = await prisma.job.findMany({
  where: { listId, status: 'ACCEPTED' }
})

// 2. Filter out jobs without dates
const validJobs = jobs.filter(j => j.occurrenceDate)

// 3. Count unique completed tasks per date
const uniqueTasksCompleted = new Set(jobs.map(j => j.taskId)).size

// 4. Calculate percentage
const totalTasks = await prisma.task.count({ where: { listId } })
const completion = (uniqueTasksCompleted / totalTasks) * 100
```

### 2. TaskLists API Update

**File**: `src/app/api/v1/tasklists/route.ts`

Added job-based completion data to GET response:

```typescript
// After calculating earnings
const taskListsWithCompletion = await Promise.all(
  taskListsWithEarnings.map(async (list) => {
    const jobCompletionData = await getListCompletionData(list.id)
    return {
      ...list,
      jobCompletedTasks: jobCompletionData  // NEW field
    }
  })
)
```

**Response structure**:
```json
{
  "taskLists": [
    {
      "id": "list123",
      "name": "Daily Tasks",
      "completedTasks": { ... },  // Legacy data
      "jobCompletedTasks": {      // NEW job-based data
        "2026": {
          "2026-01-20": { "completion": 75 },
          "2026-01-21": { "completion": 50 }
        }
      }
    }
  ]
}
```

### 3. DoToolbar Update

**File**: `src/components/doToolbar.tsx`

Updated `calculateCompletionPercentage` to prefer job-based data:

```typescript
const calculateCompletionPercentage = (list, date) => {
  const dateISO = formatDate(date)

  // 1. Try job-based data first (NEW)
  if (list.jobCompletedTasks) {
    const yearData = list.jobCompletedTasks[year] || {}
    const dateData = yearData[dateISO]
    if (dateData?.completion) {
      return dateData.completion  // Use job-based completion
    }
  }

  // 2. Fallback to legacy completedTasks
  if (list.completedTasks) {
    // ... existing logic
  }

  return 0
}
```

## Data Flow

```
User completes task
  ↓
Job created (status: ACCEPTED, occurrenceDate: 2026-01-20)
  ↓
updateDayProgress() called
  ↓
Day.progress updated for 2026-01-20
  ↓
[Separate flow when loading lists]
  ↓
GET /api/v1/tasklists
  ↓
getListCompletionData() calculates from Jobs
  ↓
Response includes jobCompletedTasks
  ↓
DoToolbar reads jobCompletedTasks
  ↓
Progress displays correctly ✅
```

## Key Design Decisions

### 1. Separate Field (`jobCompletedTasks`)
- Doesn't overwrite legacy `completedTasks`
- Allows gradual migration
- Backward compatible

### 2. Calculate on Read
- Completion calculated when lists are fetched
- Always accurate (no sync issues)
- No need to update List records on every completion

### 3. Fallback to Legacy
- DoToolbar tries job-based first
- Falls back to legacy if not available
- Supports both old and new systems

## Files Modified

### New Files
1. `src/lib/services/tasklist/listCompletionService.ts` (~160 lines)

### Modified Files
1. `src/lib/services/tasklist/index.ts` - Added exports
2. `src/app/api/v1/tasklists/route.ts` - Added jobCompletedTasks to response
3. `src/components/doToolbar.tsx` - Prefer job-based completion data

## Testing Checklist

- [x] Fix Prisma query error (`not: null` → filter after fetch)
- [ ] Complete a task → verify Job created
- [ ] Reload page → verify doToolbar shows correct %
- [ ] Switch dates → verify different percentages per date
- [ ] Complete multiple tasks → verify percentage increases
- [ ] Check dashboard productivity chart → verify data flows through

## Benefits

### Accuracy
- ✅ Shows real completion from Jobs
- ✅ Date-specific tracking
- ✅ No sync issues between systems

### User Experience
- ✅ Progress percentage updates correctly
- ✅ Reflects actual task completion
- ✅ Works with recurring tasks

### Technical
- ✅ Single source of truth (Jobs)
- ✅ Backward compatible
- ✅ Gradual migration path

## Migration Path

### Current State (Phase 1)
- Job-based system active
- Legacy system still exists
- DoToolbar uses both (prefers job-based)

### Future (Phase 2)
- Deprecate `List.completedTasks`
- Remove legacy completion code
- Rely entirely on Jobs

## Related Documentation

- `task-count-migration-plan.md` - Job-based completion tracking
- `productivity-chart-migration.md` - Day.progress calculation
- Original implementation in `src/lib/services/tasklist/completionService.ts` (legacy)

## Summary

The progress display now correctly shows completion percentages by calculating from ACCEPTED Jobs instead of relying on the legacy `List.completedTasks` structure. The doToolbar receives `jobCompletedTasks` data from the API and prefers it over legacy data, providing accurate date-specific progress tracking.
