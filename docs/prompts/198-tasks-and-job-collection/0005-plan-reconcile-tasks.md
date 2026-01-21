# Plan: Reconciling Old and New Tasks After Consolidation

## Problem Summary

The application has two task systems coexisting after the tasks consolidation (0001-tasks):

### Old Task System (Embedded)
- `List.templateTasks[]` - Blueprint tasks stored as `EmbeddedTask[]`
- `List.completedTasks[year][date]` - JSON structure with `openTasks[]` and `closedTasks[]`
- `List.ephemeralTasks.open[]` and `List.ephemeralTasks.closed[]` - Ad-hoc tasks
- `task.completers[]` - Array tracking who completed tasks with earnings/prize

### New Task System (Collection)
- `Task` model in Prisma (standalone collection)
- `Job` model for tracking completions with review workflow
- Tasks reference lists via `listId`
- Status uses `TaskStatus` enum: `OPEN`, `IN_PROGRESS`, `STEADY`, `READY`, `DONE`, `IGNORED`

### The Issue
When the front-end tries to complete an old embedded task, it calls `/api/v1/tasks/[taskId]` or `/api/v1/jobs` which expect Task collection records. These don't exist for old tasks, causing failures.

---

## Design Decisions

### 1. Migration Location: API-driven on-the-fly migration
- **Primary**: Dedicated API endpoint `/api/v1/tasks/migrate`
- **Trigger**: Front-end calls when it detects old tasks without Task collection records
- **Batch**: Standalone migration script for bulk processing

### 2. Task Matching: Composite key
```typescript
const getTaskMatchKey = (task: EmbeddedTask | Task): string => {
  return task.localeKey || task.id || task.name?.toLowerCase() || ''
}
```

### 3. Migration Tracking: List-level metadata
Add `migrationMetadata` JSON field to List model:
```json
{
  "migratedTaskKeys": ["drankWater", "showered", ...],
  "completedMigration": false,
  "migratedAt": "2024-01-20T..."
}
```

### 4. Completers → Jobs Conversion
```typescript
// For each completer in old task.completers[]
const job = {
  taskId: migratedTask.id,
  listId: list.id,
  workerId: completer.id,
  status: 'DONE',  // Historical completions are accepted
  createdAt: completer.completedAt,
}
```

### 5. Recurrence Assignment Based on List Role
```typescript
function getRecurrenceFromListRole(listRole: string | null): RecurrenceRule | null {
  if (listRole?.startsWith('daily')) {
    return { frequency: 'DAILY', interval: 1, byWeekday: [], byMonthDay: [], byMonth: [] }
  }
  if (listRole?.startsWith('weekly')) {
    return { frequency: 'WEEKLY', interval: 1, byWeekday: [], byMonthDay: [], byMonth: [] }
  }
  return null // One-off or custom lists
}
```

---

## Implementation Plan

### Phase 1: Schema Update

**File**: `prisma/schema.prisma`

Add migration tracking field to List model:
```prisma
model List {
  // ... existing fields
  migrationMetadata Json?  // Track migration state
}
```

Run: `npx prisma db push`

---

### Phase 2: Create Task Migration Service

**New File**: `src/lib/services/task/taskMigrationService.ts`

```typescript
interface MigrationResult {
  tasksCreated: number
  jobsCreated: number
  skipped: number
  errors: string[]
  migratedTasks: Task[]
}

export async function migrateListTasks(params: {
  listId: string
  userId: string
  taskKeys?: string[]  // Optional: migrate specific tasks only
}): Promise<MigrationResult>

export async function migrateEmbeddedTask(params: {
  embeddedTask: EmbeddedTask
  listId: string
  listRole: string | null
  userId: string
}): Promise<{ task: Task; jobs: Job[] }>

export async function migrateCompletersToJobs(params: {
  taskId: string
  listId: string
  completers: Completer[]
}): Promise<Job[]>

export function isTaskMigrated(
  listMigrationMetadata: MigrationMetadata | null,
  taskKey: string
): boolean

export function getTaskMatchKey(task: EmbeddedTask | Task): string
```

---

### Phase 3: Create Migration API Endpoint

**New File**: `src/app/api/v1/tasks/migrate/route.ts`

```typescript
// POST /api/v1/tasks/migrate
// Body: { listId: string, taskKeys?: string[] }

export async function POST(request: NextRequest) {
  // 1. Authenticate user
  const { userId } = await auth()
  if (!userId) return unauthorized()

  // 2. Get internal user
  const user = await prisma.user.findUnique({ where: { userId } })

  // 3. Parse request body
  const { listId, taskKeys } = await request.json()

  // 4. Verify user is OWNER or MANAGER of list
  const list = await prisma.list.findUnique({
    where: { id: listId },
    include: { users: true }
  })

  const userRole = list.users.find(u => u.userId === user.id)?.role
  if (!['OWNER', 'MANAGER'].includes(userRole)) {
    return forbidden()
  }

  // 5. Call migration service
  const result = await migrateListTasks({
    listId,
    userId: user.id,
    taskKeys
  })

  return NextResponse.json(result)
}
```

---

### Phase 4: Update listView.tsx

**File**: `src/views/listView.tsx`

Add migration detection and trigger:

```typescript
// In mergedTasks calculation, identify tasks needing migration
const tasksNeedingMigration = useMemo(() => {
  if (!tasksFromApi || tasksFromApi.length === 0) return []

  return mergedTasks.filter(task => {
    const taskKey = keyOf(task)
    const existsInCollection = tasksFromApi.some(t =>
      t.id === task.id ||
      t.localeKey === task.localeKey ||
      t.name?.toLowerCase() === task.name?.toLowerCase()
    )
    return !existsInCollection
  })
}, [mergedTasks, tasksFromApi])

// Trigger migration when needed
useEffect(() => {
  if (tasksNeedingMigration.length > 0 && selectedTaskListId) {
    fetch('/api/v1/tasks/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listId: selectedTaskListId,
        taskKeys: tasksNeedingMigration.map(t => keyOf(t))
      })
    }).then(() => {
      refreshTaskLists()
    })
  }
}, [tasksNeedingMigration.length, selectedTaskListId])
```

---

### Phase 5: Update useTaskHandlers.ts

**File**: `src/lib/hooks/useTaskHandlers.ts`

Add migration-aware completion:

```typescript
const handleTaskClick = useCallback(async (task: any) => {
  // Check if task exists in Task collection (valid 24-char ObjectId)
  const hasTaskCollectionRecord = task.id &&
    typeof task.id === 'string' &&
    task.id.length === 24 &&
    /^[a-f0-9]+$/i.test(task.id)

  if (!hasTaskCollectionRecord) {
    // Migrate task first
    const response = await fetch('/api/v1/tasks/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listId: taskListId,
        taskKeys: [getTaskKey(task)]
      })
    })

    const result = await response.json()
    if (result.tasksCreated > 0 && result.migratedTasks?.[0]) {
      task = { ...task, id: result.migratedTasks[0].id }
    }
  }

  // Continue with existing completion logic...
}, [taskListId])
```

---

### Phase 6: Update Tasks GET API (Optional Fallback)

**File**: `src/app/api/v1/tasks/route.ts`

Add migration hint when no tasks found:

```typescript
// If no tasks found for listId, check for legacy tasks
if (tasks.length === 0 && listId) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { templateTasks: true, role: true }
  })

  if (list?.templateTasks?.length > 0) {
    return NextResponse.json({
      tasks: [],
      migrationNeeded: true,
      legacyTaskCount: list.templateTasks.length
    })
  }
}
```

---

### Phase 7: Batch Migration Script (Optional)

**New File**: `src/migrations/0015-migrate-embedded-tasks-to-collection.ts`

```typescript
import prisma from '@/lib/prisma'
import { migrateListTasks } from '@/lib/services/task/taskMigrationService'

async function main() {
  const lists = await prisma.list.findMany({
    where: {
      templateTasks: { isEmpty: false },
      migrationMetadata: null
    },
    select: { id: true, users: true }
  })

  console.log(`Found ${lists.length} lists to migrate`)

  for (const list of lists) {
    const owner = list.users.find(u => u.role === 'OWNER')
    if (!owner) continue

    const result = await migrateListTasks({
      listId: list.id,
      userId: owner.userId
    })
    console.log(`List ${list.id}: ${result.tasksCreated} tasks migrated`)
  }
}

main()
```

---

## Critical Files

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `migrationMetadata` field to List |
| `src/lib/services/task/taskMigrationService.ts` | NEW - Core migration logic |
| `src/app/api/v1/tasks/migrate/route.ts` | NEW - Migration API endpoint |
| `src/views/listView.tsx` | Update to detect and trigger migration |
| `src/lib/hooks/useTaskHandlers.ts` | Update for migration-aware completion |
| `src/app/api/v1/tasks/route.ts` | Optional - Add migration hint |

---

## Data Flow

```
1. User opens ListView
   ↓
2. ListView fetches tasks via GET /api/v1/tasks?listId=X
   ↓
3. If no tasks returned but list has templateTasks:
   → Front-end triggers POST /api/v1/tasks/migrate
   → Migration service creates Task + Job records
   → Front-end refreshes task lists
   ↓
4. User clicks task to complete:
   → useTaskHandlers checks if task.id is valid ObjectId
   → If not, triggers migration for that task first
   → Creates Job record via POST /api/v1/jobs
   ↓
5. Old completedTasks data preserved (read-only)
   → Used for historical display
```

---

## Verification Plan

1. **Schema Change**: Run `npx prisma db push` and verify `migrationMetadata` field exists
2. **Migration Service**: Write unit tests for `migrateEmbeddedTask` and `migrateCompletersToJobs`
3. **API Endpoint**: Test POST /api/v1/tasks/migrate with Postman/curl
4. **Front-end Integration**:
   - Open ListView with a list that has old tasks
   - Verify migration is triggered automatically
   - Verify tasks can be completed after migration
5. **Recurrence**: Verify daily tasks get DAILY recurrence, weekly tasks get WEEKLY
6. **Idempotency**: Run migration twice, verify no duplicate tasks created
