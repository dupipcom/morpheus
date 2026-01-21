# Productivity Chart Migration: Job-Based Progress Tracking

## Overview

Updated the dashboard productivity chart to use the new Job-based completion tracking system instead of embedded tasks. This ensures `Day.progress` accurately reflects date-specific task completion data.

## Changes Made

### 1. New Service: Day Progress Calculation

**File**: `src/lib/services/day/dayProgressService.ts`

Created centralized service for calculating productivity from Jobs:

```typescript
// Main functions:
- calculateDayProgressFromJobs(userId, occurrenceDate)
  → { productivity, progress }

- updateDayProgress(userId, occurrenceDate)
  → Updates Day.progress and Day.productivity

- updateMultipleDaysProgress(userId, dates)
  → Batch update for multiple dates
```

**Key Logic**:
- Queries ACCEPTED jobs for the specific date
- Groups jobs by listId to calculate list-level productivity
- Counts unique completed tasks per list
- Calculates percentage: completedTasks / totalTasks * 100
- Averages percentages across all lists for overall progress

### 2. Jobs API Integration

**Updated Files**:
- `src/app/api/v1/jobs/route.ts` (POST)
- `src/app/api/v1/jobs/[jobId]/route.ts` (DELETE, PUT)

**When Day.progress is Updated**:
- ✅ Job created with status='ACCEPTED'
- ✅ Job deleted (was ACCEPTED)
- ✅ Job status changed to ACCEPTED
- ✅ Job status changed from ACCEPTED

**Flow**:
```
1. Job operation (create/delete/update)
   ↓
2. Update task occurrence dates
   ↓
3. Call updateDayProgress(workerId, occurrenceDate)
   ↓
4. Calculate progress from all ACCEPTED jobs for that date
   ↓
5. Update Day.progress and Day.productivity
```

### 3. Data Model

**Day Schema** (unchanged):
```prisma
model Day {
  productivity    Json?    // List-level breakdown
  progress        Float?   // Overall percentage (0-100)
  tasks           EmbeddedTask[]  // Legacy embedded tasks
}
```

**Productivity JSON Structure**:
```json
{
  "listId1": {
    "totalTasks": 10,
    "completedTasks": 7,
    "percentage": 70
  },
  "listId2": {
    "totalTasks": 5,
    "completedTasks": 5,
    "percentage": 100
  }
}
```

**Overall Progress**:
```
progress = (70 + 100) / 2 = 85
```

---

## Dashboard Integration

**How It Works Now**:

1. **Data Collection**:
   - Jobs created/updated → Day.progress automatically updated
   - Dashboard fetches `/api/v1/days?year=2025`
   - Response includes `progress` field (0-100)

2. **Weekly Aggregation** (`dashboardView.tsx`):
   - Groups days by week number
   - Averages daily progress values per week
   - Scales progress from 0-100 to 0-5 (to match mood scale)

3. **Chart Display**:
   - X-axis: Weeks
   - Y-axis: Mood average + Progress (stacked areas)
   - Progress shown as percentage of completed tasks

---

## Key Differences from Old System

### Before (Embedded Tasks)
```typescript
// Old: productivityUtils.ts
const completedTasks = dayTasks.filter(t => t.status === 'done').length
```

**Problems**:
- Relied on embedded task status
- Not date-aware for recurring tasks
- Inconsistent with Job-based completion tracking

### After (Jobs)
```typescript
// New: dayProgressService.ts
const jobs = await prisma.job.findMany({
  where: { occurrenceDate, status: 'ACCEPTED' }
})
const completedTasks = new Set(jobs.map(j => j.taskId)).size
```

**Benefits**:
- ✅ Date-specific completion tracking
- ✅ Single source of truth (Jobs)
- ✅ Consistent with task completion system
- ✅ Supports collaborative task validation
- ✅ Accurate for recurring tasks

---

## Legacy Code Status

### Still Used (For Now)
- `src/lib/services/tasklist/productivityUtils.ts` - Used by Day service for embedded tasks
- `src/lib/services/tasklist/dayService.ts` - Manages embedded task copies

**Note**: These files support legacy embedded task functionality. As the system fully migrates to Jobs, these functions may be deprecated.

### Now Primary
- `src/lib/services/day/dayProgressService.ts` - Primary productivity calculation
- Job-based completion tracking via `src/app/api/v1/jobs/*`

---

## Migration Path

### Phase 1: Dual System ✅ (Current)
- Jobs update Day.progress automatically
- Embedded tasks still supported (legacy)
- Dashboard reads from Day.progress (works with both)

### Phase 2: Data Backfill (Optional)
Run migration to recalculate all historical Day.progress from Jobs:

```bash
node src/migrations/0015-recalculate-day-progress-from-jobs.js
```

### Phase 3: Deprecation (Future)
- Remove embedded task copy functionality
- Fully rely on Jobs for all completion tracking
- Archive `productivityUtils.ts` legacy functions

---

## Testing Checklist

### Backend
- [x] ACCEPTED job creation updates Day.progress
- [x] Job deletion recalculates Day.progress
- [x] Status change to/from ACCEPTED updates Day.progress
- [x] Progress calculated per user (not global)
- [x] List-level productivity breakdown maintained

### Dashboard
- [ ] Productivity chart displays correct weekly data
- [ ] Progress scales properly (0-100 → 0-5)
- [ ] Historical data shows consistent trends
- [ ] No errors when Day.progress is null

### Integration
- [ ] Complete task Monday → Day.progress updates for Monday
- [ ] Complete same task Tuesday → Day.progress updates for Tuesday (separate)
- [ ] Uncomplete task → Day.progress recalculates
- [ ] Collaborative task acceptance → Day.progress updates for worker

---

## Performance Considerations

**Query Optimization**:
- Indexed fields: `Job.occurrenceDate`, `Job.status`
- Calculates progress on-demand (not cached)
- Single query per date update

**Potential Improvements**:
- Cache recent Day.progress calculations
- Batch update multiple days when bulk importing jobs
- Use `updateMultipleDaysProgress()` for bulk operations

---

## Files Modified

### New Files
1. `src/lib/services/day/dayProgressService.ts` (~240 lines)

### Modified Files
1. `src/lib/services/day/index.ts` - Added export
2. `src/app/api/v1/jobs/route.ts` - Added progress update on POST
3. `src/app/api/v1/jobs/[jobId]/route.ts` - Added progress update on DELETE/PUT

### Documentation
1. `docs/prompts/0001-tasks/productivity-chart-migration.md` - This file

---

## Related Documentation

- `task-count-migration-plan.md` - Job-based completion tracking implementation
- `src/views/dashboardView.tsx` - Dashboard and chart rendering
- `src/lib/services/tasklist/productivityUtils.ts` - Legacy productivity calculation (still used)

---

## Summary

The productivity chart now accurately reflects task completion based on ACCEPTED jobs with date-specific occurrence tracking. Day.progress is automatically maintained when jobs are created, deleted, or have status changes. The dashboard continues to work seamlessly, aggregating daily progress into weekly trends for visualization.
