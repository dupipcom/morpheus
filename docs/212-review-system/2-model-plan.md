# Model Layer: Database Schema & Data Model

**Part of Epic #212: Job Review System**
**Related:** `1-overall-plan.md`

---

## Overview

This document covers all database schema changes, data model updates, and Prisma migrations required for the Job Review System.

---

## Schema Changes Required

### 1. Update JobStatus Enum

**File:** `prisma/schema.prisma`

**Current State:**
```prisma
enum JobStatus {
  REQUESTED
  IN_PROGRESS
  VALIDATING
  ACCEPTED
  REJECTED
}
```

**Required Change:**
Add `SUBMITTED` status between `IN_PROGRESS` and `VALIDATING`:

```prisma
enum JobStatus {
  REQUESTED      // Worker requested to work on task
  IN_PROGRESS    // Owner approved, worker is working
  SUBMITTED      // NEW: Worker submitted work for review
  VALIDATING     // Owner requested changes
  ACCEPTED       // Owner accepted work (task complete)
  REJECTED       // Owner rejected work (task reopened)
}
```

**Rationale:**
- `SUBMITTED` represents work completed by worker, awaiting review
- Distinct from `VALIDATING` which means changes requested
- Clear state progression: IN_PROGRESS → SUBMITTED → (ACCEPTED|REJECTED|VALIDATING)

---

### 2. Add requesterNotes Relation to Job Model

**File:** `prisma/schema.prisma`

**Current State:**
```prisma
model Job {
  id               String    @id @default(auto()) @map("_id") @db.ObjectId
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  status           JobStatus @default(REQUESTED)
  occurrenceDate   String?
  selfReview       Float?
  peerReview       Float?
  managerReview    Float?
  earnings         Float?
  prize            Float?
  profit           Float?

  workerId         String    @db.ObjectId
  worker           User      @relation("JobWorker", fields: [workerId], references: [id], onDelete: Cascade)
  taskId           String    @db.ObjectId
  task             Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  listId           String    @db.ObjectId
  list             List      @relation(fields: [listId], references: [id], onDelete: Cascade)
  reviewerIds      String[]  @default([]) @db.ObjectId
  reviewers        User[]    @relation("JobReviewers", fields: [reviewerIds], references: [id])
  reviewersNoteIds String[]  @default([]) @db.ObjectId
  reviewersNotes   Note[]    @relation("JobReviewersNotes", fields: [reviewersNoteIds], references: [id])

  @@index([workerId])
  @@index([taskId])
  @@index([listId])
}
```

**Required Change:**
Add `requesterNoteIds` and `requesterNotes` relation:

```prisma
model Job {
  // ... existing fields ...

  // NEW: Worker's submission notes
  requesterNoteIds String[]  @default([]) @db.ObjectId
  requesterNotes   Note[]    @relation("JobRequesterNotes", fields: [requesterNoteIds], references: [id])

  // Existing reviewer notes (already in schema)
  reviewerIds      String[]  @default([]) @db.ObjectId
  reviewers        User[]    @relation("JobReviewers", fields: [reviewerIds], references: [id])
  reviewersNoteIds String[]  @default([]) @db.ObjectId
  reviewersNotes   Note[]    @relation("JobReviewersNotes", fields: [reviewersNoteIds], references: [id])

  // ... rest of model ...
}
```

**Benefits of Note Relations:**
- ✅ Rich text formatting (bold, italic, lists, links)
- ✅ File attachments via Note.documents relation
- ✅ Edit history tracking
- ✅ Existing visibility controls (Note.visibility)
- ✅ Can be commented on by reviewers
- ✅ Reusable across platform

---

### 3. Verify Note Model Support

**File:** `prisma/schema.prisma`

Ensure the `Note` model has required fields for job workflow:

```prisma
model Note {
  id          String         @id @default(auto()) @map("_id") @db.ObjectId
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  content     String         // Rich text content (HTML or Lexical JSON)
  visibility  NoteVisibility @default(PRIVATE)

  // User relation
  userId      String         @db.ObjectId
  user        User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Document attachments
  documentIds String[]       @default([]) @db.ObjectId
  documents   Document[]     @relation(fields: [documentIds], references: [id])

  // Metadata for job context
  metadata    Json?          // { jobId: string, type: 'job_submission' | 'job_review' }

  // ... other fields ...
}
```

**Note Visibility Strategy:**
- All job-related notes: `visibility: 'PRIVATE'`
- Access controlled via job participant check
- Prevents accidental public exposure of work details

---

## Data Model Relationships

### Entity Relationship Diagram

```
User (Worker)
    ↓ 1:many
  Job ←→ Task (1:1 for given occurrence)
    ↓ 1:many
  List
    ↓ many:many
 User (Owners/Managers/Collaborators)

Job → requesterNotes (1:many) → Note
Job → reviewersNotes (1:many) → Note
```

### Job Lifecycle States

```
┌─────────────┐
│  REQUESTED  │  Created when worker requests to work
└──────┬──────┘
       │ (Owner/Manager approves)
       ↓
┌─────────────┐
│ IN_PROGRESS │  Worker is actively working
└──────┬──────┘
       │ (Worker submits with requesterNotes)
       ↓
┌─────────────┐
│  SUBMITTED  │  Awaiting owner/manager review
└──────┬──────┘
       │
       ├─→ VALIDATING (changes requested) → back to IN_PROGRESS
       ├─→ ACCEPTED (approved) → Task.status = DONE
       └─→ REJECTED (rejected) → Task.status = OPEN
```

### Task-Job Status Synchronization

| Job Status    | Task Status     | Trigger                          |
|---------------|-----------------|----------------------------------|
| REQUESTED     | OPEN/existing   | No change until approved         |
| IN_PROGRESS   | IN_PROGRESS     | Owner approves request           |
| SUBMITTED     | READY           | Worker submits work              |
| VALIDATING    | IN_PROGRESS     | Owner requests changes           |
| ACCEPTED      | DONE            | Owner accepts work               |
| REJECTED      | OPEN            | Owner rejects (task reopened)    |

---

## Migration Strategy

### Step 1: Schema Update

```bash
# 1. Update prisma/schema.prisma with changes above
# 2. Generate Prisma client
npx prisma generate

# 3. Push changes to MongoDB
npx prisma db push
```

**Expected Output:**
```
✔ Generated Prisma Client to ./generated/prisma
⚠ We found changes that cannot be executed:
  • Added enum value 'SUBMITTED' to enum 'JobStatus'
  • Added field 'requesterNoteIds' to model 'Job'
  • Added relation 'JobRequesterNotes'
✔ Database synchronized with Prisma schema
```

### Step 2: Backward Compatibility

**Handling Existing Jobs:**
- Existing jobs without `SUBMITTED` state are unaffected
- `requesterNoteIds` defaults to empty array `[]`
- No data migration needed for existing records

**Validation:**
```typescript
// Check if any jobs are in invalid states after migration
const invalidJobs = await prisma.job.findMany({
  where: {
    status: { notIn: ['REQUESTED', 'IN_PROGRESS', 'SUBMITTED', 'VALIDATING', 'ACCEPTED', 'REJECTED'] }
  }
})

if (invalidJobs.length > 0) {
  console.warn('Found jobs with invalid status:', invalidJobs)
}
```

### Step 3: Verify Relations

```typescript
// Test creating a job with requester notes
const testJob = await prisma.job.create({
  data: {
    workerId: userId,
    taskId: taskId,
    listId: listId,
    status: 'REQUESTED'
  },
  include: {
    requesterNotes: true,
    reviewersNotes: true
  }
})

console.log('Job created successfully with note relations:', testJob)
```

---

## Data Integrity Rules

### 1. Status Transition Validation

Only certain status transitions are allowed:

| From          | To              | Who Can Transition                |
|---------------|-----------------|-----------------------------------|
| REQUESTED     | IN_PROGRESS     | OWNER, MANAGER                    |
| REQUESTED     | REJECTED        | OWNER, MANAGER                    |
| IN_PROGRESS   | SUBMITTED       | Worker (job.workerId)             |
| SUBMITTED     | IN_PROGRESS     | Worker (withdrawal)               |
| SUBMITTED     | VALIDATING      | OWNER, MANAGER, Reviewers         |
| SUBMITTED     | ACCEPTED        | OWNER, MANAGER, Reviewers         |
| SUBMITTED     | REJECTED        | OWNER, MANAGER, Reviewers         |
| VALIDATING    | IN_PROGRESS     | Worker                            |

**Implementation:** Enforce in API controller (see `4-controller-plan.md`)

### 2. Required Fields by Status

| Status        | Required Fields                          |
|---------------|------------------------------------------|
| REQUESTED     | workerId, taskId, listId                 |
| IN_PROGRESS   | (same as REQUESTED)                      |
| SUBMITTED     | requesterNoteIds (at least 1 note)       |
| VALIDATING    | reviewersNoteIds (at least 1 note)       |
| ACCEPTED      | (optional: managerReview)                |
| REJECTED      | (optional: reviewersNoteIds)             |

### 3. Cascade Deletion Rules

Defined in Prisma schema:

```prisma
model Job {
  worker  User  @relation("JobWorker", fields: [workerId], references: [id], onDelete: Cascade)
  task    Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
  list    List  @relation(fields: [listId], references: [id], onDelete: Cascade)
  // If worker/task/list deleted, job is also deleted
}
```

**Note Deletion:**
- When Job is deleted, associated Notes should **NOT** be auto-deleted
- Notes are independent entities that may be referenced elsewhere
- Consider soft-delete pattern for Notes (add `deletedAt` field)

---

## Privacy & Access Control

### Note Visibility Settings

When creating job-related notes:

```typescript
// Worker submission note
const requesterNote = await prisma.note.create({
  data: {
    content: submissionContent,
    userId: workerId,
    visibility: 'PRIVATE', // ← Always PRIVATE for job notes
    metadata: {
      jobId: job.id,
      type: 'job_submission'
    }
  }
})

// Reviewer feedback note
const reviewerNote = await prisma.note.create({
  data: {
    content: feedbackContent,
    userId: reviewerId,
    visibility: 'PRIVATE', // ← Always PRIVATE
    metadata: {
      jobId: job.id,
      type: 'job_review'
    }
  }
})
```

### Access Control Logic

**Job Participants:**
- Worker (job.workerId)
- List owners/managers (list.users where role = OWNER or MANAGER)
- Explicit reviewers (job.reviewerIds)

**Access Levels:**

| User Type      | Can View                              | Can Edit                     |
|----------------|---------------------------------------|------------------------------|
| Worker         | Own job details + all notes           | Job status (limited states)  |
| Owner/Manager  | All job details + all notes           | Job status (all transitions) |
| Reviewer       | All job details + all notes           | Add review notes             |
| Other Member   | Job status, worker name only          | None                         |
| Non-Member     | None                                  | None                         |

---

## Testing Requirements

### Unit Tests

**File:** `prisma/schema.test.ts` (new)

```typescript
import { PrismaClient } from '@/generated/prisma'

describe('Job Model', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('creates job with SUBMITTED status', async () => {
    const job = await prisma.job.create({
      data: {
        workerId: testWorkerId,
        taskId: testTaskId,
        listId: testListId,
        status: 'SUBMITTED'
      }
    })
    expect(job.status).toBe('SUBMITTED')
  })

  test('links requester notes to job', async () => {
    const note = await prisma.note.create({
      data: {
        content: 'Test submission',
        userId: testWorkerId,
        visibility: 'PRIVATE'
      }
    })

    const job = await prisma.job.update({
      where: { id: testJobId },
      data: {
        requesterNoteIds: { push: note.id }
      },
      include: { requesterNotes: true }
    })

    expect(job.requesterNotes).toHaveLength(1)
    expect(job.requesterNotes[0].content).toBe('Test submission')
  })

  test('validates job status enum', async () => {
    await expect(
      prisma.job.create({
        data: {
          workerId: testWorkerId,
          taskId: testTaskId,
          listId: testListId,
          status: 'INVALID_STATUS' as any
        }
      })
    ).rejects.toThrow()
  })
})
```

### Integration Tests

**File:** `tests/integration/job-workflow.test.ts` (new)

```typescript
describe('Job Review Workflow', () => {
  test('complete workflow: request → approve → submit → accept', async () => {
    // 1. Create job (REQUESTED)
    const job = await createJob({ status: 'REQUESTED' })
    expect(job.status).toBe('REQUESTED')

    // 2. Approve (IN_PROGRESS)
    await updateJobStatus(job.id, 'IN_PROGRESS', { role: 'OWNER' })
    const updated1 = await prisma.job.findUnique({ where: { id: job.id } })
    expect(updated1?.status).toBe('IN_PROGRESS')

    // 3. Submit with notes (SUBMITTED)
    const note = await createNote({ content: 'Work done', userId: job.workerId })
    await updateJobWithNotes(job.id, 'SUBMITTED', { noteIds: [note.id] })
    const updated2 = await prisma.job.findUnique({
      where: { id: job.id },
      include: { requesterNotes: true, task: true }
    })
    expect(updated2?.status).toBe('SUBMITTED')
    expect(updated2?.task.status).toBe('READY')

    // 4. Accept (ACCEPTED)
    await updateJobStatus(job.id, 'ACCEPTED', { role: 'OWNER' })
    const updated3 = await prisma.job.findUnique({
      where: { id: job.id },
      include: { task: true }
    })
    expect(updated3?.status).toBe('ACCEPTED')
    expect(updated3?.task.status).toBe('DONE')
  })

  test('rejection flow: submit → reject → task reopened', async () => {
    // Setup job in SUBMITTED state
    const job = await createSubmittedJob()

    // Reject
    await updateJobStatus(job.id, 'REJECTED', { role: 'OWNER' })

    // Verify task is reopened
    const task = await prisma.task.findUnique({ where: { id: job.taskId } })
    expect(task?.status).toBe('OPEN')
  })
})
```

---

## Claude Implementation Guide

### Using Claude Code for Schema Updates

#### Step 1: Review Current Schema

```bash
# Ask Claude to analyze current schema
claude "Show me the current Job model in prisma/schema.prisma"
```

#### Step 2: Apply Changes

```bash
# Ask Claude to update the schema
claude "Add SUBMITTED to JobStatus enum and add requesterNoteIds relation to Job model as specified in docs/212-review-system/2-model-plan.md"
```

#### Step 3: Generate and Push

```bash
# Run Prisma commands
npx prisma generate
npx prisma db push
```

#### Step 4: Verify Changes

```bash
# Ask Claude to verify the changes
claude "Verify that the Job model has requesterNoteIds and the SUBMITTED status is in JobStatus enum"
```

### Automated Testing with Claude

```bash
# Generate test file
claude "Create unit tests for the Job model covering all status transitions and note relations based on 2-model-plan.md"

# Run tests
npm test prisma/schema.test.ts
```

---

## Acceptance Criteria

- [ ] `JobStatus` enum includes `SUBMITTED` status
- [ ] `Job` model has `requesterNoteIds` and `requesterNotes` relation
- [ ] Migration completes without errors
- [ ] Existing jobs are unaffected by migration
- [ ] All status transitions are valid according to state machine
- [ ] Note relations work correctly (can create and query)
- [ ] Cascade deletions work as expected
- [ ] Unit tests pass for Job model
- [ ] Integration tests pass for job workflow
- [ ] Documentation is complete and accurate

---

## Next Steps

After completing model layer:
1. Review `3-view-plan.md` for UI component implementation
2. Review `4-controller-plan.md` for API endpoint updates
3. Implement controller layer to enforce status transitions
4. Build UI components that interact with new schema

---

**Last Updated:** 2026-01-21
**Status:** Ready for Implementation
