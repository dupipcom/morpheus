'use client'

import React, { useMemo, useCallback, useState, useContext, useEffect, useRef } from 'react'
import { OptionsMenuItem } from '@/components/optionsButton'
import { Circle, Minus, Plus, Eye, EyeOff, Edit, Send, Clock, Trash2 } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { GlobalContext } from '@/lib/contexts'
import { TaskItem } from '@/components/taskItem'
import { TaskStatus, STATUS_OPTIONS, getStatusColor, getIconColor, getTaskEntryKey, getTaskStatus } from '@/lib/utils/taskUtils'
import { useTaskStatuses } from '@/lib/hooks/useTaskStatuses'
import { useTaskHandlers } from '@/lib/hooks/useTaskHandlers'
import { AddTaskForm } from '@/views/forms/addTaskForm'
import { JobDetailsCard } from '@/components/jobDetailsCard'
import { JobDialog, JobDialogMode } from '@/components/jobDialog'
import { DeleteTaskDialog } from '@/components/deleteTaskDialog'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { attachmentFileUrl } from '@/components/attachmentPicker'
import type { JobWithRelations, UserRole } from '@/lib/services/job/types'

interface TaskGridProps {
  tasks: any[]
  selectedTaskList: any
  collabProfiles: Record<string, string>
  date: string
  userId: string
  jobs?: any[]
  /** Deep-linked task id (/app/do/list/{id}/{taskId}): shown first + highlighted */
  initialTaskId?: string
  onRefresh: () => Promise<void>
  onRefreshUser: () => Promise<void>
  onRefreshTasks?: () => Promise<void>
  /** Past-day occurrences still pending/under review, newest first */
  pastEntries?: Array<{
    task: any
    jobs: any[]
    occurrenceDate: string
    dateStatus?: string
    dateCount?: number
  }>
  hasMorePast?: boolean
  isLoadingPast?: boolean
  onLoadPastOlder?: () => void
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
  initialTaskId,
  onRefresh,
  onRefreshUser,
  onRefreshTasks,
  pastEntries = [],
  hasMorePast = false,
  isLoadingPast = false,
  onLoadPastOlder,
}: TaskGridProps) => {
  const { t } = useI18n()
  const { revealRedacted } = useContext(GlobalContext)

  const [editingTask, setEditingTask] = useState<any>(null)
  const [jobDialog, setJobDialog] = useState<JobDialogState | null>(null)
  const [requestReviewDialog, setRequestReviewDialog] = useState<{ job: any; task: any } | null>(null)
  const [deleteTask, setDeleteTask] = useState<any>(null)
  const [refreshingJobId, setRefreshingJobId] = useState<string | null>(null)
  // Optimistic counter/times overlays keyed by entry key (taskId:occurrenceDate);
  // dropped on server consolidation (the status-map init effect rebuilds).
  const [countOverlays, setCountOverlays] = useState<Record<string, { dateCount?: number; times?: number }>>({})

  const { taskStatuses } = useTaskStatuses({
    tasks,
    selectedTaskListId: selectedTaskList?.id,
    date,
  })

  const {
    pendingKeys,
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
    onOptimistic: (key, patch) =>
      setCountOverlays((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } })),
    onOptimisticRevert: (key) =>
      setCountOverlays((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      }),
  })

  const getUserRole = useCallback((): UserRole => {
    const users = Array.isArray(selectedTaskList?.users) ? selectedTaskList.users : []
    const userEntry = users.find((u: any) => u.userId === userId)
    return userEntry?.role || 'COLLABORATOR'
  }, [selectedTaskList, userId])

  // Effective status for a card: the optimistic overlay wins (derived from the
  // patched count/times, mirroring the server's deriveDateStatus); otherwise
  // the server-derived map, then the task payload.
  const getEffectiveStatus = useCallback(
    (task: any): TaskStatus => {
      const key = getTaskEntryKey(task, date)
      const overlay = countOverlays[key]
      if (overlay) {
        const count = overlay.dateCount ?? task.dateCount ?? 0
        const times = overlay.times ?? task.times ?? 1
        if (count >= times) return 'done'
        if (count > 0) return 'in progress'
        return 'open'
      }
      return taskStatuses[key] || getTaskStatus(task) || 'open'
    },
    [countOverlays, taskStatuses, date]
  )

  // Sort tasks by status order. Each task's status index is derived at most
  // once per pass (per-key cache), so the comparator is two Map lookups and
  // never re-derives status mid-comparison. A deep-linked task (initialTaskId)
  // is boosted to the very front regardless of status.
  const sortedTasks = useMemo(() => {
    const indexCache = new Map<string, number>()
    const indexFor = (task: any): number => {
      if (initialTaskId && task.id === initialTaskId) return -1
      const key = getTaskEntryKey(task, date)
      let idx = indexCache.get(key)
      if (idx === undefined) {
        idx = STATUS_OPTIONS.indexOf(getEffectiveStatus(task))
        indexCache.set(key, idx)
      }
      return idx
    }

    return [...tasks].sort((a: any, b: any) => indexFor(a) - indexFor(b))
  }, [tasks, getEffectiveStatus, date, initialTaskId])

  // Deep link: once the tasks for the (already resolved) date are rendered,
  // scroll the deeplinked card into view and ring-highlight it briefly.
  const deepLinkHandledRef = useRef(false)
  useEffect(() => {
    if (!initialTaskId || deepLinkHandledRef.current || tasks.length === 0) return
    const el = document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(initialTaskId)}"]`)
    if (!el) return
    deepLinkHandledRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-primary', 'rounded-lg')
    const timer = setTimeout(() => {
      el.classList.remove('ring-2', 'ring-primary', 'rounded-lg')
    }, 2500)
    return () => clearTimeout(timer)
  }, [initialTaskId, tasks])

  // Job dialog actions
  const handleRequestSubmit = useCallback(
    async (justification: string, documentIds: string[]) => {
      if (!jobDialog?.task?.id) return
      const body: Record<string, unknown> = {
        taskId: jobDialog.task.id,
        listId: selectedTaskList?.id,
        workerId: userId,
        occurrenceDate: jobDialog.task.pastOccurrenceDate || date,
        justification,
      }
      if (documentIds.length > 0) body.documentIds = documentIds
      await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await onRefresh()
    },
    [jobDialog, selectedTaskList?.id, userId, date, onRefresh]
  )

  const handleSubmitWork = useCallback(
    async (data: { noteContent: string; selfReview: number; documentIds?: string[]; location?: any }) => {
      if (!jobDialog?.job) return
      setRefreshingJobId(jobDialog.job.id)
      try {
        // Evidence documents replace the job's documentIds (PUT semantics), so
        // merge with the existing ones (e.g. the CV attached at request time).
        const existingIds = Array.isArray(jobDialog.job.documentIds) ? jobDialog.job.documentIds : []
        const mergedIds = Array.from(new Set([...existingIds, ...(data.documentIds || [])]))

        const update: Record<string, unknown> = {
          status: 'SUBMITTED',
          requesterNoteContent: data.noteContent,
          selfReview: data.selfReview,
        }
        if (mergedIds.length > 0) update.documentIds = mergedIds
        if (data.location) update.location = data.location

        await updateJob(jobDialog.job.id, update)
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

  // Renders one task card (today's or a past occurrence). Past cards pass
  // their own occurrence-scoped jobs and a date badge. `key` is the entry key
  // (taskId:occurrenceDate) — used for optimistic overlays and pending state.
  const renderTaskCard = (
    task: any,
    key: string,
    taskJobs: any[],
    taskStatus: TaskStatus,
    occurrenceDate?: string
  ) => {
    const isDone = taskStatus === 'done' || taskStatus === 'completed'
    // Optimistic counter/times overlay patches what TaskItem renders
    const displayTask = countOverlays[key] ? { ...task, ...countOverlays[key] } : task
    const isPending = pendingKeys.has(key)

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
    // REQUESTED jobs are surfaced to owners/managers in the pending-requests
    // accordion below; the TaskItem's job badge must not duplicate that entry.
    const taskItemLatestJob =
      isOwnerOrManager && latestJob?.status === 'REQUESTED' ? null : latestJob
    const isWorker = activeJob?.workerId === userId
    const approvedJobStatuses = ['IN_PROGRESS', 'SUBMITTED', 'VALIDATING', 'ACCEPTED']
    const hasApprovedJob = isWorker && activeJob && approvedJobStatuses.includes(activeJob.status)
    const canChangeStatus = isOwnerOrManager || hasApprovedJob

    // Past occurrences of recurring tasks only offer occurrence-scoped
    // statuses: a global status write would change every other date's entry
    // of the task, including today's.
    const isPastCard = !!occurrenceDate
    const isRecurringTask = !!task.rrule
    const statusMenuOptions = isPastCard && isRecurringTask
      ? STATUS_OPTIONS.filter((status) => status === 'open' || status === 'done')
      : STATUS_OPTIONS

    // Build the options menu
    const optionsMenuItems: OptionsMenuItem[] = [
      ...(canChangeStatus ? statusMenuOptions.map((status) => ({
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
      ...((task.times || 1) > 1 && (task.dateCount || 0) > 0 && isOwnerOrManager
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
      <div key={`task__container--${key}`} className="flex flex-col" data-task-id={displayTask.id}>
        <TaskItem
          key={`task__item--${key}`}
          task={displayTask}
          taskStatus={taskStatus}
          isPending={isPending}
          statusColor={getStatusColor(taskStatus, 'css')}
          iconColor={getIconColor(taskStatus)}
          optionsMenuItems={finalOptionsMenuItems}
          onClick={() => {
            // Collaborators must justify their request first
            if (userRole === 'COLLABORATOR' && !activeJob && !isDone) {
              setJobDialog({ mode: 'request', task })
            } else {
              handleTaskClick(task, occurrenceDate)
            }
          }}
          revealRedacted={revealRedacted}
          showCompleterBadge={true}
          completerName={completerName}
          taskPremium={taskPremium}
          taskTotalGains={taskTotalGains}
          hasCollaborators={hasCollaborators}
          variant={isDone ? 'default' : 'outline'}
          latestJob={taskItemLatestJob}
          isOwnerOrManager={isOwnerOrManager}
          isCurrentUserWorker={isWorker}
          dateBadge={occurrenceDate
            ? t('tasks.pastBadge', { date: occurrenceDate, defaultValue: `Past · ${occurrenceDate}` })
            : undefined}
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
                    {Array.isArray(reqJob.documentIds) && reqJob.documentIds.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('jobs.attachedDocuments', { defaultValue: 'Attached documents' })}
                        </span>
                        {reqJob.documentIds.map((docId: string, index: number) => (
                          <a
                            key={docId}
                            href={attachmentFileUrl(docId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-sm text-primary underline underline-offset-2 hover:no-underline"
                          >
                            {t('jobs.viewDocument', { defaultValue: 'View document' })} {index + 1}
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRequestReviewDialog({ job: reqJob, task })}
                      >
                        {t('tasks.review', { defaultValue: 'Review' })}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={refreshingJobId === reqJob.id}
                        onClick={async () => {
                          setRefreshingJobId(reqJob.id)
                          try {
                            await updateJob(reqJob.id, { status: 'REJECTED' })
                          } finally {
                            setRefreshingJobId(null)
                          }
                        }}
                      >
                        {t('tasks.decline', { defaultValue: 'Decline' })}
                      </Button>
                    </div>
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
  }

  return (
    <>
      <AddTaskForm
        open={editingTask !== null}
        onOpenChange={(open) => { if (!open) setEditingTask(null) }}
        selectedTaskListId={selectedTaskList?.id}
        editTask={editingTask}
        jobBoardEnabled={selectedTaskList?.jobBoardEnabled === true}
        onCreated={async () => {
          await onRefresh()
          if (onRefreshTasks) await onRefreshTasks()
        }}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
        {sortedTasks.map((task: any) => {
          const key = getTaskEntryKey(task, date)
          const taskStatus = getEffectiveStatus(task)
          // Jobs for this task (API returns them newest-first)
          const taskJobs = jobs.filter((j: any) => j.taskId === task.id)
          return renderTaskCard(task, key, taskJobs, taskStatus)
        })}

        {/* Past-day occurrences still pending / under review, merged into
            the same grid after today's tasks. They read through the same
            entry-keyed status map/overlay (pastOccurrenceDate precedence). */}
        {pastEntries.map((entry: any) => {
          const pastTask = {
            ...entry.task,
            pastOccurrenceDate: entry.occurrenceDate,
            dateStatus: entry.dateStatus,
            dateCount: entry.dateCount,
          }
          const key = getTaskEntryKey(pastTask, date)
          const taskStatus = getEffectiveStatus(pastTask)
          return renderTaskCard(pastTask, key, entry.jobs || [], taskStatus, entry.occurrenceDate)
        })}
      </div>

      {hasMorePast && (
        <div className="flex justify-center py-4">
          <Button variant="outline" onClick={onLoadPastOlder} disabled={isLoadingPast}>
            {isLoadingPast
              ? t('tasks.loadingOlder', { defaultValue: 'Loading...' })
              : t('tasks.loadOlder', { defaultValue: 'Load older tasks' })}
          </Button>
        </div>
      )}

      <JobDialog
        open={jobDialog !== null}
        onOpenChange={(open) => { if (!open) setJobDialog(null) }}
        mode={jobDialog?.mode || 'request'}
        taskName={jobDialog?.task?.name}
        isResubmit={jobDialog?.job?.status === 'VALIDATING'}
        isSubmitting={refreshingJobId !== null}
        job={jobDialog?.job}
        userId={userId}
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
        date={deleteTask?.pastOccurrenceDate || date}
        onDeleted={async () => {
          await onRefresh()
          await onRefreshUser()
        }}
      />
    </>
  )
}
