# Solutions for DoToolbar Completion Progress Not Updating

## Problem
After completing a task, the completion percentage in the doToolbar doesn't update immediately. The progress badge still shows the old percentage until the page is manually refreshed.

## Root Cause Analysis

The doToolbar calculates completion percentage from:
```typescript
// Line 98-106 in doToolbar.tsx
if (list.jobCompletedTasks) {
  const yearData = list.jobCompletedTasks[year] || {}
  const dateData = yearData[dateISO]
  if (dateData && typeof dateData.completion === 'number') {
    return dateData.completion
  }
}
```

**The issue**: After task completion in `useTaskHandlers`, the following callbacks are called:
- `onRefreshTasks()` - refreshes tasks data
- `onRefreshUser()` - refreshes user data
- `onRefresh()` - general refresh

But **`refreshTaskLists()` from GlobalContext is NOT called**, so the doToolbar never gets the updated `jobCompletedTasks` data.

## Proposed Solutions

### Solution 1: Add refreshTaskLists to onRefresh Callback ⭐ RECOMMENDED

**What**: Ensure the `onRefresh` callback includes `refreshTaskLists()` from GlobalContext.

**Where**: Where useTaskHandlers is called (likely in parent components)

**Implementation**:
```typescript
// In the component that uses useTaskHandlers
const { refreshTaskLists } = useContext(GlobalContext)

const handleRefresh = useCallback(async () => {
  // Existing refresh logic
  await someRefreshLogic()

  // Add this line
  await refreshTaskLists()
}, [refreshTaskLists])

// Pass to useTaskHandlers
const handlers = useTaskHandlers({
  // ... other props
  onRefresh: handleRefresh,
  // ...
})
```

**Pros**:
- Simple and direct
- Uses existing callback pattern
- Ensures data consistency

**Cons**:
- Requires finding all places where useTaskHandlers is used
- May cause multiple API calls

**Files to modify**:
- `src/components/taskGrid.tsx` (if it uses useTaskHandlers)
- Any other components using useTaskHandlers
- Check with: `grep -l "useTaskHandlers" src/**/*.tsx`

---

### Solution 2: Add Optimistic Completion Calculation

**What**: Calculate the expected completion percentage immediately after task completion, before server response.

**Implementation**:

```typescript
// In doToolbar.tsx

// Add state for optimistic completion
const [optimisticCompletionDelta, setOptimisticCompletionDelta] = useState<number>(0)

// Add function to calculate optimistic completion
const addOptimisticCompletion = useCallback(() => {
  if (!selectedList) return

  // Get current task counts
  const baseTasks = (selectedList.tasks || selectedList.templateTasks || []).length
  const ephemeralOpen = (selectedList.ephemeralTasks?.open || []).length
  const ephemeralClosed = (selectedList.ephemeralTasks?.closed || []).length
  const totalTasks = baseTasks + ephemeralOpen + ephemeralClosed

  if (totalTasks === 0) return

  // One more task completed = increase by (1/totalTasks * 100)
  const delta = (1 / totalTasks) * 100
  setOptimisticCompletionDelta(prev => prev + delta)

  // Clear after 5 seconds
  setTimeout(() => {
    setOptimisticCompletionDelta(0)
  }, 5000)
}, [selectedList])

// Modify the completion badge display
<Badge>
  <CheckCircle2 />
  {(calculateCompletionPercentage(selectedList) + optimisticCompletionDelta).toFixed(0)}%
</Badge>

// Expose the function through GlobalContext
useEffect(() => {
  if (setGlobalContext) {
    setGlobalContext(prev => ({
      ...prev,
      addOptimisticCompletion
    }))
  }
}, [addOptimisticCompletion, setGlobalContext])
```

**Then in useTaskHandlers**:
```typescript
// After successful job creation
const { addOptimisticCompletion } = useContext(GlobalContext)
if (addOptimisticCompletion) {
  addOptimisticCompletion()
}
```

**Pros**:
- Immediate visual feedback
- No extra API calls
- Better UX with instant updates

**Cons**:
- More complex state management
- Risk of drift if API call fails
- Need to handle edge cases (multiple rapid completions)

---

### Solution 3: Call refreshTaskLists Directly from useTaskHandlers

**What**: Add `refreshTaskLists` as a parameter to useTaskHandlers and call it after task completion.

**Implementation**:

```typescript
// In useTaskHandlers.ts
interface UseTaskHandlersOptions {
  // ... existing props
  onRefreshTaskLists?: () => Promise<void>
}

export function useTaskHandlers({
  // ... existing params
  onRefreshTaskLists
}: UseTaskHandlersOptions) {

  const handleTaskClick = useCallback(async (task: any) => {
    // ... existing logic

    try {
      // ... job creation logic

      if (onRefreshTasks) await onRefreshTasks()
      if (onRefreshUser) await onRefreshUser()
      if (onRefresh) await onRefresh()

      // Add this
      if (onRefreshTaskLists) await onRefreshTaskLists()

    } catch (error) {
      // ... error handling
    }
  }, [/* deps */])
}
```

**Then where useTaskHandlers is used**:
```typescript
const { refreshTaskLists } = useContext(GlobalContext)

const handlers = useTaskHandlers({
  // ... other props
  onRefreshTaskLists: refreshTaskLists
})
```

**Pros**:
- Clean separation of concerns
- Explicit control over what gets refreshed
- Easy to add to existing code

**Cons**:
- Adds another prop to useTaskHandlers
- Need to pass it from all parent components

---

### Solution 4: Global Event System

**What**: Emit a global event when task is completed, and doToolbar listens to it.

**Implementation**:

```typescript
// Create src/lib/events/taskEvents.ts
type TaskCompletionCallback = (data: { taskId: string; listId: string }) => void

const listeners: TaskCompletionCallback[] = []

export const onTaskCompleted = (callback: TaskCompletionCallback) => {
  listeners.push(callback)
  return () => {
    const index = listeners.indexOf(callback)
    if (index > -1) listeners.splice(index, 1)
  }
}

export const emitTaskCompleted = (data: { taskId: string; listId: string }) => {
  listeners.forEach(callback => callback(data))
}
```

**In useTaskHandlers**:
```typescript
import { emitTaskCompleted } from '@/lib/events/taskEvents'

// After successful completion
emitTaskCompleted({ taskId, listId: taskListId })
```

**In doToolbar**:
```typescript
import { onTaskCompleted } from '@/lib/events/taskEvents'

useEffect(() => {
  const unsubscribe = onTaskCompleted((data) => {
    if (data.listId === selectedTaskListId) {
      refreshTaskLists()
    }
  })
  return unsubscribe
}, [selectedTaskListId, refreshTaskLists])
```

**Pros**:
- Decoupled components
- Scalable for multiple listeners
- No prop drilling

**Cons**:
- Adds complexity
- Harder to debug
- Need to manage subscriptions

---

## Recommended Implementation Plan

### Phase 1: Quick Fix (Solution 1)
1. Find where useTaskHandlers is called
2. Add refreshTaskLists to the onRefresh callback
3. Test that completion updates immediately

### Phase 2: Optimistic UI (Solution 2)
1. Add optimistic completion state to doToolbar
2. Wire up the callback to useTaskHandlers
3. Add pulse animation for optimistic updates
4. Handle edge cases (rapid clicks, errors)

### Phase 3: Polish
1. Ensure real data clears optimistic state
2. Add error handling for failed completions
3. Test with various list types (daily/weekly/one-off)

## Testing Checklist

After implementing:
- [ ] Complete a task in default.daily list
- [ ] Verify percentage updates immediately
- [ ] Verify percentage is correct (shows +X% where X = 100/totalTasks)
- [ ] Complete multiple tasks rapidly
- [ ] Verify percentage increases correctly
- [ ] Uncomplete a task
- [ ] Verify percentage decreases
- [ ] Switch between lists
- [ ] Verify each list shows correct percentage
- [ ] Refresh page
- [ ] Verify percentage persists correctly
- [ ] Complete task with optimistic UI
- [ ] Wait for real data
- [ ] Verify optimistic state clears and real data shows

## Files to Modify

**Solution 1 (Recommended)**:
- Find components using useTaskHandlers
- Add refreshTaskLists to their onRefresh callbacks

**Solution 2 (Optimistic UI)**:
- `src/components/doToolbar.tsx` - add optimistic completion
- `src/lib/hooks/useTaskHandlers.ts` - call optimistic callback
- `src/lib/contexts.ts` - add to GlobalContext type

**Solution 3**:
- `src/lib/hooks/useTaskHandlers.ts` - add onRefreshTaskLists param
- Components using useTaskHandlers - pass refreshTaskLists

**Solution 4**:
- `src/lib/events/taskEvents.ts` (new file) - event system
- `src/lib/hooks/useTaskHandlers.ts` - emit events
- `src/components/doToolbar.tsx` - listen to events
