# View Layer: UI Components & Frontend

**Part of Epic #212: Job Review System**
**Related:** `1-overall-plan.md`, `2-model-plan.md`, `4-controller-plan.md`

---

## Overview

This document covers all UI components, frontend logic, and user interactions for the Job Review System.

---

## Component Architecture

```
ListView
  └─ TaskGrid
       ├─ TaskItem (existing)
       └─ JobDetailsCard (NEW)
            ├─ Shows job status and participants
            ├─ Displays submission and review notes
            └─ Action buttons based on user role

Dialogs:
  ├─ JobSubmissionDialog (NEW) - Worker submits work
  └─ JobReviewDialog (NEW) - Owner/Manager reviews work

Status Menu (modified):
  └─ Role-based options for job workflow
```

---

## New Components

### 1. JobDetailsCard Component

**File:** `src/components/jobDetailsCard.tsx` (NEW)

**Purpose:** Display job status, notes, and actions below tasks in TaskGrid

**Props:**
```typescript
interface JobDetailsCardProps {
  job: Job & {
    requesterNotes: Note[]
    reviewersNotes: Note[]
    worker: User & { profiles: Profile[] }
  }
  task: Task
  userRole: 'OWNER' | 'MANAGER' | 'COLLABORATOR' | 'FOLLOWER'
  isParticipant: boolean
  isWorker: boolean
  userId: string
  onApprove: () => Promise<void>
  onReject: () => Promise<void>
  onValidate: () => Promise<void>
  onWithdraw: () => Promise<void>
  onRequestChanges: () => Promise<void>
}
```

**Implementation:**

```tsx
'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Lock, User } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface JobDetailsCardProps {
  // ... props from above
}

export function JobDetailsCard({
  job,
  task,
  userRole,
  isParticipant,
  isWorker,
  userId,
  onApprove,
  onReject,
  onValidate,
  onWithdraw,
  onRequestChanges,
}: JobDetailsCardProps) {
  // Get status badge variant
  const getStatusVariant = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      REQUESTED: 'outline',
      IN_PROGRESS: 'default',
      SUBMITTED: 'secondary',
      VALIDATING: 'outline',
      ACCEPTED: 'default',
      REJECTED: 'destructive',
    }
    return variants[status] || 'default'
  }

  // Limited view for non-participants
  if (!isParticipant) {
    return (
      <Card className="mt-2 border-l-4 border-blue-500">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={getStatusVariant(job.status)}>
                {job.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Job Status
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4" />
              <span>@{job.worker.profiles[0]?.username || 'Unknown'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Full view for participants
  return (
    <Card className="mt-2 border-l-4 border-blue-500">
      <CardContent className="py-4 space-y-4">
        {/* Header: Status and Worker */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={getStatusVariant(job.status)} className="text-sm">
              {job.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              @{job.worker.profiles[0]?.username || 'Unknown'}
            </span>
          </div>
        </div>

        {/* Worker's Submission Notes */}
        {job.requesterNotes && job.requesterNotes.length > 0 && (
          <div>
            <Label className="text-sm font-semibold">Worker's Submission:</Label>
            {job.requesterNotes.map((note) => (
              <div
                key={note.id}
                className="mt-2 p-3 bg-muted rounded-md space-y-2"
              >
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: note.content }}
                />
                <div className="text-xs text-muted-foreground">
                  {new Date(note.createdAt).toLocaleDateString()} at{' '}
                  {new Date(note.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Self-Review Score */}
        {job.selfReview !== null && job.selfReview !== undefined && (
          <div>
            <Label className="text-sm font-semibold">Self-Review:</Label>
            <div className="flex items-center gap-3 mt-2">
              <Progress value={job.selfReview} max={100} className="flex-1" />
              <span className="text-sm font-medium">{job.selfReview}/100</span>
            </div>
          </div>
        )}

        {/* Reviewer's Feedback */}
        {job.reviewersNotes && job.reviewersNotes.length > 0 && (
          <div>
            <Label className="text-sm font-semibold">Reviewer's Feedback:</Label>
            {job.reviewersNotes.map((note) => (
              <div
                key={note.id}
                className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md space-y-2"
              >
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: note.content }}
                />
                <div className="text-xs text-muted-foreground">
                  By @{note.user?.profiles?.[0]?.username || 'Reviewer'} •{' '}
                  {new Date(note.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Manager Review Score */}
        {job.managerReview !== null && job.managerReview !== undefined && (
          <div>
            <Label className="text-sm font-semibold">Manager Review:</Label>
            <div className="flex items-center gap-3 mt-2">
              <Progress value={job.managerReview} max={100} className="flex-1" />
              <span className="text-sm font-medium">{job.managerReview}/100</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {/* Worker Actions */}
          {isWorker && job.status === 'SUBMITTED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={onWithdraw}
              className="flex-1"
            >
              Withdraw Submission
            </Button>
          )}

          {isWorker && job.status === 'VALIDATING' && (
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                /* Re-submit after changes */
              }}
              className="flex-1"
            >
              Re-submit Work
            </Button>
          )}

          {/* Owner/Manager Actions */}
          {(userRole === 'OWNER' || userRole === 'MANAGER') && job.status === 'REQUESTED' && (
            <>
              <Button size="sm" variant="default" onClick={onApprove} className="flex-1">
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={onReject} className="flex-1">
                Reject
              </Button>
            </>
          )}

          {(userRole === 'OWNER' || userRole === 'MANAGER') && job.status === 'SUBMITTED' && (
            <>
              <Button size="sm" variant="default" onClick={onApprove}>
                Accept
              </Button>
              <Button size="sm" variant="outline" onClick={onRequestChanges}>
                Request Changes
              </Button>
              <Button size="sm" variant="destructive" onClick={onReject}>
                Reject
              </Button>
            </>
          )}
        </div>

        {/* Privacy Indicator */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground pt-2 border-t">
          <Lock className="w-3 h-3" />
          <span>Visible only to job participants</span>
        </div>
      </CardContent>
    </Card>
  )
}
```

---

### 2. JobSubmissionDialog Component

**File:** `src/components/jobSubmissionDialog.tsx` (NEW)

**Purpose:** Worker submits completed work with notes and self-review

**Props:**
```typescript
interface JobSubmissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  taskName: string
  onSubmit: (data: {
    noteContent: string
    selfReview: number
  }) => Promise<void>
}
```

**Implementation:**

```tsx
'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { RichTextEditor } from '@/components/richTextEditor' // See below
import { useToast } from '@/hooks/use-toast'

interface JobSubmissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  taskName: string
  onSubmit: (data: { noteContent: string; selfReview: number }) => Promise<void>
}

export function JobSubmissionDialog({
  open,
  onOpenChange,
  jobId,
  taskName,
  onSubmit,
}: JobSubmissionDialogProps) {
  const [noteContent, setNoteContent] = useState('')
  const [selfReview, setSelfReview] = useState(80)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async () => {
    if (!noteContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a description of your work',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({ noteContent, selfReview })
      toast({
        title: 'Work Submitted',
        description: 'Your work has been submitted for review',
      })
      onOpenChange(false)
      setNoteContent('')
      setSelfReview(80)
    } catch (error) {
      toast({
        title: 'Submission Failed',
        description: 'Could not submit your work. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Work for Review</DialogTitle>
          <DialogDescription>
            Describe your solution for <strong>{taskName}</strong> and submit for validation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Solution Description */}
          <div>
            <Label htmlFor="solution" className="text-sm font-semibold">
              Solution Description *
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Explain what you did to complete this task. Supports formatting, links, and attachments.
            </p>
            <RichTextEditor
              id="solution"
              value={noteContent}
              onChange={setNoteContent}
              placeholder="Explain what you did to complete this task..."
              minHeight={200}
            />
          </div>

          {/* Self-Review Slider */}
          <div>
            <Label htmlFor="self-review" className="text-sm font-semibold">
              Self-Review (Optional)
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Rate the quality of your work on a scale of 0-100
            </p>
            <div className="space-y-3">
              <Slider
                id="self-review"
                value={[selfReview]}
                onValueChange={([value]) => setSelfReview(value)}
                max={100}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 (Needs work)</span>
                <span className="font-semibold text-foreground">{selfReview}/100</span>
                <span>100 (Perfect)</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!noteContent.trim() || isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit for Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

---

### 3. JobReviewDialog Component

**File:** `src/components/jobReviewDialog.tsx` (NEW)

**Purpose:** Owner/Manager reviews submitted work and takes action

**Props:**
```typescript
interface JobReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: Job & {
    requesterNotes: Note[]
    worker: User & { profiles: Profile[] }
  }
  onReview: (data: {
    action: 'accept' | 'validate' | 'reject'
    reviewNoteContent?: string
    managerReview?: number
  }) => Promise<void>
}
```

**Implementation:**

```tsx
'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { RichTextEditor } from '@/components/richTextEditor'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import type { JobWithRelations } from '@/lib/services/job/types'

interface JobReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: JobWithRelations
  onReview: (data: {
    action: 'accept' | 'validate' | 'reject'
    reviewNoteContent?: string
    managerReview?: number
  }) => Promise<void>
}

export function JobReviewDialog({
  open,
  onOpenChange,
  job,
  onReview,
}: JobReviewDialogProps) {
  const [action, setAction] = useState<'accept' | 'validate' | 'reject'>('accept')
  const [reviewNoteContent, setReviewNoteContent] = useState('')
  const [managerReview, setManagerReview] = useState(85)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmitReview = async () => {
    setIsSubmitting(true)
    try {
      await onReview({
        action,
        reviewNoteContent: reviewNoteContent.trim() || undefined,
        managerReview: action === 'accept' ? managerReview : undefined,
      })

      const messages = {
        accept: 'Work accepted and task marked as complete',
        validate: 'Changes requested, worker will revise',
        reject: 'Work rejected, task reopened',
      }

      toast({
        title: 'Review Submitted',
        description: messages[action],
      })

      onOpenChange(false)
      setReviewNoteContent('')
      setManagerReview(85)
      setAction('accept')
    } catch (error) {
      toast({
        title: 'Review Failed',
        description: 'Could not submit review. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Submitted Work</DialogTitle>
          <DialogDescription>
            Review work from @{job.worker.profiles[0]?.username || 'Unknown'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Worker's Submission */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Worker's Solution:</Label>
              {job.selfReview !== null && (
                <Badge variant="secondary">Self-Review: {job.selfReview}/100</Badge>
              )}
            </div>
            {job.requesterNotes?.map((note) => (
              <div
                key={note.id}
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: note.content }}
              />
            ))}
          </div>

          {/* Review Action */}
          <div>
            <Label className="text-sm font-semibold mb-3 block">Action *</Label>
            <RadioGroup value={action} onValueChange={(v) => setAction(v as any)}>
              <div className="space-y-3">
                <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer">
                  <RadioGroupItem value="accept" id="accept" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="accept" className="font-medium cursor-pointer">
                      Accept (Mark task as Done)
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Approve the work and complete the task
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer">
                  <RadioGroupItem value="validate" id="validate" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="validate" className="font-medium cursor-pointer">
                      Request Changes
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ask the worker to revise and resubmit
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer">
                  <RadioGroupItem value="reject" id="reject" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="reject" className="font-medium cursor-pointer">
                      Reject (Reopen task)
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Reject the work and reopen the task for others
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Review Feedback */}
          <div>
            <Label htmlFor="feedback" className="text-sm font-semibold">
              Review Feedback (Optional)
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Provide comments or suggestions for the worker
            </p>
            <RichTextEditor
              id="feedback"
              value={reviewNoteContent}
              onChange={setReviewNoteContent}
              placeholder="Provide feedback on the work..."
              minHeight={150}
            />
          </div>

          {/* Manager Review Score (only for accept) */}
          {action === 'accept' && (
            <div>
              <Label htmlFor="manager-review" className="text-sm font-semibold">
                Manager Review (Optional)
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Rate the quality of the completed work
              </p>
              <div className="space-y-3">
                <Slider
                  id="manager-review"
                  value={[managerReview]}
                  onValueChange={([value]) => setManagerReview(value)}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0 (Poor)</span>
                  <span className="font-semibold text-foreground">{managerReview}/100</span>
                  <span>100 (Excellent)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmitReview} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

---

### 4. RichTextEditor Component

**File:** `src/components/richTextEditor.tsx` (NEW or use existing)

**Purpose:** Rich text editing for job notes using Lexical

**Note:** If Payload CMS already uses Lexical, leverage existing editor configuration.

**Minimal Implementation:**

```tsx
'use client'

import React from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary'
import { EditorState } from 'lexical'

interface RichTextEditorProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = 'Start typing...',
  minHeight = 200,
}: RichTextEditorProps) {
  const initialConfig = {
    namespace: 'JobNoteEditor',
    onError: (error: Error) => console.error('Lexical Error:', error),
    editorState: value, // Load existing content
  }

  const handleChange = (editorState: EditorState) => {
    editorState.read(() => {
      const html = editorState.toJSON() // or use htmlPlugin to export HTML
      onChange(JSON.stringify(html)) // Store as JSON or HTML
    })
  }

  return (
    <div
      id={id}
      className="border rounded-md overflow-hidden"
      style={{ minHeight: `${minHeight}px` }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="p-3 focus:outline-none min-h-[inherit] prose prose-sm dark:prose-invert max-w-none" />
          }
          placeholder={
            <div className="absolute top-3 left-3 text-muted-foreground pointer-events-none">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <OnChangePlugin onChange={handleChange} />
      </LexicalComposer>
    </div>
  )
}
```

**Production Note:** Use Payload's existing Lexical config for consistency. Import from `@payloadcms/richtext-lexical`.

---

## Modified Components

### 5. TaskGrid Integration

**File:** `src/components/taskGrid.tsx`

**Changes:**

1. Import new components
2. Fetch jobs for current list
3. Render `JobDetailsCard` below each task with active job
4. Add job action handlers

**Key Modifications:**

```tsx
import { JobDetailsCard } from '@/components/jobDetailsCard'
import { JobSubmissionDialog } from '@/components/jobSubmissionDialog'
import { JobReviewDialog } from '@/components/jobReviewDialog'
import type { JobWithRelations, ListUser } from '@/lib/services/job/types'

interface SubmitWorkData {
  noteContent: string
  selfReview: number
}

interface ReviewWorkData {
  action: 'accept' | 'validate' | 'reject'
  reviewNoteContent?: string
  managerReview?: number
}

interface TaskGridProps {
  // ... existing props
  jobs?: JobWithRelations[] // Add jobs prop with proper type
}

export const TaskGrid = ({
  tasks,
  selectedTaskList,
  jobs = [],
  // ... other props
}: TaskGridProps) => {
  // Dialog state
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false)
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState<JobWithRelations | null>(null)

  // Map jobs by taskId for quick lookup
  const jobsByTask = useMemo(() => {
    const map: Record<string, JobWithRelations> = {}
    jobs.forEach((job) => {
      // Store latest job for each task
      if (!map[job.taskId] || new Date(job.createdAt) > new Date(map[job.taskId].createdAt)) {
        map[job.taskId] = job
      }
    })
    return map
  }, [jobs])

  // Determine user's role in list
  const userRole = useMemo(() => {
    return selectedTaskList?.users?.find((u: ListUser) => u.userId === userId)?.role
  }, [selectedTaskList, userId])

  // Check if user is participant in job
  const isJobParticipant = (job: JobWithRelations, uid: string) => {
    return (
      job.workerId === uid ||
      selectedTaskList?.users?.some(
        (u: ListUser) => u.userId === uid && ['OWNER', 'MANAGER'].includes(u.role)
      ) ||
      job.reviewerIds?.includes(uid)
    )
  }

  // Job action handlers
  const handleApproveJob = async (jobId: string) => {
    await fetch(`/api/v1/jobs/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    })
    await onRefresh()
  }

  const handleRejectJob = async (jobId: string) => {
    await fetch(`/api/v1/jobs/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REJECTED' }),
    })
    await onRefresh()
  }

  const handleWithdrawJob = async (jobId: string) => {
    await fetch(`/api/v1/jobs/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    })
    await onRefresh()
  }

  const handleSubmitWork = async (jobId: string, data: SubmitWorkData) => {
    await fetch(`/api/v1/jobs/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'SUBMITTED',
        requesterNoteContent: data.noteContent,
        selfReview: data.selfReview,
      }),
    })
    await onRefresh()
  }

  const handleReviewWork = async (jobId: string, data: ReviewWorkData) => {
    const statusMap = {
      accept: 'ACCEPTED',
      validate: 'VALIDATING',
      reject: 'REJECTED',
    }

    await fetch(`/api/v1/jobs/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: statusMap[data.action],
        reviewerNoteContent: data.reviewNoteContent,
        managerReview: data.managerReview,
      }),
    })
    await onRefresh()
  }

  return (
    <div className="grid gap-4">
      {sortedTasks.map((task) => {
        const activeJob = jobsByTask[task.id]
        const isParticipant = activeJob ? isJobParticipant(activeJob, userId) : false
        const isWorker = activeJob?.workerId === userId

        return (
          <div key={task.id}>
            {/* Existing TaskItem */}
            <TaskItem
              task={task}
              // ... other props
            />

            {/* NEW: Job Details Card */}
            {activeJob && (
              <JobDetailsCard
                job={activeJob}
                task={task}
                userRole={userRole}
                isParticipant={isParticipant}
                isWorker={isWorker}
                userId={userId}
                onApprove={() => handleApproveJob(activeJob.id)}
                onReject={() => handleRejectJob(activeJob.id)}
                onValidate={() => {
                  setSelectedJob(activeJob)
                  setIsReviewDialogOpen(true)
                }}
                onWithdraw={() => handleWithdrawJob(activeJob.id)}
                onRequestChanges={() => {
                  setSelectedJob(activeJob)
                  setIsReviewDialogOpen(true)
                }}
              />
            )}
          </div>
        )
      })}

      {/* Submission Dialog */}
      <JobSubmissionDialog
        open={isSubmitDialogOpen}
        onOpenChange={setIsSubmitDialogOpen}
        jobId={selectedJob?.id}
        taskName={selectedJob?.task?.name || ''}
        onSubmit={(data) => handleSubmitWork(selectedJob.id, data)}
      />

      {/* Review Dialog */}
      <JobReviewDialog
        open={isReviewDialogOpen}
        onOpenChange={setIsReviewDialogOpen}
        job={selectedJob}
        onReview={(data) => handleReviewWork(selectedJob.id, data)}
      />
    </div>
  )
}
```

---

### 6. Role-Based Status Menu

**File:** `src/components/taskGrid.tsx` or `src/lib/hooks/useTaskHandlers.ts`

**Changes:** Modify status menu options based on user role and job state

**Logic:**

```tsx
// In TaskGrid or useTaskHandlers
import type { Task } from '@/generated/prisma'
import type { JobWithRelations } from '@/lib/services/job/types'

const getStatusMenuOptions = (task: Task, userRole: string, activeJob: JobWithRelations | undefined) => {
  const isOwnerOrManager = ['OWNER', 'MANAGER'].includes(userRole)
  const isTaskOwner = task.userId === userId

  // Standard options for owners/managers/task owners
  if (isOwnerOrManager || isTaskOwner) {
    return [
      { label: 'Open', value: 'OPEN' },
      { label: 'In Progress', value: 'IN_PROGRESS' },
      { label: 'Steady', value: 'STEADY' },
      { label: 'Ready', value: 'READY' },
      { label: 'Done', value: 'DONE' },
      { label: 'Ignored', value: 'IGNORED' },
      { label: 'Skipped', value: 'SKIPPED' },
    ]
  }

  // Collaborator workflow
  if (userRole === 'COLLABORATOR') {
    if (!activeJob) {
      return [
        {
          label: 'Request to Work',
          value: 'request',
          action: () => handleRequestWork(task),
        },
      ]
    }

    if (activeJob.status === 'REQUESTED') {
      return [{ label: 'Request Pending...', value: 'pending', disabled: true }]
    }

    if (activeJob.status === 'IN_PROGRESS') {
      return [
        {
          label: 'Submit for Review',
          value: 'submit',
          action: () => {
            setSelectedJob(activeJob)
            setIsSubmitDialogOpen(true)
          },
        },
      ]
    }

    if (activeJob.status === 'SUBMITTED') {
      return [
        { label: 'Submitted (Pending Review)', value: 'submitted', disabled: true },
        {
          label: 'Withdraw Submission',
          value: 'withdraw',
          action: () => handleWithdrawJob(activeJob.id),
        },
      ]
    }

    if (activeJob.status === 'VALIDATING') {
      return [
        {
          label: 'Revise and Resubmit',
          value: 'resubmit',
          action: () => {
            setSelectedJob(activeJob)
            setIsSubmitDialogOpen(true)
          },
        },
      ]
    }
  }

  return []
}
```

---

## UI/UX Patterns

### Loading States

**Optimistic Updates:**
```tsx
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
  } catch (error) {
    // Rollback on error
    await refetchJobs()
  }
}
```

### Error Handling

**Toast Notifications:**
```tsx
const { toast } = useToast()

try {
  await handleSubmit()
  toast({
    title: 'Success',
    description: 'Work submitted successfully',
  })
} catch (error) {
  toast({
    title: 'Error',
    description: error.message || 'Something went wrong',
    variant: 'destructive',
  })
}
```

### Accessibility

**Keyboard Navigation:**
- All dialogs support Escape to close
- Tab navigation through form fields
- Enter to submit forms
- Arrow keys for slider controls

**Screen Reader Support:**
- Proper ARIA labels on buttons
- Dialog titles and descriptions
- Form field labels
- Status announcements via toast

---

## Testing Strategy

### Component Tests

**File:** `src/components/__tests__/jobDetailsCard.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { JobDetailsCard } from '../jobDetailsCard'

describe('JobDetailsCard', () => {
  test('shows limited view for non-participants', () => {
    render(
      <JobDetailsCard
        job={mockJob}
        task={mockTask}
        isParticipant={false}
        // ... other props
      />
    )

    expect(screen.getByText('Job Status')).toBeInTheDocument()
    expect(screen.queryByText("Worker's Submission")).not.toBeInTheDocument()
  })

  test('shows full view for participants', () => {
    render(
      <JobDetailsCard
        job={mockJobWithNotes}
        task={mockTask}
        isParticipant={true}
        // ... other props
      />
    )

    expect(screen.getByText("Worker's Submission")).toBeInTheDocument()
    expect(screen.getByText('Test submission content')).toBeInTheDocument()
  })

  test('shows approve/reject buttons for owners on REQUESTED jobs', () => {
    render(
      <JobDetailsCard
        job={{ ...mockJob, status: 'REQUESTED' }}
        userRole="OWNER"
        // ... other props
      />
    )

    expect(screen.getByText('Approve')).toBeInTheDocument()
    expect(screen.getByText('Reject')).toBeInTheDocument()
  })
})
```

### Integration Tests

**File:** `src/components/__tests__/jobWorkflow.integration.test.tsx`

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskGrid } from '../taskGrid'

describe('Job Workflow Integration', () => {
  test('collaborator submits work successfully', async () => {
    render(<TaskGrid tasks={mockTasks} jobs={mockJobs} userId={collaboratorId} />)

    // Click submit button
    const submitButton = screen.getByText('Submit for Review')
    fireEvent.click(submitButton)

    // Fill out dialog
    const editor = screen.getByPlaceholderText('Explain what you did...')
    fireEvent.change(editor, { target: { value: 'I completed the task' } })

    // Submit
    const submitDialogButton = screen.getByText('Submit for Review')
    fireEvent.click(submitDialogButton)

    // Wait for success
    await waitFor(() => {
      expect(screen.getByText('Work Submitted')).toBeInTheDocument()
    })
  })

  test('owner reviews and accepts work', async () => {
    render(<TaskGrid tasks={mockTasks} jobs={mockSubmittedJobs} userId={ownerId} />)

    // Click accept button
    const acceptButton = screen.getByText('Accept')
    fireEvent.click(acceptButton)

    // Confirm in dialog
    const confirmButton = screen.getByText('Submit Review')
    fireEvent.click(confirmButton)

    // Wait for success
    await waitFor(() => {
      expect(screen.getByText('Review Submitted')).toBeInTheDocument()
    })
  })
})
```

---

## Claude Implementation Guide

### Step 1: Create Components

```bash
# Create JobDetailsCard
claude "Create src/components/jobDetailsCard.tsx based on the implementation in docs/212-review-system/3-view-plan.md"

# Create dialogs
claude "Create src/components/jobSubmissionDialog.tsx and src/components/jobReviewDialog.tsx from 3-view-plan.md"

# Create or configure RichTextEditor
claude "Set up RichTextEditor component using Lexical, leveraging Payload CMS config"
```

### Step 2: Integrate with TaskGrid

```bash
# Update TaskGrid
claude "Update src/components/taskGrid.tsx to integrate JobDetailsCard and dialogs as specified in 3-view-plan.md section 5"

# Update handlers
claude "Add job action handlers to src/lib/hooks/useTaskHandlers.ts for approve, reject, submit, review, withdraw"
```

### Step 3: Update ListView

```bash
# Fetch jobs in ListView
claude "Update src/views/listView.tsx to fetch jobs from /api/v1/jobs and pass to TaskGrid"
```

### Step 4: Test Components

```bash
# Generate tests
claude "Create component tests for JobDetailsCard, JobSubmissionDialog, and JobReviewDialog"

# Run tests
npm test src/components/__tests__/
```

---

## Acceptance Criteria

- [ ] JobDetailsCard renders correctly for participants and non-participants
- [ ] JobSubmissionDialog allows workers to submit with rich text and self-review
- [ ] JobReviewDialog allows owners/managers to accept/reject/validate
- [ ] RichTextEditor supports formatting (bold, italic, lists, links)
- [ ] TaskGrid integrates job cards below tasks
- [ ] Role-based status menu shows correct options
- [ ] Optimistic updates work smoothly
- [ ] Error handling with toast notifications
- [ ] Keyboard navigation works in all dialogs
- [ ] Screen reader accessible
- [ ] Mobile responsive (all components work on small screens)
- [ ] Component tests pass
- [ ] Integration tests pass

---

## Next Steps

After completing view layer:
1. Implement controller layer (see `4-controller-plan.md`)
2. Connect frontend to API endpoints
3. Test end-to-end workflows
4. Review `5-enhancements-plan.md` for notifications and polish

---

**Last Updated:** 2026-01-21
**Status:** Ready for Implementation
