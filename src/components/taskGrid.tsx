'use client'

import React, { useMemo, useCallback, useState, useContext } from 'react'
import { OptionsMenuItem } from '@/components/optionsButton'
import { Circle, Minus, Plus, Eye, EyeOff, Edit, Send, Clock, Trash2 } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { GlobalContext } from '@/lib/contexts'
import { TaskItem } from '@/components/taskItem'
import { TaskStatus, STATUS_OPTIONS, getStatusColor, getIconColor, getTaskKey, getTaskStatus } from '@/lib/utils/taskUtils'
import { useTaskStatuses } from '@/lib/hooks/useTaskStatuses'
import { useTaskHandlers } from '@/lib/hooks/useTaskHandlers'
import { AddTaskForm } from '@/views/forms/addTaskForm'
import { JobDetailsCard } from '@/components/jobDetailsCard'
import { JobDialog, JobDialogMode } from '@/components/jobDialog'
import { DeleteTaskDialog } from '@/components/deleteTaskDialog'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import type { JobWithRelations, UserRole } from '@/lib/services/job/types'

interface TaskGridProps {
  tasks: any[]
  selectedTaskList: any
  collabProfiles: Record<string, string>
  date: string
  userId: string
  jobs?: any[]
  onRefresh: () => Promise<void>
  onRefreshUser: () => Promise<void>
  onRefreshTasks?: () => Promise<void>
}

interface JobDialogState {
  mode: JobDialogMode
  job?: JobWithRelations
  task?: any
}

export const TaskGrid = ({
  tasks,
  selectedTaskList,
  collabProfiles,
  date,
  userId,
  jobs = [],
  onRefresh,
  onRefreshUser,
  onRefreshTasks,
}: TaskGridProps) => {
  const { t } = useI18n()
  const { revealRedacted } = useContext(GlobalContext)

  const [editingTask, setEditingTask] = useState<any>(null)
  const [jobDialog, setJobDialog] = useState<JobDialogState | null>(null)
  const [requestReviewDialog, setRequestReviewDialog] = useState<{ job: any; task: any } | null>(null)
  const [deleteTask, setDeleteTask] = useState<any>(null)
  const [refreshingJobId, setRefreshingJobId] = useState<string | null>(null)

  const { taskStatuses, setTaskStatuses } = useTaskStatuses({
    tasks,
    selectedTaskListId: selectedTaskList?.id,
    date,
  })

  const {
    handleTaskClick,
    handleStatusChange,
    handleIncrementTimes,
    handleDecrementTimes,
    handleDecrementCount,
    handleToggleRedacted,
    updateJob,
  } = useTaskHandlers({
    taskListId: selectedTaskList?.id,
    date,
    userId,
    selectedTaskList,
    onRefresh,
    onRequestWork: (task) => setJobDialog({ mode: 'request', task }),
  })

  const getUserRole = useCallback((): UserRole => {
    const users = Array.isArray(selectedTaskList?.users) ? selectedTaskList.users : []
    const userEntry = users.find((u: any) => u.userId === userId)
    return userEntry?.role || 'COLLABORATOR'
  }, [selectedTaskList, userId])

  // Sort tasks by status order
  const sortedTasks = useMemo(() => {
    const getStatusForSort = (task: any): TaskStatus => {
      const key = getTaskKey(task)
      return taskStatuses[key] || getTaskStatus(task) || 'open'
    }

    return [...tasks].sort((a: any, b: any) => {
      const aStatusIndex = STATUS_OPTIONS.indexOf(getStatusForSort(a))
      const bStatusIndex = STATUS_OPTIONS.indexOf(getStatusForSort(b))
      if (aStatusIndex !== bStatusIndex) {
        return aStatusIndex - bStatusIndex
      }
      const aDone = getStatusForSort(a) === 'done' || getStatusForSort(a) === 'completed'
      const bDone = getStatusForSort(b) === 'done' || getStatusForSort(b) === 'completed'
      if (aDone === bDone) return 0
      return aDone ? 1 : -1
    })
  }, [tasks, taskStatuses])

  // Job dialog actions
  const handleRequestSubmit = useCallback(
    async (justification: string) => {
      if (!jobDialog?.task?.id) return
      await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: jobDialog.task.id,
          listId: selectedTaskList?.id,
          workerId: userId,
          occurrenceDate: date,
          justification,
        }),
      })
      await onRefresh()
    },
    [jobDialog, selectedTaskList?.id, userId, date, onRefresh]
  )

  const handleSubmitWork = useCallback(
    async (data: { noteContent: string; selfReview: number }) => {
      if (!jobDialog?.job) return
      setRefreshingJobId(jobDialog.job.id)
      try {
        await updateJob(jobDialog.job.id, {
          status: 'SUBMITTED',
          requesterNoteContent: data.noteContent,
          selfReview: data.selfReview,
        })
      } finally {
        setRefreshingJobId(null)
      }
    },
    [jobDialog, updateJob]
  )

  const handleReviewWork = useCallback(
    async (data: { action: 'accept' | 'validate' | 'reject'; reviewNoteContent?: string; managerReview?: number }) => {
      if (!jobDialog?.job) return
      const statusMap: Record<string, string> = {
        accept: 'ACCEPTED',
        validate: 'VALIDATING',
        reject: 'REJECTED',
      }
      setRefreshingJobId(jobDialog.job.id)
      try {
        await updateJob(jobDialog.job.id, {
          status: statusMap[data.action],
          reviewerNoteContent: data.reviewNoteContent,
          managerReview: data.managerReview,
        })
      } finally {
        setRefreshingJobId(null)
      }
    },
    [jobDialog, updateJob]
  )

  const handleWithdraw = useCallback(
    async (jobId: string) => {
      setRefreshingJobId(jobId)
      try {
        await updateJob(jobId, { status: 'IN_PROGRESS' })
      } finally {
        setRefreshingJobId(null)
      }
    },
    [updateJob]
  )

  // Approve/reject a pending work request from the request-review dialog
  const handleRequestReview = useCallback(
    async (action: 'approve' | 'reject') => {
      if (!requestReviewDialog?.job) return
      setRefreshingJobId(requestReviewDialog.job.id)
      try {
        await updateJob(requestReviewDialog.job.id, {
          status: action === 'approve' ? 'IN_PROGRESS' : 'REJECTED'
        })
      } finally {
        setRefreshingJobId(null)
      }
    },
    [requestReviewDialog, updateJob]
  )

  return (
    <>
      <AddTaskForm
        open={editingTask !== null}
        onOpenChange={(open) => { if (!open) setEditingTask(null) }}
        selectedTaskListId={selectedTaskList?.id}
        editTask={editingTask}
        onCreated={async () => {
          await onRefresh()
          if (onRefreshTasks) await onRefreshTasks()
        }}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
        {sortedTasks.map((task: any) => {
          const key = getTaskKey(task)
          const taskStatus = taskStatuses[key] || getTaskStatus(task)
          const isDone = taskStatus === 'done' || taskStatus === 'completed'

          // Jobs for this task (API returns them newest-first)
          const taskJobs = jobs.filter((j: any) => j.taskId === task.id)
          const activeJob = taskJobs.find(
            (j: any) => !['ACCEPTED', 'REJECTED', 'CANCELLED'].includes(j.status)
          ) || null
          const latestJob = taskJobs[0] || null
          const acceptedJob = taskJobs.find((j: any) => j.status === 'ACCEPTED') || null
          // All pending work requests (several users may request the same task)
          const pendingRequests = taskJobs.filter((j: any) => j.status === 'REQUESTED')

          // Financials come from the accepted job (factored) or the API task payload
          const taskPremium = acceptedJob?.premium ?? task.premium ?? 0
          const taskTotalGains = acceptedJob?.totalGains ?? task.totalGains ?? taskPremium

          const lastCompleter = Array.isArray(task?.completers) && task.completers.length > 0
            ? task.completers[task.completers.length - 1]
            : undefined

          const users = Array.isArray(selectedTaskList?.users) ? selectedTaskList.users : []
          const collaborators = users.filter((u: any) => u.role === 'COLLABORATOR' || u.role === 'MANAGER')
          const hasCollaborators = collaborators.length > 0

          const completerName = latestJob
            ? (latestJob.worker?.profiles?.[0]?.username || collabProfiles[String(latestJob.workerId)] || String(latestJob.workerId))
            : lastCompleter
              ? (collabProfiles[String(lastCompleter.id)] || String(lastCompleter.id))
              : null

          const userRole = getUserRole()
          const isOwnerOrManager = userRole === 'OWNER' || userRole === 'MANAGER'
          const isWorker = activeJob?.workerId === userId
          const approvedJobStatuses = ['IN_PROGRESS', 'SUBMITTED', 'VALIDATING', 'ACCEPTED']
          const hasApprovedJob = isWorker && activeJob && approvedJobStatuses.includes(activeJob.status)
          const canChangeStatus = isOwnerOrManager || hasApprovedJob

          // Build the options menu
          const optionsMenuItems: OptionsMenuItem[] = [
            ...(canChangeStatus ? STATUS_OPTIONS.map((status) => ({
              label: (
                <>
                  <Circle
                    className="h-4 w-4"
                    style={{ fill: getStatusColor(status), color: getStatusColor(status) }}
                  />
                  <span className="ml-2">{t(`tasks.status.${status}`)}</span>
                </>
              ),
              onClick: () => handleStatusChange(task, status),
              icon: null,
            })) : []),
            {
              label: t('tasks.edit', { defaultValue: 'Edit' }),
              onClick: () => setEditingTask(task),
              icon: <Edit className="h-4 w-4" />,
              separator: true,
            },
            {
              label: t('tasks.incrementTimes', { defaultValue: 'Increment times' }),
              onClick: () => handleIncrementTimes(task),
              icon: <Plus className="h-4 w-4" />,
            },
            {
              label: t('tasks.decrementTimes', { defaultValue: 'Decrement times' }),
              onClick: () => handleDecrementTimes(task),
              icon: <Minus className="h-4 w-4" />,
            },
            {
              label: task?.redacted ? t('tasks.markAsNotSensitive', { defaultValue: 'Mark as not sensitive' }) : t('tasks.markAsSensitive', { defaultValue: 'Mark as sensitive' }),
              onClick: () => handleToggleRedacted(task),
              icon: task?.redacted ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
              separator: true,
            },
            ...((task.times || 1) > 1 && (task.dateCount || 0) > 0
              ? [
                  {
                    label: t('tasks.decrementCount', { defaultValue: 'Decrement count' }),
                    onClick: () => handleDecrementCount(task),
                    icon: <Minus className="h-4 w-4" />,
                  },
                ]
              : []),
            {
              label: t('tasks.delete', { defaultValue: 'Delete...' }),
              onClick: () => setDeleteTask(task),
              icon: <Trash2 className="h-4 w-4" />,
              separator: true,
            },
          ]

          // Job workflow menu items
          const jobMenuItems: OptionsMenuItem[] = []
          if (userRole === 'COLLABORATOR' && !activeJob && !isDone) {
            jobMenuItems.push({
              label: t('tasks.requestToWork', { defaultValue: 'Request to Work' }),
              onClick: () => setJobDialog({ mode: 'request', task }),
              icon: <Send className="h-4 w-4" />,
              separator: true,
            })
          }
          if (isWorker && (activeJob?.status === 'IN_PROGRESS' || activeJob?.status === 'VALIDATING')) {
            jobMenuItems.push({
              label: activeJob.status === 'VALIDATING'
                ? t('tasks.resubmitWork', { defaultValue: 'Revise and Resubmit' })
                : t('tasks.submitForReview', { defaultValue: 'Submit for Review' }),
              onClick: () => setJobDialog({ mode: 'submit', job: activeJob, task }),
              icon: <Send className="h-4 w-4" />,
              separator: true,
            })
          }
          if (isWorker && activeJob?.status === 'REQUESTED') {
            jobMenuItems.push({
              label: t('tasks.requestPending', { defaultValue: 'Request Pending...' }),
              onClick: () => {},
              icon: <Clock className="h-4 w-4" />,
              disabled: true,
            })
          }

          const finalOptionsMenuItems = [...optionsMenuItems, ...jobMenuItems]

          return (
            <div key={`task__container--${key}`} className="flex flex-col">
              <TaskItem
                key={`task__item--${key}`}
                task={task}
                taskStatus={taskStatus}
                statusColor={getStatusColor(taskStatus, 'css')}
                iconColor={getIconColor(taskStatus)}
                optionsMenuItems={finalOptionsMenuItems}
                onClick={() => {
                  // Collaborators must justify their request first
                  if (userRole === 'COLLABORATOR' && !activeJob && !isDone) {
                    setJobDialog({ mode: 'request', task })
                  } else {
                    handleTaskClick(task)
                  }
                }}
                revealRedacted={revealRedacted}
                showCompleterBadge={true}
                completerName={completerName}
                taskPremium={taskPremium}
                taskTotalGains={taskTotalGains}
                hasCollaborators={hasCollaborators}
                variant={isDone ? 'default' : 'outline'}
                latestJob={latestJob}
                isOwnerOrManager={isOwnerOrManager}
                isCurrentUserWorker={isWorker}
              />
              {/* Pending work requests: owners/managers see every request as a
                  collapsible accordion item and review it in a detail dialog */}
              {isOwnerOrManager && pendingRequests.length > 0 && (
                <Accordion type="multiple" className="mt-2 border rounded-md px-3">
                  {pendingRequests.map((reqJob: any) => {
                    const requesterName =
                      reqJob.worker?.profiles?.[0]?.username ||
                      collabProfiles[String(reqJob.workerId)] ||
                      String(reqJob.workerId)
                    return (
                      <AccordionItem key={reqJob.id} value={reqJob.id} className="border-b last:border-b-0">
                        <AccordionTrigger className="py-2 text-sm hover:no-underline">
                          <span className="flex items-center gap-2">
                            <span className="font-medium">@{requesterName}</span>
                            {reqJob.occurrenceDate && (
                              <span className="text-muted-foreground">{reqJob.occurrenceDate}</span>
                            )}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-2 space-y-2">
                          {reqJob.justification && (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                              {reqJob.justification}
                            </p>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRequestReviewDialog({ job: reqJob, task })}
                          >
                            {t('tasks.reviewRequest', { defaultValue: 'Review request' })}
                          </Button>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              )}

              {activeJob && !(isOwnerOrManager && activeJob.status === 'REQUESTED') && (
                <JobDetailsCard
                  job={activeJob}
                  userRole={userRole}
                  isParticipant={isOwnerOrManager || isWorker || activeJob.reviewerIds?.includes(userId)}
                  isWorker={isWorker}
                  isRefreshing={refreshingJobId === activeJob.id}
                  onApprove={() => handleWithdraw(activeJob.id)}
                  onReject={() => updateJob(activeJob.id, { status: 'REJECTED' })}
                  onValidate={() => setJobDialog({ mode: 'review', job: activeJob })}
                  onWithdraw={() => handleWithdraw(activeJob.id)}
                  onRequestChanges={() => setJobDialog({ mode: 'review', job: activeJob })}
                  onSubmitWork={() => setJobDialog({ mode: 'submit', job: activeJob, task })}
                />
              )}
            </div>
          )
        })}
      </div>

      <JobDialog
        open={jobDialog !== null}
        onOpenChange={(open) => { if (!open) setJobDialog(null) }}
        mode={jobDialog?.mode || 'request'}
        taskName={jobDialog?.task?.name}
        isResubmit={jobDialog?.job?.status === 'VALIDATING'}
        isSubmitting={refreshingJobId !== null}
        onRequest={handleRequestSubmit}
        onSubmit={handleSubmitWork}
        onReview={handleReviewWork}
      />

      <JobDialog
        open={requestReviewDialog !== null}
        onOpenChange={(open) => { if (!open) setRequestReviewDialog(null) }}
        mode="requestReview"
        taskName={requestReviewDialog?.task?.name}
        requestJob={requestReviewDialog?.job}
        isSubmitting={refreshingJobId !== null}
        onRequest={handleRequestSubmit}
        onSubmit={handleSubmitWork}
        onReview={handleReviewWork}
        onRequestReview={handleRequestReview}
      />

      <DeleteTaskDialog
        open={deleteTask !== null}
        onOpenChange={(open) => { if (!open) setDeleteTask(null) }}
        task={deleteTask}
        date={date}
        onDeleted={async () => {
          await onRefresh()
          await onRefreshUser()
        }}
      />
    </>
  )
}
