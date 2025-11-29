# Frontend Logic Refactor (Part 3)

## Overview

Drastic simplification of doView, listView, and taskGrid modules. Remove complex state merging, debouncing, and handler complexity. Implement clean optimistic updates with direct API calls.

## Key Changes

### 1. Simplify Task Loading (`listView.tsx`)

**Current**: Complex merging of `completedTasks[year][date] `with `list.tasks`, handling openTasks/closedTasks, ephemeral tasks, etc.

**New**: Simple two-step loading:

1. Load from `Day.tasks` (EmbeddedTask[]) for selected date via `/api/v1/days?date=YYYY-MM-DD`
2. If no Day data exists, load from Task collection via `/api/v1/tasks?listId=xxx`
3. Filter/display based on selected date
4. If no data for selected date, display `list.tasks` (master structure) without creating Day entry

**Files to modify**:

- `src/views/listView.tsx`: Replace `mergedTasks` useMemo (lines 222-444) with simple loading logic
- Remove complex date bucket merging, openTasks/closedTasks logic
- Keep ephemeral tasks handling but simplify

### 2. Simplify Task Status Management (`taskGrid.tsx`)

**Current**: Uses `useOptimisticUpdates`, `useTaskStatuses`, `useTaskHandlers` with refs, pending completions, complex state merging

**New**:

- Simplify hooks but keep structure
- Direct optimistic state updates in component
- Single API call per status change
- Remove debouncing and complex merging

**Files to modify**:

- `src/components/taskGrid.tsx`: Simplify handler usage, remove complex ref tracking
- `src/lib/hooks/useTaskStatuses.ts`: Simplify to just derive status from tasks prop
- `src/lib/hooks/useTaskHandlers.ts`: Remove ref-based pending completions, use simple useState for optimistic updates
- `src/lib/hooks/useOptimisticUpdates.ts`: Simplify or remove if not needed

### 3. Task Status Change Flow

**Step A (Optimistic)**: Immediately update local React state

```typescript
const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({})
// On status change:
setTaskStatuses(prev => ({ ...prev, [taskKey]: newStatus }))
```

**Step B (Persistence)**: Single API request

- Use `PUT /api/v1/tasks/[taskId] `with `{ status: newStatus }`
- Or continue using existing `/api/v1/tasklists` endpoint if preferred
- No debouncing, no batching

### 4. Localization Handling

- Check if task has `localeKey`
- If yes, use translation constant: `t(localeKey)` to display/store name in user's locale
- Fallback to `task.name` if no localeKey

### 5. UI Display

- Status displayed via option icon (existing OptionsButton)
- Task Item background color shows status (existing TaskItem component)
- No changes needed to TaskItem component

## Implementation Details

### listView.tsx Changes

1. **Replace complex `mergedTasks` logic**:

   - Remove lines 222-444 (complex merging)
   - Add simple fetch from Day API
   - Fallback to Task collection API
   - Simple date filtering

2. **Keep essential features**:

   - Date selection
   - Weekly list support (getWeekDates)
   - Ephemeral tasks (simplified)
   - Profile caching for collaborators

3. **Remove**:

   - Complex completedTasks merging
   - openTasks/closedTasks logic
   - Complex key-based deduplication

### taskGrid.tsx Changes

1. **Simplify hooks usage**:

   - Keep `useTaskStatuses` but simplify
   - Keep `useTaskHandlers` but remove ref-based tracking
   - Remove or simplify `useOptimisticUpdates`

2. **Direct state management**:

   - Use simple `useState` for optimistic status updates
   - Remove `pendingCompletionsRef` and `pendingStatusUpdatesRef` complexity

3. **Handler simplification**:

   - `handleTaskClick`: Simple optimistic update + single API call
   - `handleStatusChange`: Simple optimistic update + single API call
   - Remove complex count tracking, merging logic

### useTaskHandlers.ts Changes

1. **Remove**:

   - `pendingCompletionsRef` tracking
   - `pendingStatusUpdatesRef` tracking
   - Complex optimistic state merging
   - Debouncing logic

2. **Keep**:

   - Basic handler functions
   - API call logic
   - Error handling

3. **Simplify**:

   - Use simple `setTaskStatuses` callback
   - Direct state updates, no refs

### useTaskStatuses.ts Changes

1. **Simplify**:

   - Derive status directly from tasks prop
   - Remove complex initialization logic
   - Simple memoization

### API Integration

- **Day tasks**: `GET /api/v1/days?date=YYYY-MM-DD` (returns Day with tasks array)
- **Task collection**: `GET /api/v1/tasks?listId=xxx` (returns Task[] from collection)
- **Status update**: `PUT /api/v1/tasks/[taskId] `with `{ status: newStatus }` OR continue using existing `/api/v1/tasklists` endpoint

## Files to Modify

1. `src/views/listView.tsx` - Simplify task loading
2. `src/components/taskGrid.tsx` - Simplify handlers and state
3. `src/lib/hooks/useTaskHandlers.ts` - Remove complex ref tracking
4. `src/lib/hooks/useTaskStatuses.ts` - Simplify status derivation
5. `src/lib/hooks/useOptimisticUpdates.ts` - Simplify or remove

## Testing Considerations

- Verify tasks load from Day.tasks when available
- Verify fallback to Task collection works
- Verify status changes update optimistically
- Verify API calls are made correctly
- Verify localization with localeKey works
- Test with weekly lists
- Test ephemeral tasks (if still needed)