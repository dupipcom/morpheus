# Task System Hybrid Implementation

This document explains the hybrid task system that supports both the legacy embedded task structure and the new Task collection model.

## Overview

The refactor introduces a **hybrid approach** that allows the application to work with both:
- **Legacy**: Embedded tasks in `List.tasks`, `List.completedTasks`, `Day.tasks` (EmbeddedTask type)
- **New**: Task collection with Job tracking, advanced status management, and better performance

## Architecture

### Database Models

#### Task Collection (New)
```prisma
model Task {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  name            String
  categories      Category[]
  area            Areas
  status          TaskStatus @default(OPEN)
  // ... other fields
  listId          String? @db.ObjectId
  list            List? @relation(fields: [listId], references: [id])
  jobs            Job[]
}

enum TaskStatus {
  OPEN
  IN_PROGRESS
  STEADY
  READY
  DONE
  IGNORED
}
```

#### Job Model (Replaces task.completers)
```prisma
model Job {
  id             String    @id @default(auto()) @map("_id") @db.ObjectId
  selfReview     Float?
  peerReview     Float?
  managerReview  Float?
  status         JobStatus @default(REQUESTED)
  operatorId     String @db.ObjectId
  operator       User @relation("OperatorJobs", fields: [operatorId], references: [id])
  taskId         String @db.ObjectId
  task           Task @relation(fields: [taskId], references: [id])
  listId         String @db.ObjectId
  list           List @relation(fields: [listId], references: [id])
  reviewerIds    String[] @default([]) @db.ObjectId
}

enum JobStatus {
  REQUESTED
  IN_PROGRESS
  VALIDATING
  ACCEPTED
  REJECTED
}
```

#### EmbeddedTask Type (Legacy)
Used by `Day.tasks` and `Template.tasks` for backward compatibility.

### API Endpoints

#### Tasks API
- `GET /api/v1/tasks` - List tasks with filtering
- `POST /api/v1/tasks` - Create task (OWNER/MANAGER only)
- `GET /api/v1/tasks/[taskId]` - Get single task
- `PUT /api/v1/tasks/[taskId]` - Update task (OWNER/MANAGER only)
- `DELETE /api/v1/tasks/[taskId]` - Delete task (OWNER/MANAGER only)

#### Jobs API
- `GET /api/v1/jobs` - List jobs with filtering
- `POST /api/v1/jobs` - Create job
- `GET /api/v1/jobs/[jobId]` - Get single job
- `PUT /api/v1/jobs/[jobId]` - Update job (granular permissions)
- `DELETE /api/v1/jobs/[jobId]` - Delete job (OWNER/MANAGER only)

#### Migration API
- `GET /api/v1/migrate/tasks` - Get migration status for user's lists
- `POST /api/v1/migrate/tasks` - Migrate tasks (all or single list)

### Frontend Components

#### Hooks

**`useTasksHybrid`** - Smart task loading
```typescript
const { tasks, isLoading, error, dataSource } = useTasksHybrid({
  listId: 'list-id',
  date: '2025-11-29',
  enabled: true
})
// dataSource: 'day' | 'collection' | 'legacy' | 'none'
```

Loading priority:
1. Day.tasks (embedded tasks for specific date)
2. Task collection (new structure)
3. List.tasks or List.templateTasks (legacy)

**`useSimpleTaskHandlers`** - Simplified task operations
```typescript
const {
  updateTaskStatus,
  completeTask,
  getOptimisticStatus,
  isUpdating
} = useSimpleTaskHandlers({
  listId: 'list-id',
  onSuccess: refreshTaskLists
})
```

Features:
- Optimistic updates (immediate UI feedback)
- Automatic API selection (new Task API or legacy)
- No debouncing, no complex state merging
- Single API call per operation

#### Components

**`ListViewHybrid`** - Simplified list view
```tsx
<ListViewHybrid
  selectedTaskListId={listId}
  selectedDate={new Date()}
  onDateChange={setDate}
/>
```

**`TaskMigrationPanel`** - Migration UI
```tsx
<TaskMigrationPanel />
```

## Migration Process

### 1. Check Migration Status

**Via API:**
```bash
GET /api/v1/migrate/tasks
```

**Via UI:**
Use the `TaskMigrationPanel` component to see which lists need migration.

### 2. Migrate Data

**Migrate all lists:**
```bash
POST /api/v1/migrate/tasks
Content-Type: application/json
{}
```

**Migrate single list:**
```bash
POST /api/v1/migrate/tasks
Content-Type: application/json
{
  "listId": "list-id-here"
}
```

**Via UI:**
Use the `TaskMigrationPanel` component's "Migrate" buttons.

### 3. What Gets Migrated

For each embedded task:
- Creates new Task in collection
- Converts old status strings to TaskStatus enum
- Migrates all task fields (categories, area, recurrence, etc.)
- Creates Job entries for each completer

### 4. Verification

After migration:
- Check `dataSource` in `useTasksHybrid` - should be `'collection'` or `'day'`
- Verify task counts match
- Test task operations (create, update, complete)

## Usage Examples

### Display Tasks with Hybrid Loading

```tsx
import { useTasksHybrid } from '@/lib/hooks/useTasksHybrid'

function MyTaskList({ listId, date }) {
  const { tasks, isLoading, dataSource } = useTasksHybrid({
    listId,
    date,
    enabled: true
  })

  if (isLoading) return <Skeleton />

  return (
    <div>
      <p>Data source: {dataSource}</p>
      {tasks.map(task => (
        <TaskItem key={task.id || task.name} task={task} />
      ))}
    </div>
  )
}
```

### Update Task Status

```tsx
import { useSimpleTaskHandlers } from '@/lib/hooks/useSimpleTaskHandlers'

function TaskItem({ task }) {
  const { updateTaskStatus, isUpdating } = useSimpleTaskHandlers({
    listId: task.listId,
    onSuccess: () => console.log('Updated!')
  })

  const handleStatusChange = (newStatus: string) => {
    updateTaskStatus(task, newStatus)
  }

  return (
    <button
      onClick={() => handleStatusChange('done')}
      disabled={isUpdating}
    >
      Mark as Done
    </button>
  )
}
```

### Complete Task (Increment Count)

```tsx
const { completeTask } = useSimpleTaskHandlers({ listId })

<button onClick={() => completeTask(task)}>
  Complete ({task.count || 0}/{task.times || 1})
</button>
```

## Role-Based Permissions

### Task Operations
- **OWNER**: Full access (create, read, update, delete)
- **MANAGER**: Full access (create, read, update, delete)
- **COLLABORATOR**: Read only for tasks (cannot create/update/delete tasks)
- **FOLLOWER**: Read only

### Job Operations
- **Create**: COLLABORATOR+ (can create for self), OWNER/MANAGER (can assign to others)
- **Update selfReview**: Only the operator (job.operatorId)
- **Update peerReview/managerReview**: Only OWNER/MANAGER
- **Validate (ACCEPTED/REJECTED)**: Only OWNER/MANAGER, cannot validate own job
- **Delete**: Only OWNER/MANAGER

## Benefits of Migration

### Before (Legacy)
- Tasks embedded in lists (no independent identity)
- Complex merging logic for completedTasks/openTasks
- Limited status tracking
- No granular permissions
- Completers array (limited metadata)

### After (New)
- Tasks as independent entities with IDs
- Simple, direct queries
- Rich status enum (OPEN, IN_PROGRESS, STEADY, READY, DONE, IGNORED)
- Role-based permissions
- Jobs with reviews, validation, status tracking
- Better performance and scalability

## Backward Compatibility

The hybrid system maintains full backward compatibility:
- Old data continues to work
- Migration is opt-in (can migrate per list)
- Frontend automatically detects and uses best available data source
- Legacy APIs still functional during transition

## Troubleshooting

### Tasks not loading
- Check `dataSource` in useTasksHybrid
- Verify API endpoints are accessible
- Check browser console for errors

### Migration failed
- Check user has access to list
- Verify no duplicate tasks exist
- Check server logs for detailed errors

### Optimistic updates not working
- Ensure task has an `id` (migrated) or falls back to legacy API
- Check network tab for API calls
- Verify onSuccess callback is firing

## Next Steps

1. **Test hybrid loading** - Verify tasks load from all sources
2. **Migrate one list** - Test migration on a single list
3. **Verify functionality** - Test create/update/delete operations
4. **Migrate remaining lists** - Once confident, migrate all lists
5. **Monitor dataSource** - Track migration progress via dataSource field
6. **Remove legacy code** - After full migration, can remove old logic (optional)

## Files Created

### Backend
- `prisma/schema.prisma` - Updated schema
- `src/app/api/v1/tasks/route.ts` - Tasks list/create
- `src/app/api/v1/tasks/[taskId]/route.ts` - Task get/update/delete
- `src/app/api/v1/jobs/route.ts` - Jobs list/create
- `src/app/api/v1/jobs/[jobId]/route.ts` - Job get/update/delete
- `src/app/api/v1/migrate/tasks/route.ts` - Migration endpoint

### Frontend
- `src/lib/hooks/useTasksHybrid.ts` - Hybrid task loading
- `src/lib/hooks/useSimpleTaskHandlers.ts` - Simplified handlers
- `src/views/listViewHybrid.tsx` - Hybrid list view component
- `src/components/taskMigrationPanel.tsx` - Migration UI

### Utilities
- `src/lib/utils/taskMigration.ts` - Migration helpers

## Support

For questions or issues with the hybrid system, check:
1. This documentation
2. Code comments in hybrid components
3. API response messages
4. Server logs for detailed errors
