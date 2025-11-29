# Quick Start: Hybrid Task System

Get up and running with the new hybrid task system in 5 minutes.

## Step 1: Verify Installation ✅

The system is already installed! All files are in place:
- Database schema updated
- API endpoints created
- Frontend components ready

## Step 2: Test the API

### Check Migration Status
```bash
curl http://localhost:3000/api/v1/migrate/tasks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### List Tasks (will use legacy data if not migrated)
```bash
curl http://localhost:3000/api/v1/tasks?listId=YOUR_LIST_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Step 3: Add Migration UI

Add the migration panel to your settings page:

```tsx
// src/app/[locale]/app/settings/page.tsx (or wherever you want it)

import { TaskMigrationPanel } from '@/components/taskMigrationPanel'

export default function SettingsPage() {
  return (
    <div>
      <h1>Settings</h1>
      <TaskMigrationPanel />
    </div>
  )
}
```

## Step 4: Try Hybrid Loading

Replace your current task loading with the hybrid hook:

```tsx
// Before
const selectedTaskList = contextTaskLists.find(list => list.id === listId)
const tasks = selectedTaskList?.tasks || []

// After
import { useTasksHybrid } from '@/lib/hooks/useTasksHybrid'

const { tasks, isLoading, dataSource } = useTasksHybrid({
  listId,
  date: '2025-11-29',
  enabled: true
})

// Now tasks loads from best available source!
console.log('Data source:', dataSource) // 'legacy', 'collection', or 'day'
```

## Step 5: Use Simple Handlers

Replace complex task handlers:

```tsx
// Before
const handleTaskClick = async (task) => {
  // Complex logic with refs, debouncing, state merging...
}

// After
import { useSimpleTaskHandlers } from '@/lib/hooks/useSimpleTaskHandlers'

const { completeTask, updateTaskStatus, isUpdating } = useSimpleTaskHandlers({
  listId,
  onSuccess: refreshTaskLists
})

const handleTaskClick = (task) => completeTask(task)
const handleStatusChange = (task, status) => updateTaskStatus(task, status)
```

## Step 6: Migrate Your First List

1. Open the migration panel (from Step 3)
2. Click "Migrate" on a test list
3. Verify tasks appear correctly
4. Check `dataSource` changes to `'collection'`

## Step 7: Use the Hybrid ListView (Optional)

Try the new simplified ListView:

```tsx
import { ListViewHybrid } from '@/views/listViewHybrid'

<ListViewHybrid
  selectedTaskListId={listId}
  selectedDate={new Date()}
  onDateChange={setDate}
/>
```

## Common Use Cases

### Create a New Task
```tsx
const response = await fetch('/api/v1/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My new task',
    area: 'self',
    categories: ['body'],
    listId: 'list-id'
  })
})
```

### Create a Job (Task Completion)
```tsx
const response = await fetch('/api/v1/jobs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    taskId: 'task-id',
    listId: 'list-id',
    operatorId: 'user-id',
    status: 'REQUESTED'
  })
})
```

### Update Job with Self-Review
```tsx
const response = await fetch(`/api/v1/jobs/${jobId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    selfReview: 4.5,
    status: 'VALIDATING'
  })
})
```

### Manager Validates Job
```tsx
const response = await fetch(`/api/v1/jobs/${jobId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    peerReview: 4.0,
    managerReview: 4.5,
    status: 'ACCEPTED'
  })
})
```

## Debugging

### Check Data Source
```tsx
const { dataSource } = useTasksHybrid({ listId, date })
console.log('Loading from:', dataSource)
// 'legacy' = old embedded tasks
// 'collection' = new Task collection (migrated!)
// 'day' = Day.tasks embedded
```

### Check API Responses
Open browser DevTools → Network tab:
- Look for `/api/v1/tasks` calls
- Check response status and data
- Verify authorization headers

### Check Migration Status
```tsx
const response = await fetch('/api/v1/migrate/tasks')
const { summary } = await response.json()
console.log(`Migrated: ${summary.migratedLists}/${summary.totalLists}`)
```

## Troubleshooting

**Tasks not loading**
- Check `dataSource` - should not be `'none'`
- Verify listId is correct
- Check browser console for errors

**Migration failed**
- Check you're OWNER or MANAGER of the list
- Verify API endpoint is accessible
- Check server logs

**Optimistic updates not working**
- Ensure onSuccess callback is provided
- Check network tab for API calls
- Verify task has proper structure

## What's Next?

1. **Test thoroughly** - Try creating, updating, completing tasks
2. **Monitor dataSource** - Track which lists are migrated
3. **Migrate gradually** - One list at a time
4. **Use Jobs API** - Try creating jobs with reviews
5. **Read full docs** - See [TASK-REFACTOR-HYBRID.md](./TASK-REFACTOR-HYBRID.md)

## Key Concepts

### Task Status Enum
```
OPEN → IN_PROGRESS → STEADY/READY → DONE
                   ↘ IGNORED
```

### Job Status Flow
```
REQUESTED → IN_PROGRESS → VALIDATING → ACCEPTED
                                    ↘ REJECTED
```

### Role Permissions
- **OWNER**: Everything
- **MANAGER**: Everything
- **COLLABORATOR**: Can create jobs for self, read tasks
- **FOLLOWER**: Read only

### Data Priority
```
1. Day.tasks (for specific date)
2. Task collection (migrated)
3. List.tasks (legacy)
```

---

**Ready to go!** 🚀

Start with Step 3 (add migration UI) and proceed from there.

For detailed documentation, see:
- [TASK-REFACTOR-HYBRID.md](./TASK-REFACTOR-HYBRID.md) - Full documentation
- [IMPLEMENTATION-COMPLETE.md](./IMPLEMENTATION-COMPLETE.md) - Implementation details
