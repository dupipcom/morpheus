# Task and Jobs API Endpoints

## Overview

Create new CRUD endpoints for the Task and Jobs collections to support the frontend refactor. These endpoints will follow the existing API patterns in the codebase and enforce authorization based on list membership.

## Implementation Plan

### 1. Task Endpoints

#### 1.1 Create `/src/app/api/v1/tasks/route.ts`

**GET `/api/v1/tasks`** - List tasks

- Query parameters:
- `listId` (optional) - Filter by list
- `status` (optional) - Filter by TaskStatus
- `area` (optional) - Filter by Areas
- Authorization: User must be a member (OWNER, MANAGER, or COLLABORATOR) of the list containing the task
- Response: Array of tasks with relations (list, jobs, candidates, raisedTransactions)
- Include pagination if needed

**POST `/api/v1/tasks`** - Create task

- Request body: Task fields (name, categories, area, status, listId, etc.)
- Validation: Required fields (name, area, listId)
- Authorization: User must be OWNER or MANAGER of the list
- Response: Created task with relations

#### 1.2 Create `/src/app/api/v1/tasks/[taskId]/route.ts`

**GET `/api/v1/tasks/[taskId]`** - Get single task

- Authorization: User must be a member of the list containing the task
- Response: Task with all relations (list, jobs, candidates, raisedTransactions)

**PUT `/api/v1/tasks/[taskId]`** - Update task

- Request body: Partial task fields
- Authorization: User must be OWNER or MANAGER of the list containing the task
- Response: Updated task

**DELETE `/api/v1/tasks/[taskId]`** - Delete task

- Authorization: User must be OWNER or MANAGER of the list containing the task
- Response: Success confirmation
- Note: Jobs will cascade delete per schema

### 2. Jobs Endpoints

#### 2.1 Create `/src/app/api/v1/jobs/route.ts`

**GET `/api/v1/jobs`** - List jobs

- Query parameters:
- `listId` (optional) - Filter by list
- `taskId` (optional) - Filter by task
- `workerId` (optional) - Filter by worker
- `status` (optional) - Filter by JobStatus
- Authorization: User must be a member of the list containing the job
- Response: Array of jobs with relations (task, list, worker, reviewers, reviewersNotes)

**POST `/api/v1/jobs`** - Create job

- Request body: Job fields (taskId, listId, workerId, status, reviewerIds, etc.)
- Validation: Required fields (taskId, listId, workerId)
- Authorization: User must be OWNER, MANAGER, or COLLABORATOR of the list
- Note: The workerId can be the requesting user or another user (if requester is OWNER/MANAGER). COLLABORATORs can only create jobs for themselves (workerId must equal their userId).
- Response: Created job with relations

#### 2.2 Create `/src/app/api/v1/jobs/[jobId]/route.ts`

**GET `/api/v1/jobs/[jobId]`** - Get single job

- Authorization: User must be a member of the list containing the job
- Response: Job with all relations (task, list, worker, reviewers, reviewersNotes)

**PUT `/api/v1/jobs/[jobId]`** - Update job

- Request body: Partial job fields (status, selfReview, peerReview, managerReview, reviewerIds, etc.)
- Authorization: 
  - User must be a member of the list containing the job
  - **Self-review (selfReview)**: Only the worker (job.workerId) can update their own selfReview
  - **Peer/Manager reviews (peerReview, managerReview)**: Only OWNER or MANAGER can update
  - **Status changes to ACCEPTED/REJECTED**: Only OWNER or MANAGER can validate (cannot be the worker who submitted the job)
  - **Status changes to IN_PROGRESS/VALIDATING**: Worker can update their own job status
  - **Reviewer assignment**: Only OWNER or MANAGER can assign reviewers
- Validation: Prevent worker from validating their own job (if status is ACCEPTED/REJECTED and userId === job.workerId, return 403)
- Response: Updated job

**DELETE `/api/v1/jobs/[jobId]`** - Delete job

- Authorization: User must be OWNER or MANAGER of the list containing the job
- Response: Success confirmation

### 3. Implementation Details

#### 3.1 Authorization Helpers

Create reusable helper functions for authorization:

**Location**: Can be added to existing utility file or as inline functions

**Functions**:
- `checkListMembership(userId: string, listId: string)` - Returns boolean
  - Checks if user is OWNER, MANAGER, or COLLABORATOR in the list
- `getUserListRole(userId: string, listId: string)` - Returns role string or null
  - Returns the user's role in the list (OWNER, MANAGER, COLLABORATOR, FOLLOWER, or null)
  - Used for role-based authorization checks

**Role-Based Permissions**:
- **OWNER**: Full access (create, read, update, delete tasks/jobs; validate jobs)
- **MANAGER**: Full access (create, read, update, delete tasks/jobs; validate jobs)
- **COLLABORATOR**: Can create and read jobs; can update own jobs; cannot create, update, or delete tasks; cannot validate jobs
- **FOLLOWER**: Read-only access (can read tasks/jobs from lists they follow)

#### 3.2 Common Patterns

All endpoints will follow existing patterns:

- Use `auth()` from `@clerk/nextjs/server` for authentication
- Use `prisma` from `@/lib/prisma` for database access
- Standard error handling with try/catch
- Return JSON responses with appropriate status codes
- Validate required fields before database operations
- Include relevant relations in responses using Prisma `include`

#### 3.3 Response Format

Follow existing API response patterns:

- Success: `{ task: {...} }` or `{ jobs: [...] }`
- Error: `{ error: "message" }` with appropriate status code

### 4. Files to Create

1. `/src/app/api/v1/tasks/route.ts` - Task list and create
2. `/src/app/api/v1/tasks/[taskId]/route.ts` - Task get, update, delete
3. `/src/app/api/v1/jobs/route.ts` - Job list and create
4. `/src/app/api/v1/jobs/[jobId]/route.ts` - Job get, update, delete

### 5. Considerations

- No modifications to existing API files (as per constraint)
- Endpoints will work with the new Task and Job models from the schema
- Authorization ensures users can only access Tasks/Jobs from Lists where they have membership
- Role-based permissions enforce proper access control (OWNER/MANAGER have full control, COLLABORATOR has limited control - cannot create tasks, only jobs)
- **Critical**: Job validation (status change to ACCEPTED/REJECTED) cannot be performed by the worker who submitted the job
- Self-review (selfReview) can only be updated by the worker
- Peer/Manager reviews can only be updated by OWNER or MANAGER
- Relations are included in responses for frontend convenience
- Validation ensures data integrity (required fields, valid enum values, etc.)