'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User as UserIcon, Clock, Send, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { OptionsButton, OptionsMenuItem } from '@/components/optionsButton'

type TaskStatus = 'in progress' | 'steady' | 'ready' | 'open' | 'done' | 'ignored' | 'completed'
type JobStatus = 'REQUESTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'VALIDATING' | 'ACCEPTED' | 'REJECTED'

interface TaskItemProps {
  task: any
  taskStatus: TaskStatus
  statusColor: string
  iconColor: string
  optionsMenuItems: OptionsMenuItem[]
  onClick: () => void
  revealRedacted: boolean
  showCompleterBadge?: boolean
  completerName?: string | null
  taskEarnings?: number
  taskPrize?: number
  hasCollaborators?: boolean
  className?: string
  variant?: 'default' | 'outline'
  latestJob?: any
  hasPendingJobs?: boolean
  // New props for ownership and job status display
  isOwnerOrManager?: boolean
  ownerUsername?: string | null
  userJobStatus?: JobStatus | null
  isCurrentUserWorker?: boolean
  isPendingRequest?: boolean
}

// Get job status badge configuration
function getJobStatusBadge(status: JobStatus): { label: string; className: string; icon: React.ReactNode } | null {
  const configs: Record<JobStatus, { label: string; className: string; icon: React.ReactNode }> = {
    REQUESTED: {
      label: 'Requested',
      className: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700',
      icon: <Clock className="h-3 w-3 mr-1" />,
    },
    IN_PROGRESS: {
      label: 'In Progress',
      className: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-800',
      icon: <AlertCircle className="h-3 w-3 mr-1" />,
    },
    SUBMITTED: {
      label: 'Pending Review',
      className: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-800',
      icon: <Send className="h-3 w-3 mr-1" />,
    },
    VALIDATING: {
      label: 'Changes Requested',
      className: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-800',
      icon: <AlertCircle className="h-3 w-3 mr-1" />,
    },
    ACCEPTED: {
      label: 'Accepted',
      className: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-800',
      icon: <CheckCircle className="h-3 w-3 mr-1" />,
    },
    REJECTED: {
      label: 'Rejected',
      className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200 dark:border-red-800',
      icon: <XCircle className="h-3 w-3 mr-1" />,
    },
  }
  return configs[status] || null
}

export const TaskItem = ({
  task,
  taskStatus,
  statusColor,
  iconColor,
  optionsMenuItems,
  onClick,
  revealRedacted,
  showCompleterBadge = false,
  completerName,
  taskEarnings = 0,
  taskPrize = 0,
  hasCollaborators = false,
  className = '',
  variant = 'outline',
  latestJob,
  hasPendingJobs = false,
  isOwnerOrManager = true,
  ownerUsername,
  userJobStatus,
  isCurrentUserWorker = false,
  isPendingRequest = false,
}: TaskItemProps) => {
  const key = task?.id || task?.localeKey || task?.name
  const isDone = taskStatus === 'done' || taskStatus === 'completed' || (task?.count || 0) >= (task?.times || 1)
  const taskPremium = taskEarnings + taskPrize

  return (
    <div key={`task__item--${key}`} className={`flex flex-col w-full ${className}`}>
      {/* Task Button */}
      <Button
        variant={variant}
        className={`rounded-md leading-7 text-sm min-h-[40px] h-auto w-full whitespace-normal break-words py-2 flex items-center gap-2 justify-start ${className}`}
        onClick={onClick}
        aria-label={(task?.redacted === true && !revealRedacted) ? 'Redacted task' : (task.displayName || task.name)}
      >
        <OptionsButton
          items={optionsMenuItems}
          statusColor={statusColor}
          iconColor={iconColor}
          iconFilled={taskStatus === "done" || taskStatus === "completed"}
          align="start"
        />
        <span className="flex-1 text-left">
          {task.times > 1 ? `${task.count || 0}/${task.times} ` : ''}
          {(task?.redacted === true && !revealRedacted) ? '·····' : (task.displayName || task.name)}
        </span>
        {/* Show premium badge if there's budget allocated */}
        {taskPremium > 0 && (
          <Badge variant="outline" className="ml-auto bg-green-50 text-green-700 border-green-200 text-xs">
            ${taskPremium.toFixed(2)}
          </Badge>
        )}
      </Button>

      {/* Status Badges Section - appears below button */}
      <div className="flex flex-col gap-1 mt-1.5 pl-1">
        {/* Completer badge for completed tasks */}
        {showCompleterBadge && isDone && hasCollaborators && completerName && (
          <Badge variant="secondary" className="w-fit bg-muted text-muted-foreground border-muted">
            <UserIcon className="h-3 w-3 mr-1" />
            @{completerName}{taskEarnings > 0 ? `: $${taskEarnings.toFixed(2)}` : ''}
          </Badge>
        )}

        {/* Task ownership indicator - tap to request hint for non-owners */}
        {!isOwnerOrManager && ownerUsername && !latestJob && !isDone && !isPendingRequest && (
          <div className="flex flex-col gap-0.5">
            <Badge variant="outline" className="w-fit bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
              <UserIcon className="h-3 w-3 mr-1" />
              Owned by @{ownerUsername}
            </Badge>
            <span className="text-xs text-muted-foreground italic">Tap to request to work on this task</span>
          </div>
        )}

        {/* Pending job request indicator */}
        {isPendingRequest && (
          <Badge variant="secondary" className="w-fit bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Sending request...
          </Badge>
        )}

        {/* Job status badge for active jobs - with worker-specific messaging */}
        {latestJob && !['ACCEPTED', 'REJECTED'].includes(latestJob.status) && (() => {
          const badgeConfig = getJobStatusBadge(latestJob.status)
          if (!badgeConfig) return null

          // Worker-specific status messages
          const workerMessages: Record<JobStatus, string | null> = {
            REQUESTED: 'Your request is being reviewed',
            IN_PROGRESS: 'You can now work on this task',
            SUBMITTED: 'Awaiting review from owner',
            VALIDATING: 'Changes have been requested',
            ACCEPTED: null,
            REJECTED: 'Your submission was rejected',
          }

          const workerMessage = isCurrentUserWorker ? workerMessages[latestJob.status as JobStatus] : null

          return (
            <div className="flex flex-col gap-0.5">
              <Badge variant="secondary" className={`w-fit ${badgeConfig.className}`}>
                {badgeConfig.icon}
                {badgeConfig.label}
              </Badge>
              {workerMessage && (
                <span className="text-xs text-muted-foreground italic">{workerMessage}</span>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

