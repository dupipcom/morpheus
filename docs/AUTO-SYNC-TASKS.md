# Automatic Task Collection Sync

## Overview

The legacy tasklists API now automatically syncs embedded tasks to the new Task collection whenever lists are created or updated. This enables gradual migration to the new hybrid task system without requiring explicit user action.

## How It Works

### Sync Trigger Points

The `syncTasksToCollection()` function is called automatically after:

1. **Creating a new list** (POST `/api/v1/tasklists`)
   - When copying from a template
   - When creating a custom list with tasks
   - When initializing default lists (daily.default, weekly.default)

2. **Updating an existing list** (POST `/api/v1/tasklists` with taskListId)
   - When modifying task properties
   - When adding/removing tasks
   - When updating list from a template

3. **Recording task completions/status changes** (POST `/api/v1/tasklists` with recordCompletions)
   - When updating Day.tasks (completing/uncompleting tasks)
   - When task status changes (open → in progress → done, etc.)
   - When tasks are added to a Day entry
   - When Day entry is created with initial tasks

### Sync Logic

```typescript
async function syncTasksToCollection(listId: string, embeddedTasks: any[], userId: string)
```

**For each embedded task:**

1. **Check if task exists** in Task collection (by name + listId)
2. **If exists:** Update the existing Task with current data
3. **If new:** Create new Task in collection
4. **Migrate completers:** Convert `task.completers[]` to Job entries

**Field Mapping:**

| Embedded Task Field | Task Collection Field | Notes |
|---------------------|----------------------|-------|
| `name` | `name` | Primary identifier |
| `localeKey` | `localeKey` | Translation key |
| `categories` | `categories` | Array of categories |
| `area` | `area` | self, home, social, work |
| `status` | `status` | Converted to TaskStatus enum |
| `budget` | `budget` | Task budget allocation |
| `recurrence` or `cadence` | `recurrence` | Recurrence rules |
| `visibility` | `visibility` | PRIVATE, PUBLIC, etc. |
| `quality` | `quality` | Quality metric |
| `persons` or `contacts` | `persons` | Associated persons |
| `completers[]` | Jobs[] | **Migrated to Job collection** |

### Status Conversion

Legacy string statuses are converted to TaskStatus enum:

```typescript
'open' → 'OPEN'
'in progress' → 'IN_PROGRESS'
'steady' → 'STEADY'
'ready' → 'READY'
'done' → 'DONE'
'ignored' → 'IGNORED'
```

### Completer Migration

When embedded tasks have `completers` array, each completer is converted to a Job:

```typescript
{
  taskId: newTask.id,
  listId: listId,
  operatorId: completer.id,
  status: 'ACCEPTED',
  selfReview: completer.selfReview,
  peerReview: completer.peerReview,
  managerReview: completer.managerReview
}
```

## Benefits

### 1. Gradual Migration
- **No manual migration required** - Tasks sync automatically as users interact with them
- **Backward compatible** - Legacy embedded tasks continue to work
- **Zero downtime** - No breaking changes to existing functionality

### 2. Data Consistency
- **Always in sync** - Task collection stays current with embedded tasks
- **Update propagation** - Changes in legacy UI automatically flow to new structure
- **Completer history** - Historical completion data preserved as Jobs

### 3. Hybrid Support
- **Both systems work** - Legacy and new APIs coexist
- **Smart loading** - `useTasksHybrid` hook loads from best available source
- **Feature parity** - All data available in both formats

## Implementation Details

### File Modified
- [`src/app/api/v1/tasklists/route.ts`](../src/app/api/v1/tasklists/route.ts)

### Functions Added

#### `syncTasksToCollection()`
Background sync function (errors logged, not thrown)

**Parameters:**
- `listId: string` - List to sync tasks for
- `embeddedTasks: any[]` - Array of embedded tasks from templateTasks
- `userId: string` - User ID for Job creation

**Behavior:**
- Creates/updates Tasks in collection
- Migrates completers to Jobs
- Errors logged to console (non-blocking)

#### `convertStatusToEnum()`
Converts legacy status strings to TaskStatus enum

**Parameters:**
- `status?: string` - Legacy status string

**Returns:**
- `TaskStatus` - Enum value (default: 'OPEN')

### Sync Call Locations

**List Operations:**
1. **Line ~226** - After creating default lists
2. **Line ~2613** - After updating list with completedTasks
3. **Line ~2651** - After updating list by ID
4. **Line ~2704** - After creating new custom list (first instance)
5. **Line ~2745** - After updating existing list with tasks
6. **Line ~2773** - After creating new custom list (second instance)

**Day/Task Status Operations:**
7. **Line ~1266** - After removing uncompleted tasks from Day
8. **Line ~1399** - After updating Day with task changes
9. **Line ~1504** - After creating new Day entry with tasks

## Error Handling

Sync errors are **non-blocking**:
- Logged to console with `console.error()`
- Don't interrupt the main API operation
- Allow legacy system to continue functioning
- Background process - doesn't affect response time

## Testing

### Verify Sync Working

1. **Create a new list:**
   ```bash
   POST /api/v1/tasklists
   {
     "role": "custom",
     "name": "Test List",
     "tasks": [{ "name": "Test Task", "area": "self" }]
   }
   ```

2. **Check Task collection:**
   ```bash
   GET /api/v1/tasks?listId={listId}
   # Should return the synced task
   ```

3. **Update task status:**
   ```bash
   POST /api/v1/tasklists
   {
     "taskListId": "{listId}",
     "tasks": [{ "name": "Test Task", "status": "done" }]
   }
   ```

4. **Verify update:**
   ```bash
   GET /api/v1/tasks?listId={listId}
   # Task status should be 'DONE'
   ```

### Check Job Migration

1. **Complete a task** (add completer in legacy format)
2. **Query Jobs API:**
   ```bash
   GET /api/v1/jobs?listId={listId}
   # Should show Job entry with operatorId, reviews, status: ACCEPTED
   ```

## Future Enhancements

- [ ] Batch sync optimization (reduce DB calls)
- [ ] Conflict resolution (if both systems modified simultaneously)
- [ ] Sync metrics/monitoring
- [ ] Manual re-sync endpoint for fixing inconsistencies
- [ ] Deletion sync (remove Tasks when removed from templateTasks)

## Related Documentation

- [TASK-REFACTOR-HYBRID.md](./TASK-REFACTOR-HYBRID.md) - Hybrid system overview
- [COMPATIBILITY-FIXES.md](./COMPATIBILITY-FIXES.md) - Backward compatibility fixes
- [QUICK-START-HYBRID.md](./QUICK-START-HYBRID.md) - Quick start guide

---

**Status**: ✅ Implemented
**Date**: November 29, 2025
**Breaking Changes**: None (fully backward compatible)
