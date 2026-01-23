# Enhancements: Notifications, Polish & Future Features

**Part of Epic #212: Job Review System**
**Related:** `1-overall-plan.md`, `2-model-plan.md`, `3-view-plan.md`, `4-controller-plan.md`

---

## Overview

This document covers Phase 3 & 4 enhancements including notifications, UI polish, accessibility improvements, and future feature considerations for the Job Review System.

---

## Phase 3: Notifications (Week 3)

### Notification System Architecture

```
Job Status Change
       ↓
Notification Service
       ↓
    Database (Notification record)
       ↓
Real-time Push (WebSocket/SSE)
       ↓
  UI Update (Toast + Bell Icon)
```

---

### 1. Notification Model

**File:** `prisma/schema.prisma`

Check if `Notification` model exists. If not, add:

```prisma
model Notification {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt   DateTime @default(now())
  read        Boolean  @default(false)
  readAt      DateTime?

  // Notification content
  type        String   // 'JOB_REQUEST', 'JOB_APPROVED', 'JOB_SUBMITTED', 'JOB_ACCEPTED', etc.
  title       String
  message     String
  actionUrl   String?  // Link to relevant page

  // Relations
  userId      String   @db.ObjectId
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Context
  jobId       String?  @db.ObjectId
  taskId      String?  @db.ObjectId
  listId      String?  @db.ObjectId

  @@index([userId, read])
  @@index([createdAt])
}
```

---

### 2. Notification Service

**File:** `src/lib/services/notification/notificationService.ts` (NEW)

```typescript
import prisma from '@/lib/prisma'

export interface CreateNotificationParams {
  userId: string
  type: string
  title: string
  message: string
  actionUrl?: string
  jobId?: string
  taskId?: string
  listId?: string
}

export async function createNotification(
  params: CreateNotificationParams
): Promise<{ success: boolean; notificationId?: string }> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl,
        jobId: params.jobId,
        taskId: params.taskId,
        listId: params.listId,
      }
    })

    // TODO: Trigger real-time push notification
    // await pushNotification(notification)

    return { success: true, notificationId: notification.id }
  } catch (error) {
    console.error('Error creating notification:', error)
    return { success: false }
  }
}

export async function notifyJobStatusChange(
  job: any,
  oldStatus: string,
  newStatus: string
): Promise<void> {
  const notifications: CreateNotificationParams[] = []

  // Get list owners and managers
  const ownersAndManagers = job.list.users.filter((u: any) =>
    ['OWNER', 'MANAGER'].includes(u.role)
  )

  switch (newStatus) {
    case 'REQUESTED':
      // Notify owners/managers when worker requests job
      ownersAndManagers.forEach((user: any) => {
        notifications.push({
          userId: user.userId,
          type: 'JOB_REQUEST',
          title: 'New Job Request',
          message: `@${job.worker.profiles[0]?.username} requested to work on "${job.task.name}"`,
          actionUrl: `/app/do?listId=${job.listId}&taskId=${job.taskId}`,
          jobId: job.id,
          taskId: job.taskId,
          listId: job.listId,
        })
      })
      break

    case 'IN_PROGRESS':
      // Notify worker when request is approved
      if (oldStatus === 'REQUESTED') {
        notifications.push({
          userId: job.workerId,
          type: 'JOB_APPROVED',
          title: 'Job Request Approved',
          message: `Your request to work on "${job.task.name}" was approved`,
          actionUrl: `/app/do?listId=${job.listId}&taskId=${job.taskId}`,
          jobId: job.id,
          taskId: job.taskId,
          listId: job.listId,
        })
      }
      break

    case 'SUBMITTED':
      // Notify owners/managers when worker submits
      ownersAndManagers.forEach((user: any) => {
        notifications.push({
          userId: user.userId,
          type: 'JOB_SUBMITTED',
          title: 'Work Submitted for Review',
          message: `@${job.worker.profiles[0]?.username} submitted "${job.task.name}" for review`,
          actionUrl: `/app/do?listId=${job.listId}&taskId=${job.taskId}`,
          jobId: job.id,
          taskId: job.taskId,
          listId: job.listId,
        })
      })
      break

    case 'ACCEPTED':
      // Notify worker when work is accepted
      notifications.push({
        userId: job.workerId,
        type: 'JOB_ACCEPTED',
        title: 'Work Accepted! 🎉',
        message: `Your work on "${job.task.name}" has been accepted`,
        actionUrl: `/app/do?listId=${job.listId}&taskId=${job.taskId}`,
        jobId: job.id,
        taskId: job.taskId,
        listId: job.listId,
      })
      break

    case 'REJECTED':
      // Notify worker when work is rejected
      notifications.push({
        userId: job.workerId,
        type: 'JOB_REJECTED',
        title: 'Work Not Accepted',
        message: `Your work on "${job.task.name}" was not accepted. Task has been reopened.`,
        actionUrl: `/app/do?listId=${job.listId}&taskId=${job.taskId}`,
        jobId: job.id,
        taskId: job.taskId,
        listId: job.listId,
      })
      break

    case 'VALIDATING':
      // Notify worker when changes are requested
      notifications.push({
        userId: job.workerId,
        type: 'JOB_CHANGES_REQUESTED',
        title: 'Changes Requested',
        message: `Changes requested for "${job.task.name}". Please review feedback.`,
        actionUrl: `/app/do?listId=${job.listId}&taskId=${job.taskId}`,
        jobId: job.id,
        taskId: job.taskId,
        listId: job.listId,
      })
      break
  }

  // Create all notifications
  for (const notif of notifications) {
    await createNotification(notif)
  }
}
```

---

### 3. Notification API Endpoints

**File:** `src/app/api/v1/notifications/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

// GET /api/v1/notifications - Fetch user's notifications
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
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        ...(unreadOnly && { read: false }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const unreadCount = await prisma.notification.count({
      where: {
        userId: user.id,
        read: false,
      }
    })

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/v1/notifications/mark-read - Mark notification(s) as read
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
    const { notificationIds, markAllAsRead } = body

    if (markAllAsRead) {
      await prisma.notification.updateMany({
        where: {
          userId: user.id,
          read: false,
        },
        data: {
          read: true,
          readAt: new Date(),
        }
      })
    } else if (notificationIds && Array.isArray(notificationIds)) {
      await prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId: user.id,
        },
        data: {
          read: true,
          readAt: new Date(),
        }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking notifications as read:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

### 4. Notification Bell Component

**File:** `src/components/notificationBell.tsx` (NEW)

```tsx
'use client'

import React, { useState } from 'react'
import useSWR from 'swr'
import { Bell } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function NotificationBell() {
  const { data, mutate } = useSWR('/api/v1/notifications?limit=10', fetcher, {
    refreshInterval: 30000, // Poll every 30 seconds
  })

  const notifications = data?.notifications || []
  const unreadCount = data?.unreadCount || 0

  const markAsRead = async (notificationId: string) => {
    await fetch('/api/v1/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationIds: [notificationId] }),
    })
    mutate()
  }

  const markAllAsRead = async () => {
    await fetch('/api/v1/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllAsRead: true }),
    })
    mutate()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between p-2 border-b">
          <span className="font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={markAllAsRead}
            >
              Mark all as read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifications.map((notif: any) => (
              <DropdownMenuItem
                key={notif.id}
                className="p-3 cursor-pointer"
                onClick={() => {
                  if (!notif.read) markAsRead(notif.id)
                }}
                asChild
              >
                <Link href={notif.actionUrl || '#'}>
                  <div className="flex-1">
                    <div className="flex items-start gap-2">
                      {!notif.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{notif.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {notif.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notif.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="p-2 border-t text-center">
            <Link
              href="/app/notifications"
              className="text-xs text-primary hover:underline"
            >
              View all notifications
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Integration:** Add `<NotificationBell />` to main navigation/header component.

---

### 5. Integrate Notifications in Job Updates

**File:** `src/app/api/v1/jobs/[jobId]/route.ts`

Add notification call after job update:

```typescript
// After successful job update
if (newStatus && newStatus !== job.status) {
  try {
    const { notifyJobStatusChange } = await import('@/lib/services/notification/notificationService')
    await notifyJobStatusChange(result.job, job.status, newStatus)
  } catch (notifError) {
    console.error('Error sending notifications:', notifError)
    // Don't fail the request
  }
}
```

---

## Phase 4: Polish & Accessibility (Week 4)

### Loading States & Optimistic Updates

**1. Skeleton Loaders**

```tsx
// In TaskGrid while jobs are loading
{isLoadingJobs ? (
  <div className="space-y-2">
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-24 w-full" />
  </div>
) : (
  // Render jobs
)}
```

**2. Optimistic Status Updates**

```tsx
// In job action handlers
const handleApprove = async (jobId: string) => {
  // Optimistic update
  setJobs((prev) =>
    prev.map((j) => (j.id === jobId ? { ...j, status: 'IN_PROGRESS' } : j))
  )

  try {
    await fetch(`/api/v1/jobs/${jobId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    })
    toast({ title: 'Job approved' })
  } catch (error) {
    // Rollback
    mutate()
    toast({ title: 'Failed to approve job', variant: 'destructive' })
  }
}
```

---

### Keyboard Navigation

**Shortcuts:**
- `Escape` - Close dialogs
- `Tab` - Navigate form fields
- `Enter` - Submit forms
- `Arrow Up/Down` - Adjust sliders

**Implementation:**
```tsx
// In dialogs
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onOpenChange(false)
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmit()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

---

### Accessibility Enhancements

**ARIA Labels:**
```tsx
<Button
  aria-label="Approve job request"
  onClick={onApprove}
>
  Approve
</Button>

<div role="status" aria-live="polite">
  {statusMessage}
</div>
```

**Form Labels:**
```tsx
<Label htmlFor="solution">
  Solution Description
  <span className="text-destructive" aria-label="required">*</span>
</Label>
<RichTextEditor
  id="solution"
  aria-required="true"
  aria-describedby="solution-hint"
  // ...
/>
<p id="solution-hint" className="text-xs text-muted-foreground">
  Describe what you did to complete this task
</p>
```

**Screen Reader Announcements:**
```tsx
import { useToast } from '@/hooks/use-toast'

const { toast } = useToast()

// Toast automatically announces to screen readers
toast({
  title: 'Success',
  description: 'Job submitted successfully',
  role: 'status', // Announces as status update
})
```

---

### Mobile Responsiveness

**Responsive Dialogs:**
```tsx
<DialogContent className="max-w-2xl max-h-[90vh] md:max-h-none overflow-y-auto">
  {/* Content adapts to screen size */}
</DialogContent>
```

**Touch Gestures:**
- Swipe to dismiss dialogs (use react-swipeable)
- Pull to refresh notifications

---

### i18n Translations

**File:** `src/locales/en.json`

Add translation keys:

```json
{
  "job": {
    "status": {
      "REQUESTED": "Requested",
      "IN_PROGRESS": "In Progress",
      "SUBMITTED": "Submitted",
      "VALIDATING": "Validating",
      "ACCEPTED": "Accepted",
      "REJECTED": "Rejected"
    },
    "actions": {
      "request": "Request to Work",
      "approve": "Approve",
      "reject": "Reject",
      "submit": "Submit for Review",
      "withdraw": "Withdraw Submission",
      "accept": "Accept",
      "requestChanges": "Request Changes"
    },
    "notifications": {
      "approved": "Your request was approved",
      "rejected": "Your request was rejected",
      "submitted": "Work submitted successfully",
      "accepted": "Your work has been accepted",
      "changesRequested": "Changes have been requested"
    }
  }
}
```

**Usage:**
```tsx
import { useI18n } from '@/lib/contexts/i18n'

const { t } = useI18n()

<Button>{t('job.actions.approve')}</Button>
```

---

### Performance Optimizations

**1. Lazy Load Components**

```tsx
import dynamic from 'next/dynamic'

const JobReviewDialog = dynamic(() => import('@/components/jobReviewDialog'), {
  loading: () => <Skeleton className="h-96" />
})
```

**2. Memo Heavy Components**

```tsx
import { memo } from 'react'

export const JobDetailsCard = memo(({ job, ...props }: JobDetailsCardProps) => {
  // Component logic
}, (prevProps, nextProps) => {
  return prevProps.job.status === nextProps.job.status
})
```

**3. Debounce Input**

```tsx
import { useDebounce } from '@/lib/hooks/useDebounce'

const [searchTerm, setSearchTerm] = useState('')
const debouncedSearch = useDebounce(searchTerm, 300)

useEffect(() => {
  // Fetch with debouncedSearch
}, [debouncedSearch])
```

---

## Future Enhancements

### 1. Peer Review System

**Concept:** Allow other collaborators to review work before final owner approval.

**Implementation:**
- Add `peerReview` field to Job (already exists!)
- New status: `PEER_REVIEWING`
- Assign reviewers to job via `reviewerIds`
- Require X peer reviews before owner review

**Schema Addition:**
```prisma
model Job {
  // ... existing fields
  requiredPeerReviews Int?  @default(1)
  receivedPeerReviews Int   @default(0)
}
```

---

### 2. Job Templates & Checklists

**Concept:** Pre-defined review checklists for certain task types.

**Implementation:**
```prisma
model JobTemplate {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  name        String
  checklist   Json     // Array of checklist items
  taskTypes   String[] // Which task categories this applies to
  listId      String?  @db.ObjectId
  list        List?    @relation(fields: [listId], references: [id])
}
```

**Usage:** When submitting work, worker checks off items from template.

---

### 3. Job History & Audit Trail

**Concept:** Track all state changes with timestamps and actors.

**Implementation:**
```prisma
type JobHistoryEntry {
  timestamp   DateTime
  actor       String   // userId
  action      String   // 'APPROVED', 'SUBMITTED', etc.
  fromStatus  String
  toStatus    String
  notes       String?
}

model Job {
  // ... existing fields
  history     JobHistoryEntry[]
}
```

---

### 4. Batch Operations

**Concept:** Approve/reject multiple jobs at once.

**Implementation:**
- Checkbox selection in job list
- "Approve Selected" button
- Bulk API endpoint: `POST /api/v1/jobs/bulk-update`

---

### 5. Job Analytics Dashboard

**Concept:** Visualize job completion rates, average review times, worker performance.

**Metrics:**
- Jobs completed per worker
- Average time from REQUEST to ACCEPT
- Rejection rate
- Self-review vs manager review correlation

**Implementation:**
- New route: `/app/analytics/jobs`
- Aggregate queries on Job collection
- Charts using Recharts or Chart.js

---

### 6. Note Attachments

**Concept:** Workers attach screenshots, files, or documents to submission notes.

**Implementation:**
- Leverage existing `Note.documentIds` relation
- File upload component in `JobSubmissionDialog`
- Store files in cloud storage (S3, Cloudflare R2)
- Link Document records to Note

---

### 7. Note Editing & History

**Concept:** Allow workers to edit submission notes before final review, track edit history.

**Implementation:**
```prisma
model Note {
  // ... existing fields
  editHistory Json?  // Array of previous versions
}
```

**UI:** Show "Edited" indicator, allow viewing edit history.

---

### 8. Real-Time Collaboration

**Concept:** Use WebSockets for live job status updates.

**Implementation:**
- WebSocket server (Socket.io or native WebSockets)
- Emit events on job status changes
- Frontend listens for updates and refreshes UI

**Example:**
```tsx
useEffect(() => {
  const socket = io()

  socket.on('jobStatusChanged', (data) => {
    if (data.jobId === currentJobId) {
      mutate() // Refresh job data
    }
  })

  return () => socket.disconnect()
}, [currentJobId])
```

---

## Testing Checklist

### Manual Testing

- [ ] Worker requests to work on task
- [ ] Owner approves request
- [ ] Owner rejects request
- [ ] Worker submits work with notes and self-review
- [ ] Worker withdraws submission
- [ ] Owner accepts work
- [ ] Owner requests changes
- [ ] Owner rejects work
- [ ] Task status syncs correctly with job status
- [ ] Notifications are sent at each step
- [ ] Privacy controls work (participants vs. non-participants)
- [ ] Mobile responsive (test on phone/tablet)
- [ ] Keyboard navigation works
- [ ] Screen reader announces actions
- [ ] Translations work for all locales
- [ ] Performance is smooth (no lag)

### Automated Testing

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E tests cover full workflow
- [ ] Load testing (100+ concurrent users)
- [ ] Security scan (no vulnerabilities)

---

## Deployment Checklist

### Pre-Deployment

- [ ] Run full test suite
- [ ] Build succeeds without errors
- [ ] Database migration tested in staging
- [ ] Feature flag added (optional: rollout gradually)
- [ ] Rollback plan documented

### Deployment Steps

1. Deploy database migration: `npx prisma db push`
2. Deploy backend (API routes)
3. Deploy frontend (UI components)
4. Monitor error logs for 24 hours
5. Collect user feedback

### Post-Deployment

- [ ] Monitor error rates
- [ ] Check notification delivery
- [ ] Verify job workflows working
- [ ] User acceptance testing with stakeholders
- [ ] Document any issues

---

## Success Metrics

### Quantitative

- **Adoption Rate**: 60% of multi-collaborator lists using job review within 1 month
- **Workflow Completion**: 80% of REQUESTED jobs reach ACCEPTED or REJECTED
- **Approval Time**: < 24 hours from SUBMITTED to ACCEPTED/REJECTED
- **Error Rate**: < 1% API errors
- **Performance**: p95 response time < 500ms

### Qualitative

- **User Satisfaction**: 4/5 average rating in surveys
- **Feedback**: Positive feedback on workflow clarity
- **Bug Reports**: < 5 critical bugs in first month

---

## Claude Implementation Guide

### Phase 3: Notifications

```bash
# Add Notification model
claude "Add Notification model to prisma/schema.prisma from 5-enhancements-plan.md"
npx prisma db push

# Create notification service
claude "Create src/lib/services/notification/notificationService.ts from 5-enhancements-plan.md"

# Create notification API
claude "Create src/app/api/v1/notifications/route.ts from 5-enhancements-plan.md"

# Create notification bell component
claude "Create src/components/notificationBell.tsx from 5-enhancements-plan.md"

# Integrate notifications in job updates
claude "Update src/app/api/v1/jobs/[jobId]/route.ts to send notifications after job status changes"
```

### Phase 4: Polish

```bash
# Add loading states
claude "Add skeleton loaders and optimistic updates to TaskGrid and job components"

# Enhance accessibility
claude "Add ARIA labels, keyboard navigation, and screen reader support to job components"

# Add translations
claude "Add job-related translation keys to src/locales/en.json and other locale files"

# Performance optimizations
claude "Optimize JobDetailsCard with React.memo and lazy load heavy components"
```

---

## Acceptance Criteria

### Phase 3: Notifications
- [ ] Notification model exists in schema
- [ ] Notifications created on job status changes
- [ ] Notification API endpoints work
- [ ] NotificationBell component displays unread count
- [ ] Clicking notification navigates to relevant page
- [ ] Mark as read functionality works
- [ ] Real-time updates (polling every 30s)

### Phase 4: Polish
- [ ] All components have loading states
- [ ] Optimistic updates work smoothly
- [ ] Keyboard navigation functional
- [ ] ARIA labels present
- [ ] Screen reader compatible
- [ ] Mobile responsive
- [ ] Translations for all UI text
- [ ] Performance meets targets (< 500ms p95)

---

## Next Steps

After completing enhancements:
1. User acceptance testing
2. Gather feedback from beta users
3. Iterate on pain points
4. Plan future enhancements (peer review, analytics, etc.)
5. Document learnings for future epics

---

**Last Updated:** 2026-01-21
**Status:** Ready for Implementation
