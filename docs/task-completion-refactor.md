# Task Completion Handlers Analysis

## Current State

### `recordCompletions` Handler
- **Purpose**: Batch task completion operations
- **Input**: `dayActions`/`weekActions` arrays, `justCompletedNames`, `justUncompletedNames`
- **Used by**: `taskGrid.tsx` for batch updates
- **Updates**: 
  - `completedTasks` structure
  - `Day.tasks` array ✅
  - `Day.ticker` array ✅
  - User stash/profit ✅
  - Ephemeral tasks ✅

### `updateTaskCompletion` Handler
- **Purpose**: Single task completion operations
- **Input**: Single `taskId`/`taskKey`, `status`, `count`, `times`
- **Used by**: `TaskItem` component via `useTaskHandlers.ts`
- **Updates**:
  - `completedTasks` structure
  - `Day.ticker` array ✅
  - User stash/profit ✅
  - Ephemeral tasks ✅
  - `Day.tasks` array ❌ (MISSING - should be added)

## Duplicated Logic

Both handlers duplicate:
1. Stash/profit delta calculation (lines 825-912 in recordCompletions, 1567-1634 in updateTaskCompletion)
2. User stash/profit updates (lines 914-944 in recordCompletions, 1636-1684 in updateTaskCompletion)
3. Day ticker updates (lines 1151-1189 in recordCompletions, 1691-1770 in updateTaskCompletion)
4. Completer earnings calculation (similar patterns in both)

## Recommended Refactoring

### Option 1: Extract Shared Helpers (Recommended)
Create helper functions to eliminate duplication:

```typescript
// Helper functions to extract:
1. calculateStashAndProfitDeltasForDate(taskListId, userId, year, dateISO, isCompleted)
2. updateUserStashAndProfit(userId, stashDelta, profitDelta)
3. updateDayTicker(userId, dateISO, taskListId, doneTasks)
4. updateDayTasks(userId, dateISO, tasks) // Add to updateTaskCompletion
```

### Option 2: Merge into Single Handler
- Make `updateTaskCompletion` accept arrays (backward compatible)
- Consolidate all logic into one handler
- **Pros**: Single source of truth
- **Cons**: More complex, harder to maintain, different use cases

### Option 3: Keep Separate, Fix Missing Feature
- Keep both handlers separate
- Extract shared logic into helpers
- Add `Day.tasks` update to `updateTaskCompletion` for consistency
- **Pros**: Clear separation of concerns, easier to maintain
- **Cons**: Still two code paths (but with shared helpers)

## Immediate Action Items

1. ✅ Extract stash/profit calculation into helper function
2. ✅ Extract stash/profit update into helper function  
3. ✅ Extract Day ticker update into helper function
4. ⚠️ Add Day.tasks update to `updateTaskCompletion` (currently missing)
5. ⚠️ Consider consolidating completer earnings calculation

## Code Locations

- `recordCompletions`: `src/app/api/v1/tasklists/route.ts:441-1329`
- `updateTaskCompletion`: `src/app/api/v1/tasklists/route.ts:1331-1770`
- Usage: `src/lib/hooks/useTaskHandlers.ts` (updateTaskCompletion)
- Usage: `src/components/taskGrid.tsx` (recordCompletions)

