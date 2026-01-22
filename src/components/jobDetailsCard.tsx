'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Lock, User, AlertCircle, CheckCircle, Send, XCircle, Hourglass, Loader2 } from 'lucide-react'
import type { JobWithRelations, UserRole } from '@/lib/services/job/types'

// Worker-specific status banner
function WorkerStatusBanner({ status }: { status: string }) {
  const configs: Record<string, { message: string; icon: React.ReactNode; className: string }> = {
    REQUESTED: {
      message: 'Your request is being reviewed. You will be notified when approved.',
      icon: <Hourglass className="w-6 h-6" />,
      className: 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300',
    },
    IN_PROGRESS: {
      message: 'Your request was approved! You can now work on this task.',
      icon: <CheckCircle className="w-6 h-6 text-green-600" />,
      className: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300',
    },
    SUBMITTED: {
      message: 'Your work has been submitted. Awaiting review from the owner.',
      icon: <Send className="w-6 h-6 text-blue-600" />,
      className: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300',
    },
    VALIDATING: {
      message: 'Changes have been requested. Please revise and resubmit.',
      icon: <AlertCircle className="w-6 h-6 text-orange-600" />,
      className: 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300',
    },
    ACCEPTED: {
      message: 'Congratulations! Your work was accepted.',
      icon: <CheckCircle className="w-6 h-6 text-green-600" />,
      className: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300',
    },
    REJECTED: {
      message: 'Your submission was rejected.',
      icon: <XCircle className="w-6 h-6 text-red-600" />,
      className: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
    },
  }

  const config = configs[status]
  if (!config) return null

  return (
    <div className={`flex items-center gap-2 p-3 rounded-md border ${config.className}`}>
      {config.icon}
      <span className="text-sm">{config.message}</span>
    </div>
  )
}

// Owner/Manager status banner
function OwnerStatusBanner({ status, workerName }: { status: string; workerName: string }) {
  const configs: Record<string, { message: string; icon: React.ReactNode; className: string }> = {
    REQUESTED: {
      message: `@${workerName} has requested to work on this task. Approve or reject the request.`,
      icon: <Hourglass className="w-6 h-6" />,
      className: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300',
    },
    IN_PROGRESS: {
      message: `@${workerName} is currently working on this task.`,
      icon: <AlertCircle className="w-6 h-6 text-blue-600" />,
      className: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300',
    },
    SUBMITTED: {
      message: `@${workerName} has submitted their work for review.`,
      icon: <Send className="w-6 h-6 text-yellow-600" />,
      className: 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300',
    },
    VALIDATING: {
      message: `Waiting for @${workerName} to revise and resubmit.`,
      icon: <Hourglass className="w-6 h-6" />,
      className: 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300',
    },
    ACCEPTED: {
      message: `@${workerName}'s work was accepted.`,
      icon: <CheckCircle className="w-6 h-6 text-green-600" />,
      className: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300',
    },
    REJECTED: {
      message: `@${workerName}'s submission was rejected.`,
      icon: <XCircle className="w-6 h-6 text-red-600" />,
      className: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
    },
  }

  const config = configs[status]
  if (!config) return null

  return (
    <div className={`flex items-center gap-2 p-3 rounded-md border ${config.className}`}>
      {config.icon}
      <span className="text-sm">{config.message}</span>
    </div>
  )
}

interface JobDetailsCardProps {
  job: JobWithRelations
  userRole: UserRole
  isParticipant: boolean
  isWorker: boolean
  userId: string
  isRefreshing?: boolean
  onApprove: () => Promise<void>
  onReject: () => Promise<void>
  onValidate: () => void
  onWithdraw: () => Promise<void>
  onRequestChanges: () => void
  onSubmitWork: () => void
}

export function JobDetailsCard({
  job,
  userRole,
  isParticipant,
  isWorker,
  userId,
  isRefreshing = false,
  onApprove,
  onReject,
  onValidate,
  onWithdraw,
  onRequestChanges,
  onSubmitWork,
}: JobDetailsCardProps) {
  const [isLoading, setIsLoading] = React.useState(false)

  // Get status badge variant
  const getStatusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
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

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      REQUESTED: 'Requested',
      IN_PROGRESS: 'In Progress',
      SUBMITTED: 'Submitted',
      VALIDATING: 'Changes Requested',
      ACCEPTED: 'Accepted',
      REJECTED: 'Rejected',
    }
    return labels[status] || status
  }

  const handleAsyncAction = async (action: () => Promise<void>) => {
    setIsLoading(true)
    try {
      await action()
    } finally {
      setIsLoading(false)
    }
  }

  // Limited view for non-participants
  if (!isParticipant) {
    return (
      <Card className="mt-2 border-0">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={getStatusVariant(job.status)}>
                {getStatusLabel(job.status)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Job Status
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="w-6 h-6" />
              <span>@{job.worker?.profiles?.[0]?.username || 'Unknown'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Full view for participants
  return (
    <Card className="mt-2 border-0 relative">
      {isRefreshing && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Refreshing...</span>
          </div>
        </div>
      )}
      <CardContent className="py-4 space-y-4">
        {/* Worker-specific status message banner */}
        {isWorker && (
          <WorkerStatusBanner status={job.status} />
        )}

        {/* Owner/Manager status message banner */}
        {!isWorker && (userRole === 'OWNER' || userRole === 'MANAGER') && (
          <OwnerStatusBanner status={job.status} workerName={job.worker?.profiles?.[0]?.username || 'Worker'} />
        )}

        {/* Worker's Submission Notes */}
        {job.requesterNotes && job.requesterNotes.length > 0 && (
          <div>
            <Label className="text-sm font-semibold">Worker&apos;s Submission:</Label>
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
            <Label className="text-sm font-semibold">Reviewer&apos;s Feedback:</Label>
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
        <div className="flex flex-wrap gap-2 pt-2">
          {/* Worker Actions */}
          {isWorker && job.status === 'IN_PROGRESS' && (
            <Button
              size="sm"
              variant="default"
              onClick={onSubmitWork}
              disabled={isLoading}
              className="flex-1"
            >
              Submit for Review
            </Button>
          )}

          {isWorker && job.status === 'SUBMITTED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAsyncAction(onWithdraw)}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Withdrawing...' : 'Withdraw Submission'}
            </Button>
          )}

          {isWorker && job.status === 'VALIDATING' && (
            <Button
              size="sm"
              variant="default"
              onClick={onSubmitWork}
              disabled={isLoading}
              className="flex-1"
            >
              Revise and Resubmit
            </Button>
          )}

          {/* Owner/Manager Actions */}
          {(userRole === 'OWNER' || userRole === 'MANAGER') && job.status === 'REQUESTED' && !isWorker && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => handleAsyncAction(onApprove)}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? 'Approving...' : 'Approve Request'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleAsyncAction(onReject)}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? 'Rejecting...' : 'Reject Request'}
              </Button>
            </>
          )}

          {(userRole === 'OWNER' || userRole === 'MANAGER') && job.status === 'SUBMITTED' && !isWorker && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={onValidate}
                disabled={isLoading}
              >
                Review & Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onRequestChanges}
                disabled={isLoading}
              >
                Request Changes
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleAsyncAction(onReject)}
                disabled={isLoading}
              >
                {isLoading ? 'Rejecting...' : 'Reject'}
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
