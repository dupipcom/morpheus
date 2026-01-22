# Controller Layer: API Routes & Business Logic

**Part of Epic #212: Job Review System**
**Related:** `1-overall-plan.md`, `2-model-plan.md`, `3-view-plan.md`

---

## Overview

This document covers all API endpoint modifications, business logic, authorization rules, and state transition handling for the Job Review System.

---

## API Endpoints

### Existing Endpoints to Modify

1. **PUT `/api/v1/jobs/[jobId]`** - Update job status and add notes
2. **GET `/api/v1/jobs`** - Fetch jobs with privacy filtering

### No New Endpoints Required

The existing job API structure supports all required operations. We only need to enhance PUT logic.

---

## PUT /api/v1/jobs/[jobId] - Enhanced

**File:** `src/app/api/v1/jobs/[jobId]/route.ts`

### Current State

```typescript
// Existing endpoint handles basic status updates
export async function PUT(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  // Basic auth and status update
}
```

### Enhanced Implementation

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

// Valid status transitions
const STATUS_TRANSITIONS: Record<string, { to: string[]; roles: string[] }> = {
  REQUESTED: {
    to: ['IN_PROGRESS', 'REJECTED'],
    roles: ['OWNER', 'MANAGER'],
  },
  IN_PROGRESS: {
    to: ['SUBMITTED'],
    roles: ['WORKER'], // Special: only the worker
  },
  SUBMITTED: {
    to: ['IN_PROGRESS', 'VALIDATING', 'ACCEPTED', 'REJECTED'],
    roles: ['WORKER', 'OWNER', 'MANAGER', 'REVIEWER'],
  },
  VALIDATING: {
    to: ['IN_PROGRESS'],
    roles: ['WORKER'],
  },
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    // 1. Authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 2. Validate job exists
    const job = await prisma.job.findUnique({
      where: { id: params.jobId },
      include: {
        task: { select: { id: true, status: true, listId: true } },
        list: { select: { id: true, users: true } },
        worker: { select: { id: true } },
        requesterNotes: true,
        reviewersNotes: true,
      }
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // 3. Parse request body
    const body = await request.json()
    const {
      status: newStatus,
      requesterNoteContent,
      reviewerNoteContent,
      selfReview,
      managerReview,
    } = body

    // 4. Validate status transition
    if (newStatus && newStatus !== job.status) {
      const allowedTransitions = STATUS_TRANSITIONS[job.status]

      if (!allowedTransitions) {
        return NextResponse.json(
          { error: `Invalid current status: ${job.status}` },
          { status: 400 }
        )
      }

      if (!allowedTransitions.to.includes(newStatus)) {
        return NextResponse.json(
          { error: `Cannot transition from ${job.status} to ${newStatus}` },
          { status: 400 }
        )
      }

      // 5. Authorization check based on transition
      const userRole = job.list.users.find((u: any) => u.userId === user.id)?.role
      const isWorker = job.workerId === user.id
      const isReviewer = job.reviewerIds?.includes(user.id)

      let authorized = false

      if (allowedTransitions.roles.includes('WORKER') && newStatus === 'SUBMITTED') {
        // Only worker can submit
        authorized = isWorker
      } else if (allowedTransitions.roles.includes('WORKER') && newStatus === 'IN_PROGRESS') {
        // Worker withdrawing submission or resubmitting after validation
        authorized = isWorker
      } else if (allowedTransitions.roles.includes('OWNER') || allowedTransitions.roles.includes('MANAGER')) {
        // Owner/Manager actions
        authorized = userRole && ['OWNER', 'MANAGER'].includes(userRole)
      } else if (allowedTransitions.roles.includes('REVIEWER')) {
        // Reviewer actions (if needed in future)
        authorized = isReviewer || (userRole && ['OWNER', 'MANAGER'].includes(userRole))
      }

      if (!authorized) {
        return NextResponse.json(
          { error: 'You are not authorized to perform this transition' },
          { status: 403 }
        )
      }
    }

    // 6. Create requester note if provided
    let newRequesterNoteId: string | null = null
    if (requesterNoteContent && requesterNoteContent.trim()) {
      const requesterNote = await prisma.note.create({
        data: {
          content: requesterNoteContent,
          userId: job.workerId,
          visibility: 'PRIVATE',
          metadata: {
            jobId: job.id,
            type: 'job_submission',
            taskId: job.taskId,
            listId: job.listId,
          }
        }
      })
      newRequesterNoteId = requesterNote.id
    }

    // 7. Create reviewer note if provided
    let newReviewerNoteId: string | null = null
    if (reviewerNoteContent && reviewerNoteContent.trim()) {
      const reviewerNote = await prisma.note.create({
        data: {
          content: reviewerNoteContent,
          userId: user.id,
          visibility: 'PRIVATE',
          metadata: {
            jobId: job.id,
            type: 'job_review',
            taskId: job.taskId,
            listId: job.listId,
          }
        }
      })
      newReviewerNoteId = reviewerNote.id
    }

    // 8. Update job with transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Update job
      const updatedJob = await tx.job.update({
        where: { id: params.jobId },
        data: {
          ...(newStatus && { status: newStatus }),
          ...(selfReview !== undefined && { selfReview }),
          ...(managerReview !== undefined && { managerReview }),
          ...(newRequesterNoteId && {
            requesterNoteIds: {
              push: newRequesterNoteId
            }
          }),
          ...(newReviewerNoteId && {
            reviewersNoteIds: {
              push: newReviewerNoteId
            }
          }),
        },
        include: {
          task: true,
          requesterNotes: true,
          reviewersNotes: {
            include: {
              user: { select: { id: true, profiles: true } }
            }
          },
          worker: {
            select: { id: true, userId: true, profiles: true }
          },
        }
      })

      // 9. Sync task status based on job status
      let taskUpdate: any = null
      if (newStatus) {
        const taskStatusMap: Record<string, string> = {
          IN_PROGRESS: 'IN_PROGRESS',
          SUBMITTED: 'READY',
          ACCEPTED: 'DONE',
          REJECTED: 'OPEN',
          VALIDATING: 'IN_PROGRESS',
        }

        const newTaskStatus = taskStatusMap[newStatus]
        if (newTaskStatus) {
          taskUpdate = await tx.task.update({
            where: { id: job.taskId },
            data: { status: newTaskStatus }
          })
        }
      }

      return { job: updatedJob, task: taskUpdate }
    })

    // 10. Handle accepted jobs (earnings calculation)
    if (newStatus === 'ACCEPTED') {
      try {
        const { calculateAndApplyJobEarnings } = await import('@/lib/services/job/earningsService')
        await calculateAndApplyJobEarnings({
          jobId: result.job.id,
          taskId: result.job.taskId,
          listId: result.job.listId,
          workerId: result.job.workerId,
          occurrenceDate: result.job.occurrenceDate || undefined,
        })
      } catch (earningsError) {
        console.error('Error calculating job earnings:', earningsError)
        // Don't fail the entire request
      }
    }

    // 11. TODO: Send notifications (Phase 3)
    // await notifyJobStatusChange(result.job, job.status, newStatus)

    return NextResponse.json({
      job: result.job,
      task: result.task,
    })

  } catch (error) {
    console.error('Error updating job:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## GET /api/v1/jobs - Enhanced Privacy

**File:** `src/app/api/v1/jobs/route.ts`

### Enhanced Implementation

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

const JOB_INCLUDE = {
  task: { select: { id: true, name: true, area: true, categories: true, status: true } },
  list: { select: { id: true, name: true, users: true } },
  worker: {
    select: { id: true, userId: true, profiles: { select: { username: true, data: true } } }
  },
  reviewers: {
    select: { id: true, userId: true, profiles: { select: { username: true, data: true } } }
  },
  requesterNotes: {
    include: {
      user: { select: { id: true, profiles: true } }
    }
  },
  reviewersNotes: {
    include: {
      user: { select: { id: true, profiles: true } }
    }
  }
} as const

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)

    // Build where clause
    const where: any = {}
    if (searchParams.get('listId')) where.listId = searchParams.get('listId')
    if (searchParams.get('taskId')) where.taskId = searchParams.get('taskId')
    if (searchParams.get('workerId')) where.workerId = searchParams.get('workerId')
    if (searchParams.get('status')) where.status = searchParams.get('status')
    if (searchParams.get('date')) where.occurrenceDate = searchParams.get('date')

    // Fetch jobs
    const jobs = await prisma.job.findMany({
      where,
      include: JOB_INCLUDE,
      orderBy: { createdAt: 'desc' }
    })

    // Filter and format based on access level
    const processedJobs = jobs.map((job: any) => {
      // Check if user is participant
      const isWorker = job.workerId === user.id
      const isListMember = job.list?.users?.some((u: any) => u.userId === user.id)
      const isOwnerOrManager = job.list?.users?.some(
        (u: any) => u.userId === user.id && ['OWNER', 'MANAGER'].includes(u.role)
      )
      const isReviewer = job.reviewerIds?.includes(user.id)

      const isParticipant = isWorker || isOwnerOrManager || isReviewer

      if (!isListMember) {
        // No access if not a list member
        return null
      }

      if (!isParticipant) {
        // Limited access for non-participants
        return {
          id: job.id,
          status: job.status,
          workerId: job.workerId,
          worker: {
            profiles: job.worker.profiles
          },
          taskId: job.taskId,
          occurrenceDate: job.occurrenceDate,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        }
      }

      // Full access for participants
      return job
    }).filter(Boolean) // Remove null entries

    return NextResponse.json({ jobs: processedJobs })

  } catch (error) {
    console.error('Error fetching jobs:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## Business Logic Helpers

### Status Transition Validator

**File:** `src/lib/services/job/statusValidator.ts` (NEW)

```typescript
export interface StatusTransitionRule {
  to: string[]
  roles: string[]
  requiresNote?: boolean
}

export const STATUS_TRANSITIONS: Record<string, StatusTransitionRule> = {
  REQUESTED: {
    to: ['IN_PROGRESS', 'REJECTED'],
    roles: ['OWNER', 'MANAGER'],
  },
  IN_PROGRESS: {
    to: ['SUBMITTED'],
    roles: ['WORKER'],
    requiresNote: true, // Submission must have note
  },
  SUBMITTED: {
    to: ['IN_PROGRESS', 'VALIDATING', 'ACCEPTED', 'REJECTED'],
    roles: ['WORKER', 'OWNER', 'MANAGER', 'REVIEWER'],
  },
  VALIDATING: {
    to: ['IN_PROGRESS', 'SUBMITTED'],
    roles: ['WORKER'],
  },
  ACCEPTED: {
    to: [], // Terminal state
    roles: [],
  },
  REJECTED: {
    to: [], // Terminal state
    roles: [],
  },
}

export function validateStatusTransition(
  currentStatus: string,
  newStatus: string
): { valid: boolean; error?: string } {
  const rule = STATUS_TRANSITIONS[currentStatus]

  if (!rule) {
    return { valid: false, error: `Unknown current status: ${currentStatus}` }
  }

  if (!rule.to.includes(newStatus)) {
    return {
      valid: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${rule.to.join(', ')}`
    }
  }

  return { valid: true }
}

export function isAuthorizedForTransition(
  currentStatus: string,
  newStatus: string,
  context: {
    userRole?: string
    isWorker: boolean
    isReviewer: boolean
  }
): { authorized: boolean; error?: string } {
  const rule = STATUS_TRANSITIONS[currentStatus]

  if (!rule) {
    return { authorized: false, error: 'Invalid status' }
  }

  const { userRole, isWorker, isReviewer } = context

  // Check worker-only transitions
  if (rule.roles.includes('WORKER')) {
    if (
      (newStatus === 'SUBMITTED' || newStatus === 'IN_PROGRESS') &&
      isWorker
    ) {
      return { authorized: true }
    }
  }

  // Check owner/manager transitions
  if (rule.roles.includes('OWNER') || rule.roles.includes('MANAGER')) {
    if (userRole && ['OWNER', 'MANAGER'].includes(userRole)) {
      return { authorized: true }
    }
  }

  // Check reviewer transitions
  if (rule.roles.includes('REVIEWER')) {
    if (isReviewer || (userRole && ['OWNER', 'MANAGER'].includes(userRole))) {
      return { authorized: true }
    }
  }

  return {
    authorized: false,
    error: `You are not authorized to transition from ${currentStatus} to ${newStatus}`
  }
}
```

---

### Task Status Sync

**File:** `src/lib/services/job/taskSync.ts` (NEW)

```typescript
import prisma from '@/lib/prisma'

export const TASK_STATUS_MAP: Record<string, string> = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'READY',
  VALIDATING: 'IN_PROGRESS',
  ACCEPTED: 'DONE',
  REJECTED: 'OPEN',
}

export async function syncTaskStatus(
  taskId: string,
  jobStatus: string
): Promise<{ success: boolean; newTaskStatus?: string }> {
  const newTaskStatus = TASK_STATUS_MAP[jobStatus]

  if (!newTaskStatus) {
    return { success: false }
  }

  try {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: newTaskStatus }
    })

    return { success: true, newTaskStatus }
  } catch (error) {
    console.error('Error syncing task status:', error)
    return { success: false }
  }
}
```

---

### Note Creation Helper

**File:** `src/lib/services/job/noteHelper.ts` (NEW)

```typescript
import prisma from '@/lib/prisma'

export interface CreateJobNoteParams {
  content: string
  userId: string
  jobId: string
  taskId: string
  listId: string
  type: 'job_submission' | 'job_review'
}

export async function createJobNote(
  params: CreateJobNoteParams
): Promise<{ success: boolean; noteId?: string; error?: string }> {
  const { content, userId, jobId, taskId, listId, type } = params

  if (!content.trim()) {
    return { success: false, error: 'Note content is required' }
  }

  try {
    const note = await prisma.note.create({
      data: {
        content,
        userId,
        visibility: 'PRIVATE',
        metadata: {
          jobId,
          taskId,
          listId,
          type,
        }
      }
    })

    return { success: true, noteId: note.id }
  } catch (error) {
    console.error('Error creating job note:', error)
    return { success: false, error: 'Failed to create note' }
  }
}
```

---

## Error Handling

### Standard Error Responses

```typescript
// 400 Bad Request
return NextResponse.json(
  { error: 'Invalid request', details: 'Status transition not allowed' },
  { status: 400 }
)

// 401 Unauthorized
return NextResponse.json(
  { error: 'Unauthorized', message: 'Authentication required' },
  { status: 401 }
)

// 403 Forbidden
return NextResponse.json(
  { error: 'Forbidden', message: 'You do not have permission to perform this action' },
  { status: 403 }
)

// 404 Not Found
return NextResponse.json(
  { error: 'Not found', resource: 'Job' },
  { status: 404 }
)

// 500 Internal Server Error
return NextResponse.json(
  { error: 'Internal server error', message: 'An unexpected error occurred' },
  { status: 500 }
)
```

### Logging

```typescript
// Always log errors with context
console.error('Error updating job:', {
  error: error instanceof Error ? error.message : 'Unknown error',
  stack: error instanceof Error ? error.stack : undefined,
  jobId: params.jobId,
  userId: user?.id,
  newStatus,
})
```

---

## Testing Strategy

### Unit Tests

**File:** `src/app/api/v1/jobs/[jobId]/route.test.ts`

```typescript
import { PUT } from './route'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

jest.mock('@clerk/nextjs/server')
jest.mock('@/lib/prisma')

describe('PUT /api/v1/jobs/[jobId]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('allows worker to submit job', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ userId: 'worker-clerk-id' })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'worker-internal-id' })
    ;(prisma.job.findUnique as jest.Mock).mockResolvedValue({
      id: 'job-id',
      status: 'IN_PROGRESS',
      workerId: 'worker-internal-id',
      list: { users: [] },
      task: { id: 'task-id' },
    })

    const request = new Request('http://localhost/api/v1/jobs/job-id', {
      method: 'PUT',
      body: JSON.stringify({
        status: 'SUBMITTED',
        requesterNoteContent: 'Work completed',
        selfReview: 90,
      }),
    })

    const response = await PUT(request, { params: { jobId: 'job-id' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.job.status).toBe('SUBMITTED')
  })

  test('prevents non-worker from submitting', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ userId: 'other-user-clerk-id' })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'other-user-id' })
    ;(prisma.job.findUnique as jest.Mock).mockResolvedValue({
      id: 'job-id',
      status: 'IN_PROGRESS',
      workerId: 'worker-internal-id', // Different from requester
      list: { users: [] },
      task: { id: 'task-id' },
    })

    const request = new Request('http://localhost/api/v1/jobs/job-id', {
      method: 'PUT',
      body: JSON.stringify({ status: 'SUBMITTED' }),
    })

    const response = await PUT(request, { params: { jobId: 'job-id' } })

    expect(response.status).toBe(403)
  })

  test('syncs task status when job is accepted', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ userId: 'owner-clerk-id' })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'owner-id' })
    ;(prisma.job.findUnique as jest.Mock).mockResolvedValue({
      id: 'job-id',
      status: 'SUBMITTED',
      workerId: 'worker-id',
      taskId: 'task-id',
      list: { users: [{ userId: 'owner-id', role: 'OWNER' }] },
      task: { id: 'task-id', status: 'READY' },
    })

    const request = new Request('http://localhost/api/v1/jobs/job-id', {
      method: 'PUT',
      body: JSON.stringify({ status: 'ACCEPTED', managerReview: 95 }),
    })

    await PUT(request, { params: { jobId: 'job-id' } })

    expect(prisma.$transaction).toHaveBeenCalled()
    // Verify task status was updated to DONE
  })
})
```

### Integration Tests

**File:** `tests/api/jobs.integration.test.ts`

```typescript
describe('Job API Integration', () => {
  test('complete job workflow from request to acceptance', async () => {
    // 1. Create job (REQUESTED)
    const createResponse = await fetch('/api/v1/jobs', {
      method: 'POST',
      body: JSON.stringify({
        taskId: testTaskId,
        listId: testListId,
        workerId: collaboratorId,
      }),
    })
    const { job } = await createResponse.json()
    expect(job.status).toBe('REQUESTED')

    // 2. Approve (OWNER)
    const approveResponse = await fetch(`/api/v1/jobs/${job.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
      headers: { Authorization: `Bearer ${ownerToken}` },
    })
    expect(approveResponse.status).toBe(200)

    // 3. Submit (WORKER)
    const submitResponse = await fetch(`/api/v1/jobs/${job.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'SUBMITTED',
        requesterNoteContent: 'Completed the task',
        selfReview: 88,
      }),
      headers: { Authorization: `Bearer ${workerToken}` },
    })
    expect(submitResponse.status).toBe(200)

    // Verify task status is READY
    const task = await prisma.task.findUnique({ where: { id: testTaskId } })
    expect(task?.status).toBe('READY')

    // 4. Accept (OWNER)
    const acceptResponse = await fetch(`/api/v1/jobs/${job.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'ACCEPTED',
        reviewerNoteContent: 'Great work!',
        managerReview: 92,
      }),
      headers: { Authorization: `Bearer ${ownerToken}` },
    })
    expect(acceptResponse.status).toBe(200)

    // Verify task status is DONE
    const updatedTask = await prisma.task.findUnique({ where: { id: testTaskId } })
    expect(updatedTask?.status).toBe('DONE')
  })
})
```

---

## Security Considerations

### Authorization Matrix

| Action                | Requester Role    | Checks                                      |
|-----------------------|-------------------|---------------------------------------------|
| Approve Request       | OWNER, MANAGER    | Must be list owner/manager                  |
| Reject Request        | OWNER, MANAGER    | Must be list owner/manager                  |
| Submit Work           | Worker            | Must be job.workerId                        |
| Withdraw Submission   | Worker            | Must be job.workerId                        |
| Accept Work           | OWNER, MANAGER    | Must be list owner/manager                  |
| Reject Work           | OWNER, MANAGER    | Must be list owner/manager                  |
| Request Changes       | OWNER, MANAGER    | Must be list owner/manager                  |

### Input Validation

```typescript
// Validate job status enum
const validStatuses = ['REQUESTED', 'IN_PROGRESS', 'SUBMITTED', 'VALIDATING', 'ACCEPTED', 'REJECTED']
if (newStatus && !validStatuses.includes(newStatus)) {
  return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
}

// Validate note content length
if (requesterNoteContent && requesterNoteContent.length > 50000) {
  return NextResponse.json({ error: 'Note content too long (max 50,000 characters)' }, { status: 400 })
}

// Validate review scores
if (selfReview !== undefined && (selfReview < 0 || selfReview > 100)) {
  return NextResponse.json({ error: 'Self-review must be between 0 and 100' }, { status: 400 })
}
```

### Rate Limiting

Consider implementing rate limiting for job updates:

```typescript
// Example using simple in-memory rate limiter
const rateLimiter = new Map<string, number>()

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const lastRequest = rateLimiter.get(userId) || 0

  if (now - lastRequest < 1000) {
    // Max 1 request per second
    return false
  }

  rateLimiter.set(userId, now)
  return true
}
```

---

## Claude Implementation Guide

### Step 1: Update API Route

```bash
# Backup existing route
cp src/app/api/v1/jobs/[jobId]/route.ts src/app/api/v1/jobs/[jobId]/route.ts.backup

# Update with enhanced logic
claude "Update src/app/api/v1/jobs/[jobId]/route.ts with the enhanced implementation from docs/212-review-system/4-controller-plan.md"
```

### Step 2: Create Helper Services

```bash
# Create status validator
claude "Create src/lib/services/job/statusValidator.ts from 4-controller-plan.md"

# Create task sync helper
claude "Create src/lib/services/job/taskSync.ts from 4-controller-plan.md"

# Create note helper
claude "Create src/lib/services/job/noteHelper.ts from 4-controller-plan.md"
```

### Step 3: Update GET Endpoint

```bash
# Enhance privacy filtering
claude "Update GET handler in src/app/api/v1/jobs/route.ts with privacy filtering from 4-controller-plan.md"
```

### Step 4: Write Tests

```bash
# Generate unit tests
claude "Create unit tests for PUT /api/v1/jobs/[jobId] covering all status transitions and authorization checks"

# Generate integration tests
claude "Create integration tests for complete job workflow"

# Run tests
npm test src/app/api/v1/jobs/
```

### Step 5: Manual Testing

```bash
# Test with curl or Postman
# Submit job as worker
curl -X PUT http://localhost:3000/api/v1/jobs/JOB_ID \
  -H "Authorization: Bearer WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"SUBMITTED","requesterNoteContent":"Work done","selfReview":90}'

# Accept job as owner
curl -X PUT http://localhost:3000/api/v1/jobs/JOB_ID \
  -H "Authorization: Bearer OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ACCEPTED","reviewerNoteContent":"Approved","managerReview":95}'
```

---

## Acceptance Criteria

- [ ] PUT endpoint validates all status transitions correctly
- [ ] Authorization checks prevent unauthorized transitions
- [ ] Worker can submit job with requester note
- [ ] Owner/Manager can approve, reject, or request changes
- [ ] Task status syncs automatically with job status
- [ ] Notes are created and linked to jobs correctly
- [ ] Privacy filtering works (participants see full data, others see limited)
- [ ] Earnings calculation triggers on job acceptance
- [ ] Error responses are consistent and informative
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing confirms all workflows work end-to-end
- [ ] API response times are < 500ms (p95)
- [ ] No security vulnerabilities (SQL injection, XSS, etc.)

---

## Performance Considerations

### Database Optimization

1. **Use Transactions**: Ensure job + task updates are atomic
2. **Select Only Needed Fields**: Don't over-fetch data
3. **Index Strategy**: Jobs are already indexed on taskId, workerId, listId

### Caching Strategy

Consider caching job status for frequently accessed jobs:

```typescript
// Example using simple cache
const jobStatusCache = new Map<string, { status: string; expiry: number }>()

function getCachedJobStatus(jobId: string): string | null {
  const cached = jobStatusCache.get(jobId)
  if (cached && cached.expiry > Date.now()) {
    return cached.status
  }
  return null
}

function setCachedJobStatus(jobId: string, status: string, ttl = 60000) {
  jobStatusCache.set(jobId, {
    status,
    expiry: Date.now() + ttl,
  })
}
```

---

## Next Steps

After completing controller layer:
1. Connect frontend components to API endpoints
2. Test end-to-end workflows manually
3. Review `5-enhancements-plan.md` for notifications and polish
4. Deploy to staging for user acceptance testing

---

**Last Updated:** 2026-01-21
**Status:** Ready for Implementation
