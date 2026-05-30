# Epic #212: Job Review System - Overall Implementation Plan

**Issue:** https://github.com/dupipcom/morpheus/issues/212
**Milestone:** Do MVP (Due: March 1, 2026)
**Status:** Planning
**Created:** 2026-01-21

---

## Executive Summary

This epic introduces an end-to-end **job review workflow** for collaborative task management in lists with multiple collaborators. The system enables:

1. **Request-based task assignment**: Non-owners/managers can request to work on tasks
2. **Approval workflow**: Owners/managers approve/reject work requests
3. **Progress tracking**: Workers mark jobs as submitted when complete
4. **Validation cycle**: Owners/managers review and accept/reject submitted work
5. **Task status sync**: Completed jobs automatically update task status

### Key Goals
- Enable collaborative task management with accountability
- Provide clear review workflows for multi-user lists
- Maintain privacy controls for job participants
- Support self-review and peer review mechanisms

---

## Current State Analysis

### Existing Infrastructure ✅

**Database Schema:**
- `Job` model exists with basic fields:
  - `status`: JobStatus enum (REQUESTED, IN_PROGRESS, VALIDATING, ACCEPTED, REJECTED)
  - `workerId`, `taskId`, `listId` relations
  - `reviewerIds`, `reviewersNoteIds` arrays
  - Review scores: `selfReview`, `peerReview`, `managerReview`
  - Financial fields: `earnings`, `prize`, `profit`

**API Endpoints:**
- `GET /api/v1/jobs` - Fetch jobs with authorization filtering
- `POST /api/v1/jobs` - Create jobs with role validation
- `PUT /api/v1/jobs/[jobId]` - Update job status (assumed to exist)

**User Roles:**
- `OWNER`: Full control over list
- `MANAGER`: Can manage tasks and approve work
- `COLLABORATOR`: Can work on assigned tasks
- `FOLLOWER`: Read-only access

**Task Status:**
- OPEN, IN_PROGRESS, STEADY, READY, DONE, IGNORED, SKIPPED

### Missing Functionality ⚠️

1. **JobStatus.SUBMITTED** - Not in schema enum
2. **UI Components**:
   - Review workflow status buttons
   - Job details card below tasks
   - Visibility toggle for job details
3. **Job Details Fields**:
   - Free-text notes from requester (solution description)
   - Free-text notes from approver (review feedback)
4. **Withdrawal Mechanism**: Allow requester to cancel submitted work
5. **Notification System**: Alert users when action is needed
6. **Task-Job Status Sync**: Automatic task status updates based on job state

---

## Requirements Analysis

### Functional Requirements

#### FR1: Request-to-Work Flow
**As a** COLLABORATOR in a multi-user list
**I want to** request to work on a task owned by another user
**So that** the owner can approve my participation

**Acceptance Criteria:**
- When COLLABORATOR clicks task status button → shows "Request to Work" option
- System creates Job with status=REQUESTED
- Owner/Manager receives notification of request
- Task shows indicator that a request is pending

#### FR2: Approval/Rejection Flow
**As an** OWNER or MANAGER
**I want to** approve or reject work requests
**So that** I control who works on tasks

**Acceptance Criteria:**
- Owner/Manager sees job request card below task
- Card shows requester profile and "Approve" / "Reject" buttons
- Approve → Job status changes to IN_PROGRESS
- Reject → Job status changes to REJECTED, task status → OPEN

#### FR3: Work Submission Flow
**As a** COLLABORATOR (worker)
**I want to** submit my completed work for review
**So that** the owner can validate it

**Acceptance Criteria:**
- Worker sees "Submit for Review" option when job status=IN_PROGRESS
- Worker can add free-text solution description
- Submit → Job status changes to SUBMITTED
- Owner/Manager receives notification

#### FR4: Validation Flow
**As an** OWNER or MANAGER
**I want to** review and validate submitted work
**So that** I can accept or reject completion

**Acceptance Criteria:**
- Owner/Manager sees submitted job with worker's notes
- Options: "Accept" (→ ACCEPTED), "Request Changes" (→ VALIDATING), "Reject" (→ REJECTED)
- Can add free-text review feedback
- Accept → Job status=ACCEPTED, Task status=DONE
- Reject → Job status=REJECTED, Task status=OPEN

#### FR5: Withdrawal Mechanism
**As a** COLLABORATOR (worker)
**I want to** withdraw my submitted work
**So that** I can make changes before final review

**Acceptance Criteria:**
- Worker can click "Withdraw Submission" when job status=SUBMITTED
- Job status changes back to IN_PROGRESS
- Owner/Manager notification is cancelled

#### FR6: Privacy Controls
**As a** list participant
**I want to** control visibility of job details
**So that** I can keep work private until ready

**Acceptance Criteria:**
- Job details (notes, reviews) only visible to participants (worker, owner, managers, reviewers)
- Job status and worker name visible to all list members (for coordination)
- Visibility toggle near job details card

#### FR7: Self-Review Slider
**As a** worker
**I want to** rate my own work before submission
**So that** I can reflect on quality

**Acceptance Criteria:**
- Slider (0-10 or 0-100) in job submission form
- Stored in `Job.selfReview` field
- Visible to reviewers

---

## Architecture & Data Model Changes

### Schema Changes Required

#### 1. Add SUBMITTED Status to JobStatus Enum

```prisma
enum JobStatus {
  REQUESTED      // Worker requested to work on task
  IN_PROGRESS    // Owner approved, worker is working
  SUBMITTED      // NEW: Worker submitted work for review
  VALIDATING     // Owner requested changes
  ACCEPTED       // Owner accepted work (task complete)
  REJECTED       // Owner rejected work (task ignored)
}
```

#### 2. Add Note Relations to Job Model

Instead of simple text fields, use the existing Notes collection for richer content:

```prisma
model Job {
  // ... existing fields ...

  // Review workflow note relations
  requesterNoteIds String[]  @default([]) @db.ObjectId
  requesterNotes   Note[]    @relation("JobRequesterNotes", fields: [requesterNoteIds], references: [id])

  // reviewersNoteIds and reviewersNotes already exist in schema ✅

  // ... rest of model
}
```

**Benefits of using Notes:**
- Rich text formatting support
- Attachments (screenshots, documents)
- Edit history/versioning
- Existing visibility controls
- Can be commented on by others
- Reusable across the platform

**Migration:**
```bash
npx prisma db push
```

### State Machine Diagram

```
REQUESTED
    ↓ (Owner approves)
IN_PROGRESS
    ↓ (Worker submits)
SUBMITTED
    ↓ (Owner reviews)
    ├→ VALIDATING (request changes) → back to IN_PROGRESS
    ├→ ACCEPTED (approve) → Task status = DONE
    └→ REJECTED (reject) → Task status = OPEN
```

### Task-Job Status Mapping

| Job Status    | Task Status     | Notes                          |
|---------------|-----------------|--------------------------------|
| REQUESTED     | OPEN/existing   | No change until approved       |
| IN_PROGRESS   | IN_PROGRESS     | Worker actively working        |
| SUBMITTED     | READY           | Awaiting validation            |
| VALIDATING    | IN_PROGRESS     | Changes requested              |
| ACCEPTED      | DONE            | Work completed                 |
| REJECTED      | OPEN            | Work not accepted, task reopened |

---

## API Changes

### 1. Update Job Status Enum
**File:** `prisma/schema.prisma`

Add `SUBMITTED` to `JobStatus` enum.

### 2. Add Text Fields to Job Model
**File:** `prisma/schema.prisma`

Add `requesterNotes` and `reviewerNotes` fields.

### 3. Enhance PUT /api/v1/jobs/[jobId]
**File:** `src/app/api/v1/jobs/[jobId]/route.ts`

**Changes:**
- Accept `requesterNoteContent` and `reviewerNoteContent` in request body
- Create Note objects and link them to the job via relations
- Validate state transitions:
  - REQUESTED → IN_PROGRESS (only OWNER/MANAGER)
  - IN_PROGRESS → SUBMITTED (only worker)
  - SUBMITTED → IN_PROGRESS (only worker - withdrawal)
  - SUBMITTED → VALIDATING/ACCEPTED/REJECTED (only OWNER/MANAGER)
  - VALIDATING → IN_PROGRESS (automatic)
- Update task status when job status changes:
  - ACCEPTED → Task.status = DONE
  - REJECTED → Task.status = OPEN
  - SUBMITTED → Task.status = READY
- Trigger notifications on status changes

**Authorization Matrix:**

| From Status   | To Status      | Who Can Transition                |
|---------------|----------------|-----------------------------------|
| REQUESTED     | IN_PROGRESS    | OWNER, MANAGER                    |
| REQUESTED     | REJECTED       | OWNER, MANAGER                    |
| IN_PROGRESS   | SUBMITTED      | Worker (job.workerId)             |
| SUBMITTED     | IN_PROGRESS    | Worker (withdrawal)               |
| SUBMITTED     | VALIDATING     | OWNER, MANAGER, Reviewers         |
| SUBMITTED     | ACCEPTED       | OWNER, MANAGER, Reviewers         |
| SUBMITTED     | REJECTED       | OWNER, MANAGER, Reviewers         |
| VALIDATING    | IN_PROGRESS    | Worker                            |

**Example Implementation:**

```typescript
// In PUT /api/v1/jobs/[jobId]/route.ts
export async function PUT(request: NextRequest, { params }: { params: { jobId: string } }) {
  // ... auth and validation ...

  const body = await request.json()
  const { status, requesterNoteContent, reviewerNoteContent, selfReview, managerReview } = body

  // Create requester note if provided (for SUBMITTED status)
  let requesterNoteId: string | null = null
  if (requesterNoteContent && status === 'SUBMITTED') {
    const requesterNote = await prisma.note.create({
      data: {
        content: requesterNoteContent,
        userId: job.workerId,
        visibility: 'PRIVATE', // Only visible to job participants
        // Link to job via metadata or tags
        metadata: { jobId: params.jobId, type: 'job_submission' }
      }
    })
    requesterNoteId = requesterNote.id
  }

  // Create reviewer note if provided (for ACCEPTED/REJECTED/VALIDATING)
  let reviewerNoteId: string | null = null
  if (reviewerNoteContent && ['ACCEPTED', 'REJECTED', 'VALIDATING'].includes(status)) {
    const reviewerNote = await prisma.note.create({
      data: {
        content: reviewerNoteContent,
        userId: user.id,
        visibility: 'PRIVATE',
        metadata: { jobId: params.jobId, type: 'job_review' }
      }
    })
    reviewerNoteId = reviewerNote.id
  }

  // Update job with note relations
  const updatedJob = await prisma.job.update({
    where: { id: params.jobId },
    data: {
      status,
      selfReview,
      managerReview,
      ...(requesterNoteId && {
        requesterNoteIds: { push: requesterNoteId }
      }),
      ...(reviewerNoteId && {
        reviewersNoteIds: { push: reviewerNoteId }
      })
    },
    include: {
      task: true,
      requesterNotes: true,
      reviewersNotes: true,
      worker: { select: { id: true, profiles: true } }
    }
  })

  // Update task status based on job status
  if (status === 'ACCEPTED') {
    await prisma.task.update({
      where: { id: updatedJob.taskId },
      data: { status: 'DONE' }
    })
  } else if (status === 'REJECTED') {
    await prisma.task.update({
      where: { id: updatedJob.taskId },
      data: { status: 'OPEN' }
    })
  } else if (status === 'SUBMITTED') {
    await prisma.task.update({
      where: { id: updatedJob.taskId },
      data: { status: 'READY' }
    })
  }

  return NextResponse.json({ job: updatedJob })
}
```

### 4. Privacy Filtering in GET /api/v1/jobs
**File:** `src/app/api/v1/jobs/route.ts`

**Current:** Filters jobs by list membership.

**Enhancement:** Add privacy levels:
- **Public fields** (all list members): `id`, `status`, `workerId`, `taskId`, `occurrenceDate`
- **Private fields** (participants only): `requesterNotes` (Note objects), `reviewersNotes` (Note objects), `selfReview`, `peerReview`, `managerReview`, `earnings`

**Logic:**
```typescript
const isParticipant = (job: any, userId: string) => {
  return (
    job.workerId === userId ||
    job.list.users.some((u: any) =>
      u.userId === userId && ['OWNER', 'MANAGER'].includes(u.role)
    ) ||
    job.reviewerIds.includes(userId)
  )
}

// Filter job data based on participation
const filteredJobs = jobs.map(job => {
  if (isParticipant(job, user.id)) {
    return job // Full access
  }
  // Limited access: only public fields
  return {
    id: job.id,
    status: job.status,
    workerId: job.workerId,
    worker: job.worker, // Profile info for display
    taskId: job.taskId,
    occurrenceDate: job.occurrenceDate,
  }
})
```

---

## UI/UX Changes

### 1. Task Status Button Menu (Role-Based)

**File:** `src/components/taskGrid.tsx`

**Current Behavior:** All users see same status options.

**New Behavior:** Status menu options depend on user's role and task ownership.

#### Option A: User is OWNER/MANAGER of List
**Menu Options (standard):**
- Open → In Progress → Steady → Ready → Done
- Mark as Ignored
- Mark as Skipped

#### Option B: User is COLLABORATOR (non-owner of task)
**Menu Options (review workflow):**
- Request to Work (if no active job)
- Submit for Review (if job status = IN_PROGRESS)
- Withdraw Submission (if job status = SUBMITTED)
- View Job Status

#### Implementation:
```typescript
// Determine user's role in list
const userRole = selectedTaskList.users.find(
  (u: any) => u.userId === userId
)?.role

// Check if user owns the task
const isTaskOwner = task.userId === userId

// Find active job for this task and user
const activeJob = jobs.find(
  (j: any) => j.taskId === task.id && j.workerId === userId
)

// Build menu options
const getStatusMenuOptions = () => {
  if (userRole === 'OWNER' || userRole === 'MANAGER' || isTaskOwner) {
    return STANDARD_STATUS_OPTIONS
  }

  // Collaborator workflow
  if (!activeJob) {
    return [{ label: 'Request to Work', action: handleRequestWork }]
  }

  if (activeJob.status === 'REQUESTED') {
    return [{ label: 'Request Pending...', disabled: true }]
  }

  if (activeJob.status === 'IN_PROGRESS') {
    return [{ label: 'Submit for Review', action: handleSubmitWork }]
  }

  if (activeJob.status === 'SUBMITTED') {
    return [
      { label: 'Submitted (Pending Review)', disabled: true },
      { label: 'Withdraw Submission', action: handleWithdrawWork }
    ]
  }

  return []
}
```

### 2. Job Details Card (New Component)

**File:** `src/components/jobDetailsCard.tsx` (NEW)

**Location:** Rendered below task in `TaskGrid`, only when active job exists.

**Visibility:**
- Always show if user is participant (worker, owner, manager, reviewer)
- Show limited info if user is non-participant list member

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ 🔄 Job Status: IN_PROGRESS                              │
│ 👤 Worker: @username                                     │
│                                                          │
│ [Owner/Manager View]                                     │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📝 Worker's Notes:                                  │ │
│ │ "I implemented the feature using..."                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ 🔒 Visible only to participants                          │
│                                                          │
│ [Actions for Owner/Manager]                              │
│ [Approve] [Request Changes] [Reject]                     │
└─────────────────────────────────────────────────────────┘
```

**Props Interface:**
```typescript
interface JobDetailsCardProps {
  job: any
  task: any
  userRole: 'OWNER' | 'MANAGER' | 'COLLABORATOR' | 'FOLLOWER'
  isParticipant: boolean
  userId: string
  onApprove: () => Promise<void>
  onReject: () => Promise<void>
  onValidate: () => Promise<void>
  onWithdraw: () => Promise<void>
}
```

**Conditional Rendering:**
```typescript
if (!isParticipant) {
  // Limited view for non-participants
  return (
    <Card className="mt-2 border-l-4 border-blue-500">
      <CardContent className="py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Job Status: {job.status}
          </span>
          <span className="text-sm">
            Worker: @{job.worker.profiles[0]?.username}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// Full view for participants
return (
  <Card className="mt-2 border-l-4 border-blue-500">
    <CardContent className="py-4">
      {/* Job status badge */}
      <Badge variant={getJobStatusVariant(job.status)}>
        {job.status}
      </Badge>

      {/* Worker notes (if submitted) */}
      {job.requesterNotes && job.requesterNotes.length > 0 && (
        <div className="mt-3">
          <Label>Worker's Submission:</Label>
          {job.requesterNotes.map((note: any) => (
            <div key={note.id} className="text-sm mt-1 p-3 bg-muted rounded">
              <div dangerouslySetInnerHTML={{ __html: note.content }} />
              <div className="text-xs text-muted-foreground mt-2">
                {new Date(note.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Self-review score */}
      {job.selfReview !== null && (
        <div className="mt-3">
          <Label>Self-Review:</Label>
          <Progress value={job.selfReview} max={100} />
        </div>
      )}

      {/* Reviewer notes (if provided) */}
      {job.reviewersNotes && job.reviewersNotes.length > 0 && (
        <div className="mt-3">
          <Label>Reviewer's Feedback:</Label>
          {job.reviewersNotes.map((note: any) => (
            <div key={note.id} className="text-sm mt-1 p-3 bg-muted rounded">
              <div dangerouslySetInnerHTML={{ __html: note.content }} />
              <div className="text-xs text-muted-foreground mt-2">
                {note.user.profiles[0]?.username} • {new Date(note.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons based on role and status */}
      {renderActionButtons()}

      {/* Privacy indicator */}
      <div className="mt-3 flex items-center text-xs text-muted-foreground">
        <Lock className="w-3 h-3 mr-1" />
        Visible only to participants
      </div>
    </CardContent>
  </Card>
)
```

### 3. Job Submission Dialog (New Component)

**File:** `src/components/jobSubmissionDialog.tsx` (NEW)

**Triggered:** When user clicks "Submit for Review" in status menu.

**Form Fields:**
- **Solution Description** (rich text editor, required): Explanation of work done (creates a Note object)
- **Self-Review** (slider, optional): 0-100 rating of own work
- **Attachments** (optional): Upload files or link to existing notes/documents

**Note:** The solution description creates a Note object linked to the job, enabling:
- Rich text formatting (bold, italic, lists, links)
- File attachments
- Edit history
- Future commenting by reviewers

**Actions:**
- **Submit**: Update job status to SUBMITTED, save notes and self-review
- **Cancel**: Close dialog without changes

```tsx
<Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Submit Work for Review</DialogTitle>
      <DialogDescription>
        Describe your solution and submit for validation.
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-4">
      <div>
        <Label htmlFor="solution">Solution Description *</Label>
        {/* Use rich text editor like Lexical or Tiptap */}
        <RichTextEditor
          id="solution"
          value={noteContent}
          onChange={setNoteContent}
          placeholder="Explain what you did to complete this task..."
          minHeight={200}
          required
        />
        <p className="text-xs text-muted-foreground mt-1">
          Supports formatting, links, and attachments
        </p>
      </div>

      <div>
        <Label htmlFor="self-review">Self-Review (Optional)</Label>
        <Slider
          id="self-review"
          value={[selfReview]}
          onValueChange={([value]) => setSelfReview(value)}
          max={100}
          step={1}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Rate your work: {selfReview}/100
        </p>
      </div>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      <Button onClick={handleSubmit} disabled={!noteContent.trim()}>
        Submit for Review
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

{/* Handler example */}
<script>
const handleSubmit = async () => {
  await fetch(`/api/v1/jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'SUBMITTED',
      requesterNoteContent: noteContent, // API will create Note object
      selfReview: selfReview
    })
  })
  onRefresh()
}
</script>
```
  </DialogContent>
</Dialog>
```

### 4. Job Review Dialog (New Component)

**File:** `src/components/jobReviewDialog.tsx` (NEW)

**Triggered:** When owner/manager clicks "Accept", "Request Changes", or "Reject" in job details card.

**Form Fields:**
- **Review Feedback** (rich text editor, optional): Comments on the work (creates a Note object)
- **Manager Review** (slider, optional): 0-100 rating of work
- **Action**: Accept / Request Changes / Reject (radio or buttons)

**Note:** The review feedback creates a Note object linked to the job, enabling rich formatting and future reference.

```tsx
<Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Review Submitted Work</DialogTitle>
      <DialogDescription>
        Provide feedback and decide on next steps.
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-4">
      {/* Show worker's submission */}
      <div className="p-3 bg-muted rounded">
        <Label>Worker's Solution:</Label>
        {job.requesterNotes?.map((note: any) => (
          <div key={note.id} className="text-sm mt-1">
            <div dangerouslySetInnerHTML={{ __html: note.content }} />
          </div>
        ))}
      </div>

      <div>
        <Label htmlFor="feedback">Review Feedback (Optional)</Label>
        <RichTextEditor
          id="feedback"
          value={reviewNoteContent}
          onChange={setReviewNoteContent}
          placeholder="Provide feedback on the work..."
          minHeight={150}
        />
      </div>

      <div>
        <Label htmlFor="manager-review">Manager Review (Optional)</Label>
        <Slider
          id="manager-review"
          value={[managerReview]}
          onValueChange={([value]) => setManagerReview(value)}
          max={100}
          step={1}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Rate: {managerReview}/100
        </p>
      </div>

      <div>
        <Label>Action</Label>
        <RadioGroup value={action} onValueChange={setAction}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="accept" id="accept" />
            <Label htmlFor="accept">Accept (Mark task as Done)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="validate" id="validate" />
            <Label htmlFor="validate">Request Changes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="reject" id="reject" />
            <Label htmlFor="reject">Reject (Reopen task)</Label>
          </div>
        </RadioGroup>
      </div>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      <Button onClick={handleSubmitReview}>
        Submit Review
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

{/* Handler example */}
<script>
const handleSubmitReview = async () => {
  const statusMap = {
    accept: 'ACCEPTED',
    validate: 'VALIDATING',
    reject: 'REJECTED'
  }

  await fetch(`/api/v1/jobs/${job.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: statusMap[action],
      reviewerNoteContent: reviewNoteContent, // API will create Note object
      managerReview: managerReview
    })
  })
  onRefresh()
}
</script>
```

### 5. Task Grid Integration

**File:** `src/components/taskGrid.tsx`

**Changes:**
1. Import new components: `JobDetailsCard`, `JobSubmissionDialog`, `JobReviewDialog`
2. Fetch jobs for current list/date alongside tasks
3. For each task, check if active job exists
4. Render `<JobDetailsCard />` below `<TaskItem />` when job exists
5. Pass job handlers to dialogs

```tsx
export const TaskGrid = ({
  tasks,
  selectedTaskList,
  jobs = [],
  // ... other props
}: TaskGridProps) => {
  // ... existing code ...

  // Group jobs by taskId for easy lookup
  const jobsByTask = useMemo(() => {
    const map: Record<string, any> = {}
    jobs.forEach(job => {
      if (!map[job.taskId] || job.createdAt > map[job.taskId].createdAt) {
        map[job.taskId] = job
      }
    })
    return map
  }, [jobs])

  return (
    <div className="grid gap-4">
      {sortedTasks.map((task: any) => {
        const activeJob = jobsByTask[task.id]
        const isParticipant = checkIsParticipant(activeJob, userId)

        return (
          <div key={task.id}>
            <TaskItem
              task={task}
              // ... other props
            />

            {activeJob && (
              <JobDetailsCard
                job={activeJob}
                task={task}
                userRole={userRole}
                isParticipant={isParticipant}
                userId={userId}
                onApprove={() => handleApproveJob(activeJob.id)}
                onReject={() => handleRejectJob(activeJob.id)}
                onValidate={() => handleValidateJob(activeJob.id)}
                onWithdraw={() => handleWithdrawJob(activeJob.id)}
              />
            )}
          </div>
        )
      })}

      {/* Dialogs */}
      <JobSubmissionDialog
        open={isSubmitDialogOpen}
        onOpenChange={setIsSubmitDialogOpen}
        onSubmit={handleSubmitForReview}
      />

      <JobReviewDialog
        open={isReviewDialogOpen}
        onOpenChange={setIsReviewDialogOpen}
        job={selectedJobForReview}
        onReview={handleReviewSubmission}
      />
    </div>
  )
}
```

---

## Implementation Plan

### Phase 1: Schema & API Foundation (Week 1)

**Tasks:**
1. ✅ Update `JobStatus` enum to include `SUBMITTED`
2. ✅ Add `requesterNoteIds` relation to `Job` model (connect to Notes collection)
3. ✅ Run Prisma migration: `npx prisma db push`
4. ✅ Update `PUT /api/v1/jobs/[jobId]` with:
   - State transition validation
   - Authorization checks per status change
   - Task status sync logic
5. ✅ Update `GET /api/v1/jobs` with privacy filtering
6. ✅ Write API tests for new flows

**Files to Modify:**
- `prisma/schema.prisma`
- `src/app/api/v1/jobs/[jobId]/route.ts`
- `src/app/api/v1/jobs/route.ts`

**Acceptance Criteria:**
- Schema updated and deployed
- API endpoints handle all status transitions correctly
- Privacy filtering works for participants vs. non-participants
- Task status auto-updates when job status changes

---

### Phase 2: UI Components (Week 2)

**Tasks:**
1. ✅ Create or integrate a `RichTextEditor` component (Lexical, Tiptap, or similar)
2. ✅ Create `JobDetailsCard` component
3. ✅ Create `JobSubmissionDialog` component (with rich text support)
4. ✅ Create `JobReviewDialog` component (with rich text support)
5. ✅ Update `TaskGrid` to integrate new components
6. ✅ Implement role-based status menu options
7. ✅ Add job handlers (request, submit, approve, reject, validate, withdraw)
8. ✅ Add API handlers for creating Note objects during job updates

**Files to Create:**
- `src/components/jobDetailsCard.tsx`
- `src/components/jobSubmissionDialog.tsx`
- `src/components/jobReviewDialog.tsx`

**Files to Modify:**
- `src/components/taskGrid.tsx`
- `src/lib/hooks/useTaskHandlers.ts` (add job-related handlers)

**Acceptance Criteria:**
- Collaborators see review workflow options in task status menu
- Owners/Managers see job request cards below tasks
- Job submission dialog captures notes and self-review
- Job review dialog allows accept/reject/validate actions
- Privacy indicator shows for job details

---

### Phase 3: Notifications (Week 3)

**Tasks:**
1. ✅ Design notification payload structure
2. ✅ Implement notification creation on job status changes:
   - REQUESTED → notify owners/managers
   - IN_PROGRESS (approved) → notify worker
   - SUBMITTED → notify owners/managers
   - ACCEPTED/REJECTED → notify worker
3. ✅ Add notification display in UI (bell icon, toast, etc.)
4. ✅ Add notification preferences in settings

**Files to Create/Modify:**
- `src/lib/services/notification/notificationService.ts`
- `src/components/notificationBell.tsx`
- `src/app/api/v1/notifications/route.ts`

**Acceptance Criteria:**
- Users receive real-time notifications for job state changes
- Notifications link directly to relevant task/job
- Users can mark notifications as read
- Notification preferences are respected

---

### Phase 4: Polish & Testing (Week 4)

**Tasks:**
1. ✅ Add loading states and optimistic updates
2. ✅ Add error handling and user-friendly error messages
3. ✅ Implement keyboard navigation for dialogs
4. ✅ Add i18n translations for all new UI text
5. ✅ Write integration tests for full workflows
6. ✅ Perform user acceptance testing with stakeholders
7. ✅ Update documentation (CLAUDE.md, API docs)

**Acceptance Criteria:**
- All user flows work smoothly without bugs
- UI is accessible (keyboard nav, screen readers)
- All text is translatable
- Performance is acceptable (no lag on job updates)
- Documentation is complete

---

## Testing Strategy

### Unit Tests

1. **API Endpoint Tests** (`src/app/api/v1/jobs/[jobId]/route.test.ts`)
   - Test each status transition
   - Test authorization for each role
   - Test privacy filtering
   - Test task status sync

2. **Component Tests**
   - `JobDetailsCard`: Render different states, participant vs. non-participant
   - `JobSubmissionDialog`: Form validation, submission
   - `JobReviewDialog`: Action selection, feedback submission

### Integration Tests

1. **End-to-End Workflow Test**
   - Collaborator requests to work → Job created (REQUESTED)
   - Owner approves → Job status = IN_PROGRESS
   - Collaborator submits → Job status = SUBMITTED, Task status = READY
   - Owner reviews and accepts → Job status = ACCEPTED, Task status = DONE
   - (Alternative) Owner reviews and rejects → Job status = REJECTED, Task status = OPEN

2. **Privacy Test**
   - Non-participant can see job status but not notes
   - Participant can see full job details

3. **Authorization Test**
   - Collaborator cannot approve own request
   - Non-owner cannot review job
   - Worker can withdraw own submission

### Manual Testing Checklist

- [ ] Request to work on task as collaborator
- [ ] Approve request as owner
- [ ] Reject request as owner
- [ ] Submit work with notes and self-review
- [ ] Withdraw submission before review
- [ ] Review and accept submission as owner
- [ ] Review and request changes as owner
- [ ] Review and reject submission as owner
- [ ] Verify task status updates correctly
- [ ] Verify privacy controls work
- [ ] Test on mobile devices
- [ ] Test with keyboard navigation
- [ ] Test with screen reader

---

## Security & Privacy Considerations

### Authorization Rules

1. **Job Creation**:
   - Only list members with role OWNER, MANAGER, or COLLABORATOR can create jobs
   - COLLABORATOR can only create jobs for themselves

2. **Job Updates**:
   - Only authorized roles can perform specific state transitions (see authorization matrix)
   - Worker can only update their own jobs (submit, withdraw)
   - Owner/Manager/Reviewers can update jobs they oversee

3. **Job Viewing**:
   - All list members can see job status and worker (public info)
   - Only participants can see notes, reviews, earnings (private info)

### Privacy Controls

1. **Job Details**:
   - `requesterNotes` (Note objects): Visibility controlled by Note.visibility field (set to PRIVATE for job notes)
   - `reviewersNotes` (Note objects): Visibility controlled by Note.visibility field (set to PRIVATE)
   - `selfReview`, `peerReview`, `managerReview`: Visible only to participants
   - `earnings`, `prize`, `profit`: Visible only to participants

   **Note Visibility Strategy:**
   - All job-related notes should be created with `visibility: 'PRIVATE'`
   - Additional access control via job participant check (worker, owner, managers, reviewers)
   - Notes can be independently shared later if needed (via note's own visibility settings)

2. **Visibility Toggle**:
   - Explicit indicator in UI when viewing private information
   - Non-participants see limited card with message: "Full details visible only to participants"

### Data Validation

1. **Input Sanitization**:
   - Sanitize `requesterNotes` and `reviewerNotes` to prevent XSS
   - Validate status transitions server-side

2. **Rate Limiting**:
   - Implement rate limiting on job status changes to prevent abuse

---

## Success Metrics

### Quantitative Metrics

1. **Adoption Rate**:
   - % of multi-collaborator lists using job review system
   - Target: 60% within 1 month of launch

2. **Workflow Completion Rate**:
   - % of REQUESTED jobs that reach ACCEPTED or REJECTED
   - Target: 80%

3. **Approval Time**:
   - Average time from SUBMITTED to ACCEPTED/REJECTED
   - Target: < 24 hours

4. **Job Rejection Rate**:
   - % of jobs rejected vs. accepted
   - Baseline: Track for insights

### Qualitative Metrics

1. **User Satisfaction**:
   - Survey collaborators and owners on workflow usability
   - Target: 4/5 average rating

2. **Bug Reports**:
   - Track issues related to job review system
   - Target: < 5 critical bugs in first month

---

## Open Questions & Future Enhancements

### Open Questions (To Be Resolved)

1. **Q1:** Should we allow multiple collaborators to request the same task?
   - **A:** TBD - likely yes, with owner choosing one

2. **Q2:** What happens if a worker abandons a job in IN_PROGRESS?
   - **A:** Owner can manually reject or reassign

3. **Q3:** Should there be a deadline for job completion?
   - **A:** Future enhancement - add `dueDate` field

### Rich Text Editor Choice

For `requesterNotes` and `reviewersNotes`, we need a rich text editor component. Options:

1. **Lexical (Recommended)**:
   - Meta's modern editor framework
   - Excellent React support
   - Already used in Payload CMS (`@payloadcms/richtext-lexical`)
   - Consistent with existing CMS content

2. **Tiptap**:
   - ProseMirror-based
   - Great DX and flexibility
   - Large ecosystem of extensions

3. **Slate**:
   - Fully customizable
   - React-first architecture
   - More manual configuration needed

**Recommendation:** Use Lexical since Payload CMS already includes it, ensuring consistency across the platform.

### Future Enhancements

1. **Peer Review**:
   - Allow other collaborators to review work (not just owner/manager)
   - Use `peerReview` field and `reviewers` relation

2. **Job Templates**:
   - Pre-defined review checklists for certain task types

3. **Job History**:
   - Track all state changes with timestamps and actors

4. **Batch Operations**:
   - Approve/reject multiple jobs at once

5. **Job Analytics**:
   - Dashboard showing job completion rates, average review times, etc.

6. **Note Attachments**:
   - Allow workers to attach screenshots, files, or documents to submission notes
   - Leverage existing Note.documents relation
   - Enable reviewers to request specific files

7. **Note Editing**:
   - Allow workers to edit submission notes before final review
   - Track edit history on Note objects
   - Notify reviewers of updates

---

## Appendix

### Related Files Reference

**Schema:**
- `prisma/schema.prisma` (Job, List, Task models)

**API Routes:**
- `src/app/api/v1/jobs/route.ts` (GET, POST)
- `src/app/api/v1/jobs/[jobId]/route.ts` (PUT, DELETE)
- `src/app/api/v1/tasks/[taskId]/route.ts` (Task updates)

**Components:**
- `src/components/taskGrid.tsx` (Main task display)
- `src/components/taskItem.tsx` (Individual task)
- `src/components/optionsButton.tsx` (Status menu)

**Hooks:**
- `src/lib/hooks/useTaskHandlers.ts` (Task/Job actions)
- `src/lib/hooks/useOptimisticUpdates.ts` (Optimistic UI)

**Services:**
- `src/lib/services/job/earningsService.ts` (Job earnings calculation)
- `src/lib/services/task/index.ts` (Task updates)

**Views:**
- `src/views/listView.tsx` (List display)
- `src/views/doView.tsx` (Main Do module view)

---

**End of Plan**

This plan provides a comprehensive roadmap for implementing the Job Review System. Each phase builds on the previous, ensuring a stable and testable implementation. The plan prioritizes backend stability (Phase 1) before UI development (Phase 2), followed by user experience enhancements (Phase 3-4).
