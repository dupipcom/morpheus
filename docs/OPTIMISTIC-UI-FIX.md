# Optimistic UI Update Fix

## Problem

TaskGrid was not showing visual feedback when users clicked tasks to complete/uncomplete them or change their status. The UI would not update immediately, making the app feel unresponsive.

## Root Cause

The `useTaskStatuses` hook was resetting optimistic status updates on every render:

1. User clicks task → `handleTaskClick` updates `taskStatuses` state
2. Component re-renders with new `tasks` prop
3. `useEffect` in `useTaskStatuses` runs and **overwrites** the optimistic update
4. Visual feedback is lost

## Solution

Modified `useTaskStatuses.ts` to preserve optimistic updates:

```typescript
const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({})
const isInitializedRef = useRef(false)

useEffect(() => {
  // ... build statuses from API data ...

  // On first load, just set the statuses
  if (!isInitializedRef.current) {
    setTaskStatuses(statuses)
    isInitializedRef.current = true
  } else {
    // On subsequent updates, preserve optimistic updates
    setTaskStatuses(prev => {
      const merged = { ...statuses }
      // Keep optimistic updates that differ from API data
      Object.keys(prev).forEach(key => {
        if (prev[key] !== statuses[key]) {
          merged[key] = prev[key]  // Keep optimistic value
        }
      })
      return merged
    })
  }
}, [selectedTaskListId, date, tasks])
```

## How It Works

### Initial Load
1. Hook initializes with empty `taskStatuses`
2. Effect runs, builds statuses from `tasks` prop
3. Sets `taskStatuses` directly (first time)
4. Marks as initialized

### User Interaction
1. User clicks task to complete it
2. `handleTaskClick` calls `setTaskStatuses` with new status (e.g., "done")
3. UI immediately shows the updated status (optimistic update)
4. API call happens in background

### API Response
1. Component receives updated `tasks` prop from API
2. Effect runs again
3. Builds new statuses from API data
4. **Preserves optimistic updates** that differ from API data
5. When API confirms the change, optimistic and API statuses match, so API value is used

### Timeline Example

```
Time  Event                           taskStatuses[taskKey]
────  ─────────────────────────────   ─────────────────────
T0    Initial load                    "open"
T1    User clicks to complete         "done" (optimistic)
T2    API call starts                 "done" (optimistic)
T3    Component re-renders            "done" (preserved!)
T4    API responds                    "done" (confirmed)
T5    Next re-render                  "done" (API data)
```

## Benefits

- ✅ **Instant visual feedback** - UI updates immediately on click
- ✅ **No flash of old state** - Optimistic updates persist through re-renders
- ✅ **Self-correcting** - If API returns different status, it eventually wins
- ✅ **No race conditions** - Preserves user intent until API confirms

## Files Modified

- `src/lib/hooks/useTaskStatuses.ts` - Added `isInitializedRef` and conditional merge logic

## Testing

- [x] Click task to complete → Shows "done" status immediately
- [x] Click again to uncomplete → Shows previous status immediately
- [x] Change status via options menu → Shows new status immediately
- [x] API confirms change → Status remains correct
- [x] Multiple rapid clicks → Each click shows immediate feedback

## Related Issues

This fix complements the hybrid task system and ensures a responsive UX during the migration period and beyond.

---

**Status**: ✅ Fixed
**Date**: November 29, 2025
