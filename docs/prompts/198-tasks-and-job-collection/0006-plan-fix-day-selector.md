# Plan: Fixing Day Selector Support After Tasks Consolidation

## Problem Summary

After implementing the tasks consolidation (0001-tasks), the day selector no longer affects which tasks are displayed. Users can select different dates, but the same tasks appear regardless of the selected date.

### Root Causes

1. **Tasks API ignores date parameter**: `/api/v1/tasks?listId=X` returns ALL tasks for a list with no date filtering
2. **tasksUrl has no date parameter**: In `listView.tsx` line 155, the URL doesn't include the selected date
3. **New API bypasses old working logic**: When `tasksFromApi.length > 0`, the date-aware `mergedTasks` logic (which respects `completedTasks[year][date]`) is completely skipped
4. **Job model lacks occurrence date**: Job records track `createdAt` but not which specific date the completion applies to

### Current Behavior

```typescript
// listView.tsx - Line 155 (before fix)
const tasksUrl = selectedTaskListId ? `/api/v1/tasks?listId=${selectedTaskListId}` : null
// ❌ No date parameter! Always returns same tasks regardless of selectedDate
```

### Expected Behavior

When a user selects a different date:
1. Show loading spinner while fetching tasks for that date
2. Display only tasks that should appear on the selected date based on their recurrence rules
3. Show the completion status specific to that date (same recurring task can be incomplete on one day, completed on another)

---

## Design Decision: Date-Aware Task System

### Core Insight

The current `Task` model represents the **task definition** (blueprint), not a **task instance** for a specific date. For recurring tasks like "Drank Water" (daily recurrence), we need:

- **One `Task` record**: Defines the task (name, recurrence rule, etc.)
- **Date-scoped completion tracking**: The same task can have different completion states on different days

### Two Design Options

#### Option A: Add `occurrenceDate` to Job Model ✅ (Recommended)

**Pros:**
- Minimal schema changes
- Reuses existing Job model
- Simpler to implement and test
- Jobs naturally track "who completed what on which date"

**Cons:**
- Job model becomes slightly overloaded (tracks both completion and date context)

#### Option B: Create TaskInstance Model

**Pros:**
- Cleaner separation: Task = blueprint, TaskInstance = concrete instance for a date
- More explicit architecture
- Easier to add instance-specific fields later

**Cons:**
- More complex implementation
- Additional model to manage
- More database queries

**Decision**: Start with **Option A** (simpler), design system to allow migration to Option B if needed later.

---

## Implementation Plan

### Phase 1: Schema Changes

**File**: `prisma/schema.prisma`

Add `occurrenceDate` field to Job model:

```prisma
model Job {
  id               String    @id @default(auto()) @map("_id") @db.ObjectId
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  status           JobStatus @default(REQUESTED)

  // NEW: The date this job applies to (YYYY-MM-DD format)
  // Allows same task to have different completion states on different days
  occurrenceDate   String?

  // Review fields
  selfReview       Float?
  peerReview       Float?
  managerReview    Float?

  // Relations
  workerId         String    @db.ObjectId
  worker           User      @relation("JobWorker", fields: [workerId], references: [id], onDelete: Cascade)
  taskId           String    @db.ObjectId
  task             Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  listId           String    @db.ObjectId
  list             List      @relation(fields: [listId], references: [id], onDelete: Cascade)

  // Other fields...
  reviewerIds      String[]  @db.ObjectId
  reviewersNoteIds String[]  @db.ObjectId

  @@index([status])
  @@index([workerId])
  @@index([taskId])
  @@index([listId])
  @@index([occurrenceDate])              // NEW: Index for date filtering
  @@index([taskId, occurrenceDate])      // NEW: Composite index for task+date queries
  @@index([workerId, occurrenceDate])    // NEW: Composite index for worker+date queries
}
```

**Run**: `npx prisma db push`

---

### Phase 2: Create Recurrence Service

**New File**: `src/lib/services/task/taskRecurrenceService.ts`

```typescript
import prisma from '@/lib/prisma'
import type { Task, Job, TaskStatus } from '@/generated/prisma'

/**
 * Task with date-specific status and completion data
 */
export interface TaskForDate {
  task: Task
  dateStatus: TaskStatus
  dateCount: number
  completers: Array<{ id: string; completedAt: Date }>
}

/**
 * Check if a task should appear on a specific date based on its recurrence rule
 */
export function shouldTaskAppearOnDate(task: Task, targetDate: Date): boolean {
  // Tasks without recurrence rules are one-time tasks
  // They appear on all dates (or until completed/archived)
  if (!task.recurrence) {
    return true
  }

  const recurrence = task.recurrence as any
  const frequency = recurrence.frequency

  // Handle NONE frequency (one-time tasks)
  if (frequency === 'NONE') {
    return true
  }

  // Check if task has started (firstOccurrence)
  if (task.firstOccurrence && targetDate < task.firstOccurrence) {
    return false
  }

  // Check if recurrence has ended
  if (recurrence.endDate && targetDate > new Date(recurrence.endDate)) {
    return false
  }

  const interval = recurrence.interval || 1
  const targetTime = targetDate.getTime()
  const startTime = task.firstOccurrence ? task.firstOccurrence.getTime() : 0

  switch (frequency) {
    case 'DAILY': {
      if (!task.firstOccurrence) return true
      const daysSinceStart = Math.floor((targetTime - startTime) / (1000 * 60 * 60 * 24))
      return daysSinceStart % interval === 0
    }

    case 'WEEKLY': {
      const targetDay = targetDate.getDay() // 0 = Sunday, 6 = Saturday
      const byWeekday = recurrence.byWeekday || []

      // If no specific weekdays specified, appear on all days
      if (byWeekday.length === 0) return true

      // Check if target day is in the allowed weekdays
      return byWeekday.includes(targetDay)
    }

    case 'MONTHLY': {
      const targetDay = targetDate.getDate()
      const byMonthDay = recurrence.byMonthDay || []

      // If no specific days specified, appear on all days
      if (byMonthDay.length === 0) return true

      return byMonthDay.includes(targetDay)
    }

    case 'YEARLY': {
      if (!task.firstOccurrence) return true
      const targetMonth = targetDate.getMonth()
      const targetDay = targetDate.getDate()
      const startMonth = task.firstOccurrence.getMonth()
      const startDay = task.firstOccurrence.getDate()

      return targetMonth === startMonth && targetDay === startDay
    }

    default:
      return true
  }
}

/**
 * Get tasks that should appear for a specific date with date-specific completion status
 */
export async function getTasksForDate(
  listId: string,
  targetDate: string
): Promise<TaskForDate[]> {
  // 1. Fetch all tasks for the list
  const tasks = await prisma.task.findMany({
    where: { listId },
    include: {
      jobs: {
        where: { occurrenceDate: targetDate },
        include: {
          worker: {
            select: { id: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  const targetDateObj = new Date(targetDate)
  const result: TaskForDate[] = []

  for (const task of tasks) {
    // Check if this task should appear on the target date
    if (!shouldTaskAppearOnDate(task, targetDateObj)) {
      continue
    }

    // Calculate date-specific status based on jobs for this specific date
    const jobsForDate = task.jobs
    const acceptedJobs = jobsForDate.filter(j => j.status === 'ACCEPTED')
    const count = acceptedJobs.length
    const times = task.times || 1

    let dateStatus: TaskStatus = 'OPEN'
    if (count >= times) {
      dateStatus = 'DONE'
    } else if (count > 0) {
      dateStatus = 'IN_PROGRESS'
    }

    result.push({
      task,
      dateStatus,
      dateCount: count,
      completers: acceptedJobs.map(j => ({
        id: j.workerId,
        completedAt: j.createdAt
      }))
    })
  }

  return result
}

/**
 * Calculate next occurrence date for a task based on its recurrence rule
 */
export function calculateNextOccurrence(task: Task, fromDate: Date): Date | null {
  if (!task.recurrence) return null

  const recurrence = task.recurrence as any
  const frequency = recurrence.frequency

  if (frequency === 'NONE') return null

  const interval = recurrence.interval || 1
  const nextDate = new Date(fromDate)

  switch (frequency) {
    case 'DAILY':
      nextDate.setDate(nextDate.getDate() + interval)
      break

    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + (7 * interval))
      break

    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + interval)
      break

    case 'YEARLY':
      nextDate.setFullYear(nextDate.getFullYear() + interval)
      break

    default:
      return null
  }

  // Check if we've exceeded the end date
  if (recurrence.endDate && nextDate > new Date(recurrence.endDate)) {
    return null
  }

  return nextDate
}
```

**New File**: `src/lib/services/task/index.ts`

Update to export new service:

```typescript
export * from './types'
export * from './taskMigrationService'
export * from './taskRecurrenceService'  // NEW
```

---

### Phase 3: Update Tasks API

**File**: `src/app/api/v1/tasks/route.ts`

Add date parameter support and recurrence-aware filtering:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getTasksForDate, shouldTaskAppearOnDate } from '@/lib/services/task'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const listId = searchParams.get('listId')
    const date = searchParams.get('date')        // NEW: YYYY-MM-DD format
    const status = searchParams.get('status')
    const area = searchParams.get('area')

    // NEW: If date is provided, use date-aware service
    if (date && listId) {
      const tasksForDate = await getTasksForDate(listId, date)

      // Verify user has access to this list
      const list = await prisma.list.findUnique({
        where: { id: listId },
        select: { users: true }
      })

      if (!list) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 })
      }

      const hasAccess = list.users.some(
        (userRef: any) =>
          userRef.userId === user.id &&
          ['OWNER', 'MANAGER', 'COLLABORATOR', 'FOLLOWER'].includes(userRef.role)
      )

      if (!hasAccess) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Map to response format
      const tasks = tasksForDate.map(({ task, dateStatus, dateCount, completers }) => ({
        ...task,
        dateStatus,      // Date-specific status
        dateCount,       // Date-specific count
        completers,      // Date-specific completers
        // Keep original task status for reference
        taskStatus: task.status
      }))

      return NextResponse.json({ tasks, date })
    }

    // EXISTING: Non-date-filtered query (for backwards compatibility)
    const whereClause: any = {}
    if (listId) whereClause.listId = listId
    if (status) whereClause.status = status
    if (area) whereClause.area = area

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        list: {
          select: { id: true, name: true, users: true, role: true }
        },
        jobs: {
          include: {
            worker: {
              select: {
                id: true,
                userId: true,
                profiles: { select: { username: true, data: true } }
              }
            }
          }
        },
        candidates: { select: { id: true, userId: true } },
        raisedTransactions: true
      },
      orderBy: { createdAt: 'desc' }
    })

    // Filter by membership
    const authorizedTasks = tasks.filter((task: any) => {
      if (!task.list) return false
      return task.list.users.some(
        (userRef: any) =>
          userRef.userId === user.id &&
          ['OWNER', 'MANAGER', 'COLLABORATOR', 'FOLLOWER'].includes(userRef.role)
      )
    })

    return NextResponse.json({ tasks: authorizedTasks })
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST, PUT, DELETE methods remain unchanged
```

---

### Phase 4: Update Jobs API

**File**: `src/app/api/v1/jobs/route.ts`

Add `occurrenceDate` support:

```typescript
// In POST handler
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      taskId,
      listId,
      workerId,
      status,
      occurrenceDate,  // NEW: YYYY-MM-DD format
      selfReview,
      peerReview,
      managerReview,
      reviewerIds,
      reviewersNoteIds
    } = body

    // Validate required fields
    if (!taskId || !listId || !workerId) {
      return NextResponse.json(
        { error: 'Missing required fields: taskId, listId, and workerId are required' },
        { status: 400 }
      )
    }

    // NEW: Validate occurrenceDate format if provided
    if (occurrenceDate && !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) {
      return NextResponse.json(
        { error: 'Invalid occurrenceDate format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // ... existing authorization checks ...

    // Create job with occurrenceDate
    const job = await prisma.job.create({
      data: {
        taskId,
        listId,
        workerId,
        status: status || 'REQUESTED',
        occurrenceDate: occurrenceDate || null,  // NEW
        selfReview: selfReview || null,
        peerReview: peerReview || null,
        managerReview: managerReview || null,
        reviewerIds: reviewerIds || [],
        reviewersNoteIds: reviewersNoteIds || []
      },
      include: {
        task: true,
        worker: {
          select: {
            id: true,
            userId: true,
            profiles: { select: { username: true } }
          }
        },
        list: true
      }
    })

    return NextResponse.json({ job }, { status: 201 })
  } catch (error) {
    console.error('Error creating job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// In GET handler
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const listId = searchParams.get('listId')
    const taskId = searchParams.get('taskId')
    const workerId = searchParams.get('workerId')
    const status = searchParams.get('status')
    const date = searchParams.get('date')  // NEW

    const whereClause: any = {}
    if (listId) whereClause.listId = listId
    if (taskId) whereClause.taskId = taskId
    if (workerId) whereClause.workerId = workerId
    if (status) whereClause.status = status
    if (date) whereClause.occurrenceDate = date  // NEW

    // ... rest of GET implementation ...
  }
}
```

---

### Phase 5: Update listView.tsx

**File**: `src/views/listView.tsx`

Add date parameter to API calls and handle loading state:

```typescript
// Around line 155 - Update tasksUrl to include date
const tasksUrl = selectedTaskListId
  ? `/api/v1/tasks?listId=${selectedTaskListId}&date=${date}`  // NEW: Add date parameter
  : null

// Update SWR to track loading state
const { data: tasksData, mutate: mutateTasks, isLoading: isLoadingTasks } = useSWR(
  tasksUrl,
  fetcher,
  {
    revalidateOnFocus: false,
  }
)
const tasksFromApi = tasksData?.tasks || []

// Check if we're loading tasks for a new date
const isLoadingTasksForDate = isLoadingTasks && tasksUrl !== null

// Around line 480 - Update tasksToDisplay to use date-aware status
const tasksToDisplay = useMemo(() => {
  if (tasksFromApi.length > 0) {
    return tasksFromApi.map((t: any) => ({
      ...t,
      displayName: t.name,
      // Use date-specific status and count from API
      status: t.dateStatus || t.status || 'open',
      count: t.dateCount ?? t.count ?? 0,
      times: t.times || 1,
      completers: t.completers || []
    }))
  }

  // Fallback to old mergedTasks logic during migration
  return mergedTasks
}, [tasksFromApi, mergedTasks])

// Around line 527 - Add loading state for date changes
if (isLoadingTasksForDate) {
  return (
    <div className="space-y-4">
      {/* Toolbar skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <Skeleton className="h-9 w-full sm:w-[260px]" />
        <Skeleton className="h-9 w-full sm:w-[240px]" />
        <Skeleton className="h-9 w-20" />
      </div>

      {/* Loading message */}
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
        <span className="text-muted-foreground">{t('tasks.loadingForDate')}</span>
      </div>
    </div>
  )
}
```

---

### Phase 6: Update useTaskHandlers.ts

**File**: `src/lib/hooks/useTaskHandlers.ts`

Pass `occurrenceDate` when creating/deleting jobs:

```typescript
// Add date parameter to hook
interface UseTaskHandlersOptions {
  taskListId: string
  tasks: any[]
  date: string           // NEW: Current selected date (YYYY-MM-DD)
  userId?: string
  // ... other options
}

// In handleTaskClick
const handleTaskClick = useCallback(async (task: any) => {
  // ... existing logic ...

  try {
    // Ensure task is migrated to Task collection before completing
    const { id: taskId, migrated } = await ensureTaskMigrated(task, taskListId)

    // ... existing authorization logic ...

    // If completing (not uncompleting), create a Job record with occurrenceDate
    if (!isCurrentlyCompleted) {
      await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          listId: taskListId,
          workerId: userId,
          status: jobStatus,
          occurrenceDate: date  // NEW: Pass the selected date
        })
      })
    } else {
      // If uncompleting, find and delete the most recent job for this task/worker/date
      const jobsResponse = await fetch(
        `/api/v1/jobs?taskId=${taskId}&workerId=${userId}&date=${date}`
      )

      if (jobsResponse.ok) {
        const jobsData = await jobsResponse.json()
        const mostRecentJob = jobsData.jobs?.[0]

        if (mostRecentJob) {
          await fetch(`/api/v1/jobs/${mostRecentJob.id}`, {
            method: 'DELETE'
          })
        }
      }
    }

    // ... rest of logic ...
  } catch (error) {
    // ... error handling ...
  }
}, [taskListId, userId, selectedTaskList, date, onRefresh, onRefreshUser, ...])

// Similar updates for handleIncrementCount, handleDecrementCount, etc.
```

---

### Phase 7: Update Translations

**File**: `src/locales/en.json`

Add loading message:

```json
{
  "tasks": {
    "loadingForDate": "Loading tasks for selected date...",
    "noTasksForDate": "No tasks scheduled for this date"
  }
}
```

Repeat for all 33 locales.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                            │
│                                                                   │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │   Day Selector   │───▶│         ListView                  │   │
│  │  (2026-01-20)   │    │  selectedDate → date (YYYY-MM-DD) │   │
│  └──────────────────┘    └───────────────┬──────────────────┘   │
└──────────────────────────────────────────┼──────────────────────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                      SWR Data Fetching                            │
│                                                                   │
│  tasksUrl = /api/v1/tasks?listId=X&date=2026-01-20               │
│  jobsUrl = /api/v1/jobs?listId=X&date=2026-01-20                 │
│                                                                   │
│  When date changes → new URL → SWR refetches → shows loading     │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Tasks API (GET with date)                      │
│                                                                   │
│  1. Call getTasksForDate(listId, "2026-01-20")                   │
│  2. Fetch all tasks for list from Task collection                │
│  3. For each task:                                               │
│     - Check shouldTaskAppearOnDate(task, 2026-01-20)             │
│     - If YES: Include in results                                 │
│     - Fetch Jobs where occurrenceDate = "2026-01-20"             │
│     - Calculate dateStatus (OPEN/IN_PROGRESS/DONE)               │
│     - Calculate dateCount from accepted jobs                     │
│  4. Return filtered tasks with date-specific status              │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Recurrence Logic                              │
│                                                                   │
│  shouldTaskAppearOnDate(task, targetDate):                       │
│                                                                   │
│  • DAILY (interval=1): Every day                                 │
│  • DAILY (interval=2): Every 2 days from firstOccurrence         │
│  • WEEKLY: Check if targetDate.getDay() in byWeekday[]           │
│  • MONTHLY: Check if targetDate.getDate() in byMonthDay[]        │
│  • YEARLY: Check if month+day match firstOccurrence              │
│  • NONE: Appears on all dates (one-time task)                    │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Task Completion Flow                            │
│                                                                   │
│  User clicks task → handleTaskClick():                           │
│    1. Ensure task migrated (has valid ObjectId)                  │
│    2. Create Job record:                                         │
│       {                                                           │
│         taskId: "..."                                             │
│         workerId: "..."                                           │
│         listId: "..."                                             │
│         occurrenceDate: "2026-01-20"  ← Selected date            │
│         status: "ACCEPTED" or "VALIDATING"                       │
│       }                                                           │
│    3. Refetch tasks for date                                     │
│    4. Task now shows as completed for this date only             │
│                                                                   │
│  Next day (2026-01-21):                                           │
│    - Same task appears again (if recurrence matches)             │
│    - No jobs for 2026-01-21 → shows as incomplete                │
└──────────────────────────────────────────────────────────────────┘
```

---

## Example Scenarios

### Scenario 1: Daily Recurring Task

**Task**: "Drank Water" (frequency: DAILY, interval: 1, times: 8)

| Date | Appears? | Jobs for Date | Status | Count |
|------|----------|---------------|--------|-------|
| 2026-01-20 | ✅ Yes | 3 ACCEPTED | IN_PROGRESS | 3/8 |
| 2026-01-21 | ✅ Yes | 8 ACCEPTED | DONE | 8/8 |
| 2026-01-22 | ✅ Yes | 0 | OPEN | 0/8 |

**User Flow**:
1. Select 2026-01-20 → sees task with 3/8 water marks
2. Click task 5 times → creates 5 Job records with `occurrenceDate: "2026-01-20"`
3. Task status changes: IN_PROGRESS (3/8) → DONE (8/8)
4. Select 2026-01-21 → sees task with 8/8 water marks (completed yesterday)
5. Select 2026-01-22 → sees task with 0/8 water marks (new day!)

### Scenario 2: Weekly Recurring Task

**Task**: "Laundry" (frequency: WEEKLY, byWeekday: [0, 3] = Sunday, Wednesday)

| Date | Day | Appears? | Jobs for Date | Status |
|------|-----|----------|---------------|--------|
| 2026-01-18 | Sun | ✅ Yes | 1 ACCEPTED | DONE |
| 2026-01-19 | Mon | ❌ No | - | - |
| 2026-01-20 | Tue | ❌ No | - | - |
| 2026-01-21 | Wed | ✅ Yes | 0 | OPEN |

**User Flow**:
1. Select 2026-01-18 (Sunday) → sees "Laundry" task
2. Complete task → Job with `occurrenceDate: "2026-01-18"`
3. Select 2026-01-19 (Monday) → "Laundry" doesn't appear (not in byWeekday)
4. Select 2026-01-21 (Wednesday) → "Laundry" appears again, status OPEN

### Scenario 3: One-Time Task

**Task**: "File Taxes" (recurrence: null or frequency: NONE)

| Date | Appears? | Jobs for Date | Status |
|------|----------|---------------|--------|
| 2026-01-20 | ✅ Yes | 0 | OPEN |
| 2026-01-21 | ✅ Yes | 1 ACCEPTED (from 01-20) | DONE |
| 2026-01-22 | ✅ Yes | 1 ACCEPTED (from 01-20) | DONE |

**Note**: One-time tasks appear on all dates. Once completed, they stay completed.

---

## Backwards Compatibility

### Old System Preservation

The old `List.completedTasks[year][date]` structure:
- **Remains intact** in the database
- **Still readable** by the old `mergedTasks` logic
- Used as **fallback** when `tasksFromApi.length === 0`
- Provides **historical data** for dates before migration

### Migration Path

1. **Existing embedded tasks**: Migrated via `taskMigrationService.ts` (from 0005-plan-reconcile-tasks)
2. **Old completions**: Preserved in `completedTasks` JSON, visible as historical data
3. **New completions**: Created as Job records with `occurrenceDate`
4. **Gradual transition**: Both systems work in parallel during migration period

### Fallback Logic

```typescript
const tasksToDisplay = useMemo(() => {
  // Try new API first
  if (tasksFromApi.length > 0) {
    return tasksFromApi // Date-aware, from Task collection
  }

  // Fallback to old system (still date-aware via completedTasks[year][date])
  return mergedTasks
}, [tasksFromApi, mergedTasks])
```

---

## Testing Plan

### 1. Schema Changes
- Run `npx prisma db push`
- Verify `occurrenceDate` field exists on Job model
- Verify indexes created: `[occurrenceDate]`, `[taskId, occurrenceDate]`

### 2. Unit Tests

**File**: `src/lib/services/task/taskRecurrenceService.test.ts`

```typescript
describe('shouldTaskAppearOnDate', () => {
  it('shows daily task every day', () => {
    const task = {
      recurrence: { frequency: 'DAILY', interval: 1 },
      firstOccurrence: new Date('2026-01-01')
    }
    expect(shouldTaskAppearOnDate(task, new Date('2026-01-20'))).toBe(true)
    expect(shouldTaskAppearOnDate(task, new Date('2026-01-21'))).toBe(true)
  })

  it('shows 2-daily task every other day', () => {
    const task = {
      recurrence: { frequency: 'DAILY', interval: 2 },
      firstOccurrence: new Date('2026-01-01')
    }
    expect(shouldTaskAppearOnDate(task, new Date('2026-01-01'))).toBe(true)
    expect(shouldTaskAppearOnDate(task, new Date('2026-01-02'))).toBe(false)
    expect(shouldTaskAppearOnDate(task, new Date('2026-01-03'))).toBe(true)
  })

  it('shows weekly task only on specified weekdays', () => {
    const task = {
      recurrence: { frequency: 'WEEKLY', byWeekday: [1, 3, 5] }, // Mon, Wed, Fri
      firstOccurrence: new Date('2026-01-01')
    }
    expect(shouldTaskAppearOnDate(task, new Date('2026-01-19'))).toBe(true)  // Mon
    expect(shouldTaskAppearOnDate(task, new Date('2026-01-20'))).toBe(false) // Tue
    expect(shouldTaskAppearOnDate(task, new Date('2026-01-21'))).toBe(true)  // Wed
  })
})
```

### 3. API Tests

**Tasks API with date parameter**:
```bash
# Test: Get tasks for specific date
curl "http://localhost:3000/api/v1/tasks?listId=<listId>&date=2026-01-20"

# Verify response includes dateStatus and dateCount
```

**Jobs API with occurrenceDate**:
```bash
# Test: Create job for specific date
curl -X POST "http://localhost:3000/api/v1/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<taskId>",
    "listId": "<listId>",
    "workerId": "<workerId>",
    "occurrenceDate": "2026-01-20"
  }'

# Test: Get jobs for specific date
curl "http://localhost:3000/api/v1/jobs?listId=<listId>&date=2026-01-20"
```

### 4. UI Tests

**Day Selector**:
1. Open a list with daily tasks
2. Select today's date → verify tasks load
3. Select yesterday → verify tasks load with different completion state
4. Select tomorrow → verify tasks load (all incomplete)
5. Verify loading spinner appears during fetch

**Task Completion**:
1. Select a date (e.g., 2026-01-20)
2. Complete a daily task
3. Verify task shows as DONE
4. Select next day (2026-01-21)
5. Verify same task shows as OPEN (new instance)
6. Return to previous day (2026-01-20)
7. Verify task still shows as DONE

**Weekly Tasks**:
1. Create a task with weekly recurrence (e.g., Monday, Wednesday, Friday)
2. Select Monday → task appears
3. Select Tuesday → task doesn't appear
4. Select Wednesday → task appears again

### 5. Migration Tests

**Old tasks with new date selector**:
1. Open a list with old embedded tasks (not yet migrated)
2. Select different dates
3. Verify old `mergedTasks` logic still works (fallback)
4. Complete a task → triggers migration
5. After migration, verify date selector works with new system

---

## Performance Considerations

### Database Indexes

The composite index `[taskId, occurrenceDate]` enables fast queries like:
```sql
-- Find all jobs for a specific task on a specific date
db.jobs.find({ taskId: "...", occurrenceDate: "2026-01-20" })
```

### Caching Strategy

SWR automatically caches results by URL:
- `/api/v1/tasks?listId=X&date=2026-01-20` → cached separately from
- `/api/v1/tasks?listId=X&date=2026-01-21`

Changing dates triggers new fetch but previous dates remain cached.

### Optimization Opportunities

1. **Prefetch adjacent dates**: When user selects a date, prefetch ±1 day
2. **Batch job queries**: Fetch jobs for multiple dates in one query for weekly lists
3. **Client-side recurrence calculation**: For simple rules (DAILY), calculate on client

---

## Critical Files for Implementation

| File | Changes | Complexity |
|------|---------|------------|
| `prisma/schema.prisma` | Add `occurrenceDate` to Job | Low |
| `src/lib/services/task/taskRecurrenceService.ts` | NEW - Recurrence logic | Medium |
| `src/app/api/v1/tasks/route.ts` | Add date filtering | Medium |
| `src/app/api/v1/jobs/route.ts` | Add occurrenceDate support | Low |
| `src/views/listView.tsx` | Add date to URL, loading state | Low |
| `src/lib/hooks/useTaskHandlers.ts` | Pass occurrenceDate to jobs | Low |
| `src/locales/*.json` | Add loading messages | Low |

---

## Rollout Strategy

### Phase 1: Backend (API + Database)
1. Schema changes (add `occurrenceDate`)
2. Create `taskRecurrenceService.ts`
3. Update Tasks API with date filtering
4. Update Jobs API with `occurrenceDate`
5. Test with API client (curl/Postman)

### Phase 2: Frontend
1. Update `listView.tsx` to add date to URL
2. Add loading state for date changes
3. Update `useTaskHandlers` to pass `occurrenceDate`
4. Test in dev environment

### Phase 3: Deployment
1. Deploy to nightly (beta.dupip.com)
2. Test with real data
3. Monitor for issues
4. Deploy to production (www.dupip.com)

### Phase 4: Migration
1. Run batch migration for old embedded tasks
2. Gradually phase out old `completedTasks` reads
3. Keep old data for historical reference

---

## Success Criteria

✅ **Day selector functionality restored**: Selecting different dates shows different tasks

✅ **Date-specific completion tracking**: Same recurring task can be completed/incomplete on different days

✅ **Loading feedback**: Spinner appears when switching dates

✅ **Recurrence rules respected**: Daily tasks appear daily, weekly tasks on specified weekdays

✅ **Backwards compatible**: Old lists with embedded tasks continue to work

✅ **Migration seamless**: Users don't experience data loss or unexpected behavior

---

## Future Enhancements

### 1. Task Instance Materialization
Create explicit TaskInstance records for better performance:
```prisma
model TaskInstance {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  taskId         String   @db.ObjectId
  task           Task     @relation(fields: [taskId], references: [id])
  occurrenceDate String   // YYYY-MM-DD
  status         TaskStatus
  count          Int      @default(0)

  @@unique([taskId, occurrenceDate])
}
```

### 2. Prefetching
Preload tasks for adjacent dates to improve perceived performance.

### 3. Offline Support
Cache task definitions and sync completions when back online.

### 4. Smart Recurrence
Learn from user behavior to suggest optimal recurrence patterns.
