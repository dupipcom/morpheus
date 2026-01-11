# Task and Jobs View Refactor Plan

## Overview

Refactor the frontend task management views to use the new Task and Job models instead of embedded tasks and completedTasks JSON structure. This plan implements a migration from the legacy system to a cleaner, more structured approach with proper job tracking and review workflows.

## User Requirements

1. **Ephemeral Tasks**: Migrate to Task model with recurrence support
   - Tasks with recurrence repeat every X days/weeks/months/years
   - One-off tasks (formerly ephemeral) have no recurrence

2. **Task Completion**: Hybrid validation approach
   - Solo lists: Auto-accept jobs (simplified workflow)
   - Collaborative lists: Require owner/manager validation (formal workflow)

3. **Migration Strategy**: One-time migration script
   - Convert old `List.completedTasks` to Job records
   - Convert old `List.ephemeralTasks` to Task records
   - After migration, only use new structure

4. **Job Features**: Review interface
   - UI for owners/managers to review and validate Jobs
   - Display peer/manager review scores
   - Track job history per task

## Critical Files to Modify

### Views (Priority Order)
1. `/Users/dreampip/ar/dpip/morpheus/src/views/listView.tsx` - Main task list display
2. `/Users/dreampip/ar/dpip/morpheus/src/components/taskGrid.tsx` - Task grid rendering
3. `/Users/dreampip/ar/dpip/morpheus/src/components/taskItem.tsx` - Individual task card
4. `/Users/dreampip/ar/dpip/morpheus/src/views/forms/addTaskForm.tsx` - Task creation/editing
5. `/Users/dreampip/ar/dpip/morpheus/src/views/forms/addListForm.tsx` - List creation with task management
6. `/Users/dreampip/ar/dpip/morpheus/src/components/steadyTasks.tsx` - Cross-list task aggregation

### Hooks
7. `/Users/dreampip/ar/dpip/morpheus/src/lib/hooks/useTaskHandlers.ts` - Task CRUD operations
8. `/Users/dreampip/ar/dpip/morpheus/src/lib/hooks/useTaskStatuses.ts` - Status tracking
9. `/Users/dreampip/ar/dpip/morpheus/src/lib/hooks/useOptimisticUpdates.ts` - Optimistic UI updates

### New Components to Create
10. `/Users/dreampip/ar/dpip/morpheus/src/components/jobReviewModal.tsx` - Job review interface (NEW)
11. `/Users/dreampip/ar/dpip/morpheus/src/components/jobHistoryPanel.tsx` - Job history display (NEW)
12. `/Users/dreampip/ar/dpip/morpheus/src/lib/hooks/useJobs.ts` - Job management hook (NEW)

### Migration
13. `/Users/dreampip/ar/dpip/morpheus/src/migrations/migrate-tasks-and-jobs.ts` - Data migration script (NEW)

## Implementation Plan

### Phase 1: Data Migration Script

**File**: `src/migrations/migrate-tasks-and-jobs.ts`

Create migration script to convert legacy data:

1. **Migrate embedded tasks to Task collection**:
   - For each List with `tasks` array, create Task records
   - Set `listId` reference on each Task
   - Preserve all task fields (name, categories, area, status, etc.)
   - Convert old ephemeral tasks to Task records with no recurrence
   - Map old status strings to new TaskStatus enum

2. **Migrate completedTasks to Job collection**:
   - Parse `List.completedTasks[year][date].openTasks` and `.closedTasks`
   - For each completer entry, create a Job record:
     - `workerId`: completer.id
     - `taskId`: Find matching Task by name/localeKey
     - `listId`: Parent list ID
     - `status`: 'ACCEPTED' (historical completions are accepted)
     - `createdAt`: completer.completedAt
     - Set earnings data (if available in old data)

3. **Update List model**:
   - Set `taskIds` array with references to migrated Task IDs
   - Clear out `tasks`, `completedTasks`, `ephemeralTasks` fields
   - Create ListHistoryEntry records for major completions

4. **Clean up legacy fields**:
   - After successful migration, remove deprecated fields from List records

**Migration Strategy**:
- Run as a one-time script via `npx tsx src/migrations/migrate-tasks-and-jobs.ts`
- Include rollback capability in case of errors
- Generate migration report with statistics

---

### Phase 2: Core Hook Refactor

**File**: `src/lib/hooks/useJobs.ts` (NEW)

Create new hook for Job management:

```typescript
export function useJobs({
  listId,
  taskId,
  workerId,
  status
}: {
  listId?: string
  taskId?: string
  workerId?: string
  status?: string
}) {
  // Fetch jobs from /api/v1/jobs with query params
  // Return: { jobs, isLoading, error, createJob, updateJob, deleteJob }
  // Include optimistic updates
}
```

**File**: `src/lib/hooks/useTaskHandlers.ts`

Refactor to use new endpoints:

1. **Replace `/api/v1/tasklists` with new endpoints**:
   - Task updates: `PUT /api/v1/tasks/[taskId]`
   - Job creation: `POST /api/v1/jobs`
   - Job updates: `PUT /api/v1/jobs/[jobId]`

2. **Update `handleTaskClick` for hybrid validation**:
   ```typescript
   const handleTaskClick = async (task: any) => {
     // Determine if list is collaborative
     const isCollaborative = selectedTaskList.users.length > 1
     const userRole = getUserRole(selectedTaskList, userId)

     // Create Job record
     const jobStatus = isCollaborative && userRole === 'COLLABORATOR'
       ? 'VALIDATING'  // Requires review
       : 'ACCEPTED'    // Auto-accept for solo or owner/manager

     await fetch('/api/v1/jobs', {
       method: 'POST',
       body: JSON.stringify({
         taskId: task.id,
         listId: selectedTaskList.id,
         workerId: user.id,
         status: jobStatus
       })
     })

     // Update task status if fully completed
     if (newCount >= task.times) {
       await fetch(`/api/v1/tasks/${task.id}`, {
         method: 'PUT',
         body: JSON.stringify({ status: 'DONE' })
       })
     }
   }
   ```

3. **Update other handlers**:
   - `handleStatusChange`: Update via `/api/v1/tasks/[taskId]`
   - `handleIncrementCount`: Update task count
   - `handleDecrementCount`: Update task count and potentially delete most recent Job
   - `handleToggleRedacted`: Update via `/api/v1/tasks/[taskId]`

4. **Add new handlers**:
   - `handleValidateJob`: For owners/managers to accept/reject jobs
   - `handleAddPeerReview`: Update peerReview score
   - `handleAddManagerReview`: Update managerReview score

**File**: `src/lib/hooks/useTaskStatuses.ts`

Update to read from Task.status field instead of calculating from count/times:
- Fetch task status from Task model directly
- Remove calculation logic (status is now stored in DB)

---

### Phase 3: ListView Refactor

**File**: `src/views/listView.tsx`

Major refactor to remove embedded task logic:

1. **Remove completedTasks parsing**:
   - Delete all code reading from `List.completedTasks[year][date]`
   - Delete ephemeralTasks handling code
   - Remove task merging logic

2. **Fetch tasks from new API**:
   ```typescript
   const { data: tasksData } = useSWR(
     selectedTaskList?.id ? `/api/v1/tasks?listId=${selectedTaskList.id}` : null,
     fetcher
   )
   const tasks = tasksData?.tasks || []
   ```

3. **Fetch jobs for date filtering**:
   ```typescript
   const { data: jobsData } = useSWR(
     selectedTaskList?.id && selectedDate
       ? `/api/v1/jobs?listId=${selectedTaskList.id}&date=${formatDateLocal(selectedDate)}`
       : null,
     fetcher
   )
   const jobs = jobsData?.jobs || []
   ```

4. **Filter tasks by date using jobs**:
   - Show tasks that have jobs created on the selected date
   - Show tasks with recurrence matching the selected date
   - Show one-off tasks (no recurrence) only on their creation date

5. **Update task display**:
   - Pass jobs data to TaskGrid for completion badges
   - Remove old completer badge logic (now from Job.worker)

6. **Add date navigation**:
   - Keep existing date picker
   - Filter tasks/jobs by selected date

---

### Phase 4: TaskGrid & TaskItem Refactor

**File**: `src/components/taskGrid.tsx`

Update task grid to work with new data:

1. **Update task sorting**:
   - Read status from `task.status` (TaskStatus enum)
   - Map old status strings to new enum values:
     - 'in progress' → 'IN_PROGRESS'
     - 'steady' → 'STEADY'
     - 'ready' → 'READY'
     - 'open' → 'OPEN'
     - 'done' → 'DONE'
     - 'ignored' → 'IGNORED'

2. **Update completer badges**:
   - Replace completer data from task.completers
   - Use Job data instead:
     ```typescript
     const jobsForTask = jobs.filter(j => j.taskId === task.id)
     const latestJob = jobsForTask[0] // Most recent
     const completerName = latestJob?.worker?.profiles?.[0]?.username
     const earnings = calculateEarnings(latestJob)
     ```

3. **Add job status indicators**:
   - Show validation status for jobs in VALIDATING state
   - Add badge/icon for jobs awaiting review
   - Show review button for owners/managers

4. **Update options menu**:
   - Keep status change options
   - Add "View History" option (opens job history panel)
   - Add "Review" option for pending jobs (owners/managers only)
   - Update edit/delete to use new endpoints

**File**: `src/components/taskItem.tsx`

Update individual task cards:

1. **Update completion display**:
   - Show count from task.count field
   - Show times from task.times field
   - Display status badge using TaskStatus enum

2. **Add job indicators**:
   - Pending validation badge for VALIDATING jobs
   - Review score display (if job has reviews)
   - Multiple completers support (show all recent completers)

---

### Phase 5: New Job Review Components

**File**: `src/components/jobReviewModal.tsx` (NEW)

Create modal for reviewing jobs:

1. **Modal structure**:
   - Display job details (task name, worker, completion date)
   - Show worker's self-review score (if provided)
   - Input fields for peerReview and managerReview (0-5 scale)
   - Accept/Reject buttons
   - Notes section (link to Note records via reviewersNotes)

2. **Authorization**:
   - Only show for OWNER/MANAGER roles
   - Disable if user is the job worker (can't validate own work)

3. **API integration**:
   ```typescript
   const handleAccept = async () => {
     await fetch(`/api/v1/jobs/${job.id}`, {
       method: 'PUT',
       body: JSON.stringify({
         status: 'ACCEPTED',
         peerReview: peerScore,
         managerReview: managerScore
       })
     })
   }
   ```

4. **Trigger points**:
   - Open from task options menu
   - Open from job history panel
   - Show notification badge on tasks with pending jobs

**File**: `src/components/jobHistoryPanel.tsx` (NEW)

Create panel/drawer for viewing job history:

1. **Display job list**:
   - Show all jobs for a specific task
   - Group by date or status
   - Sort by most recent first

2. **Job details**:
   - Worker name and profile picture
   - Completion timestamp
   - Review scores (self/peer/manager)
   - Status (REQUESTED/IN_PROGRESS/VALIDATING/ACCEPTED/REJECTED)
   - Earnings (if available)

3. **Actions**:
   - View full job details
   - Open review modal for pending jobs
   - Filter by status

4. **Trigger**:
   - Open from task options menu "View History"
   - Show on hover/long-press on task card

---

### Phase 6: Task Form Updates

**File**: `src/views/forms/addTaskForm.tsx`

Update task creation/editing form:

1. **Add recurrence fields**:
   ```typescript
   <Select>
     <option value="NONE">One-off (no repeat)</option>
     <option value="DAILY">Daily</option>
     <option value="WEEKLY">Weekly</option>
     <option value="MONTHLY">Monthly</option>
     <option value="YEARLY">Yearly</option>
   </Select>

   <Input
     label="Repeat every X"
     type="number"
     placeholder="e.g., 2 for every 2 days"
   />

   {frequency === 'WEEKLY' && (
     <WeekdayPicker /> // Select which days of week
   )}
   {frequency === 'MONTHLY' && (
     <MonthDayPicker /> // Select which days of month
   )}
   ```

2. **Update API calls**:
   - Create: `POST /api/v1/tasks`
   - Update: `PUT /api/v1/tasks/[taskId]`
   - Delete: `DELETE /api/v1/tasks/[taskId]`

3. **Recurrence data structure**:
   ```typescript
   recurrence: {
     frequency: 'WEEKLY',
     interval: 2,  // Every 2 weeks
     byWeekday: [1, 3, 5],  // Mon, Wed, Fri
     byMonthDay: [],
     byMonth: [],
     endDate: null,
     occurrenceCount: null
   }
   ```

4. **Remove ephemeral task toggle**:
   - All tasks are now regular tasks
   - One-off tasks simply have recurrence.frequency = 'NONE'

**File**: `src/views/forms/addListForm.tsx`

Update list creation/editing form:

1. **Update task management**:
   - Remove embedded task list
   - Add "Manage Tasks" button (opens task selection modal)
   - Show task count instead of full task list

2. **Update collaborator management**:
   - Use new `List.users` model with role selection
   - Add role dropdown: OWNER, MANAGER, COLLABORATOR, FOLLOWER
   - Update API to use UserReference[] format

3. **Add wallet linking**:
   - Wallet selection dropdown
   - Create new wallet option
   - Link to existing wallet

---

### Phase 7: SteadyTasks Component Update

**File**: `src/components/steadyTasks.tsx`

Update cross-list task aggregation:

1. **Fetch tasks from new API**:
   ```typescript
   const { data } = useSWR(
     '/api/v1/tasks?status=IN_PROGRESS,STEADY',
     fetcher
   )
   ```

2. **Remove completedTasks navigation**:
   - Delete code that checks List.completedTasks
   - Use task.status directly

3. **Update task filtering**:
   - Filter by TaskStatus.IN_PROGRESS and TaskStatus.STEADY
   - Sort by list role priority and status

---

## Data Migration Notes

### Task Model Mapping

**Old embedded Task** → **New Task model**:
- `id` → Generate new ObjectId if missing
- `name` → `name`
- `categories` → `categories`
- `area` → `area`
- `status` (string) → `status` (enum - uppercase conversion)
- `times` → `times`
- `count` → `count`
- `localeKey` → `localeKey`
- `completedOn` → `completedOn`
- `dueDate` → `dueDate`
- Ephemeral tasks → `recurrence: null` (one-off tasks)
- Template tasks → `recurrence` based on list role (daily/weekly)

### Job Model Creation

**Old task.completers** → **New Job records**:
- `completer.id` → `workerId`
- Find Task by name/localeKey → `taskId`
- Parent list → `listId`
- `completer.completedAt` → `createdAt`
- Default → `status: ACCEPTED`
- `completer.earnings` → Calculate from budget (if available)

---

## Testing Checklist

After implementation, verify:

1. **Task Display**:
   - [ ] Tasks load from new `/api/v1/tasks` endpoint
   - [ ] Tasks display correctly in grid view
   - [ ] One-off tasks appear only on creation date
   - [ ] Recurring tasks repeat on correct dates
   - [ ] Task status changes work correctly

2. **Task Completion**:
   - [ ] Solo list completions auto-accept
   - [ ] Collaborative list completions create VALIDATING jobs
   - [ ] Optimistic UI updates work correctly
   - [ ] Task count increments/decrements properly

3. **Job Management**:
   - [ ] Jobs are created on task completion
   - [ ] Job review modal opens for pending jobs
   - [ ] Owners/managers can accept/reject jobs
   - [ ] Workers cannot validate their own jobs
   - [ ] Review scores save correctly

4. **Job History**:
   - [ ] Job history panel displays all completions
   - [ ] Completer badges show correct worker info
   - [ ] Earnings display correctly

5. **Migration**:
   - [ ] All embedded tasks converted to Task records
   - [ ] All completedTasks converted to Job records
   - [ ] Legacy fields removed after migration
   - [ ] No data loss during migration

6. **Forms**:
   - [ ] Task creation with recurrence works
   - [ ] Task editing preserves recurrence data
   - [ ] List creation with new UserReference model works
   - [ ] Wallet linking works

---

## Potential Issues & Solutions

**Issue 1**: Large datasets may cause slow migrations
- **Solution**: Process in batches (e.g., 100 lists at a time), add progress logging

**Issue 2**: Matching old task completers to new Task IDs
- **Solution**: Use name + localeKey + area as composite key for matching

**Issue 3**: Optimistic updates may conflict with new job creation flow
- **Solution**: Update optimistic update logic to handle job statuses

**Issue 4**: Recurring tasks may create duplicate records
- **Solution**: Add unique constraint on (taskId + date) for job creation, check for existing jobs before creating

**Issue 5**: Users may lose access to old completion history during migration
- **Solution**: Keep read-only view of old completedTasks data until migration is verified

---

## Implementation Order

1. **Week 1**: Data migration script + testing
2. **Week 2**: Core hooks refactor (useJobs, useTaskHandlers)
3. **Week 3**: ListView, TaskGrid, TaskItem updates
4. **Week 4**: New components (JobReviewModal, JobHistoryPanel)
5. **Week 5**: Form updates (AddTaskForm, AddListForm)
6. **Week 6**: SteadyTasks update + comprehensive testing

---

## Files Summary

**Modify (11 files)**:
1. `src/views/listView.tsx`
2. `src/components/taskGrid.tsx`
3. `src/components/taskItem.tsx`
4. `src/views/forms/addTaskForm.tsx`
5. `src/views/forms/addListForm.tsx`
6. `src/components/steadyTasks.tsx`
7. `src/lib/hooks/useTaskHandlers.ts`
8. `src/lib/hooks/useTaskStatuses.ts`
9. `src/lib/hooks/useOptimisticUpdates.ts`
10. `src/lib/utils/taskUtils.ts` (update status enum mapping)
11. `src/app/constants.ts` (update DAILY_ACTIONS/WEEKLY_ACTIONS if needed)

**Create (4 files)**:
1. `src/components/jobReviewModal.tsx`
2. `src/components/jobHistoryPanel.tsx`
3. `src/lib/hooks/useJobs.ts`
4. `src/migrations/migrate-tasks-and-jobs.ts`

**Total**: 15 files
