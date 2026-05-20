'use client'

import React, { useMemo, useCallback, useState, useContext } from 'react'
import { OptionsMenuItem } from '@/components/optionsButton'
import { Circle, Minus, Plus, Eye, EyeOff, Edit, Send, Clock } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { GlobalContext } from '@/lib/contexts'
import { calculatePrizePool, applyPremiumFactors, PremiumFactorSettings } from '@/lib/utils/earningsUtils'
import { getTaskAllocationFromDistribution, convertEntityAllocationsToMaps } from '@/lib/utils/budgetDistributionUtils'
import { TaskItem } from '@/components/taskItem'
import { TaskStatus, STATUS_OPTIONS, getStatusColor, getIconColor, getTaskKey, getTaskStatus, mapStatusToEnum } from '@/lib/utils/taskUtils'

function calculateNewStatus(count: number, times: number, existingStatus?: string): string {
  if (count >= times) return 'DONE'
  if (count > 0) {
    if (!existingStatus || existingStatus === 'done' || existingStatus === 'open') {
      return 'IN_PROGRESS'
    }
    return mapStatusToEnum(existingStatus)
  }
  return 'OPEN'
}
import { useOptimisticUpdates } from '@/lib/hooks/useOptimisticUpdates'
import { useTaskStatuses } from '@/lib/hooks/useTaskStatuses'
import { useTaskHandlers } from '@/lib/hooks/useTaskHandlers'
import { AddTaskForm } from '@/views/forms/addTaskForm'
import { JobDetailsCard } from '@/components/jobDetailsCard'
import { JobSubmissionDialog } from '@/components/jobSubmissionDialog'
import { JobReviewDialog } from '@/components/jobReviewDialog'
import type { JobWithRelations, UserRole, ListUser } from '@/lib/services/job/types'

interface TaskGridProps {
  tasks: any[]
  selectedTaskList: any
  collabProfiles: Record<string, string>
  revealRedacted: boolean
  date: string
  userId: string
  jobs?: any[]
  onRefresh: () => Promise<void>
  onRefreshUser: () => Promise<void>
  onRefreshTasks?: () => Promise<void>
}

export const TaskGrid = ({
  tasks,
  selectedTaskList,
  collabProfiles,
  revealRedacted,
  date,
  userId,
  jobs = [],
  onRefresh,
  onRefreshUser,
  onRefreshTasks,
}: TaskGridProps) => {
  const { t } = useI18n()
  const { refreshTaskLists, handleTaskCompletionOptimistic, session } = useContext(GlobalContext)
  const [editingTask, setEditingTask] = useState<any>(null)
  
  // Get user settings for premium factor calculations
  const userSettings = (session?.user as any)?.settings as PremiumFactorSettings | null

  // Job workflow dialog state
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false)
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState<JobWithRelations | null>(null)
  const [selectedTaskForJob, setSelectedTaskForJob] = useState<any>(null)

  // Track pending job requests for UI feedback
  const [pendingJobRequests, setPendingJobRequests] = useState<Set<string>>(new Set())
  // Track refreshing state for UI feedback
  const [refreshingJobId, setRefreshingJobId] = useState<string | null>(null)
  // Track optimistic job updates for instant UI feedback
  const [optimisticJobUpdates, setOptimisticJobUpdates] = useState<Map<string, Partial<JobWithRelations>>>(new Map())

  // Use shared hooks for optimistic updates and task statuses
  const { pendingCompletionsRef, pendingStatusUpdatesRef } = useOptimisticUpdates()
  const { taskStatuses, setTaskStatuses } = useTaskStatuses({
    tasks,
    selectedTaskListId: selectedTaskList?.id,
    date,
  })

  // Use shared task handlers
  const {
    handleTaskClick,
    handleStatusChange,
    handleIncrementCount,
    handleDecrementCount,
    handleToggleRedacted,
    handleValidateJob,
    handleAddPeerReview,
    handleAddManagerReview,
  } = useTaskHandlers({
    taskListId: selectedTaskList?.id,
    tasks,
    date,
    userId,
    selectedTaskList,
    onRefresh,
    onRefreshUser,
    onRefreshTasks,
    onRefreshTaskLists: refreshTaskLists,
    onTaskCompletedOptimistic: handleTaskCompletionOptimistic,
    pendingCompletionsRef,
    pendingStatusUpdatesRef,
    setTaskStatuses,
  })

  // Sort tasks: by status order first, then incomplete before completed
  const sortedTasks = useMemo(() => {
    const isDone = (t: any) => {
      const key = getTaskKey(t)
      const taskStatus = taskStatuses[key] || getTaskStatus(t)
      return taskStatus === 'done' || taskStatus === 'completed'
    }
    const getTaskStatusForSort = (t: any): TaskStatus => {
      const key = getTaskKey(t)
      return taskStatuses[key] || getTaskStatus(t) || 'open'
    }

    return [...tasks].sort((a: any, b: any) => {
      const aStatus = getTaskStatusForSort(a)
      const bStatus = getTaskStatusForSort(b)
      const aStatusIndex = STATUS_OPTIONS.indexOf(aStatus)
      const bStatusIndex = STATUS_OPTIONS.indexOf(bStatus)

      // Sort by status order first
      if (aStatusIndex !== bStatusIndex) {
        return aStatusIndex - bStatusIndex
      }

      // Then sort by completion
      const aDone = isDone(a)
      const bDone = isDone(b)
      if (aDone === bDone) return 0
      return aDone ? 1 : -1
    })
  }, [tasks, taskStatuses])
  
  // Additional handlers for increment/decrement times
  const handleIncrementTimes = useCallback(async (task: any) => {
    if (!selectedTaskList || !task.id) return
    const key = getTaskKey(task)
    const currentTimes = task?.times || 1
    const newTimes = currentTimes + 1
    const currentCount = task?.count || 0

    // Calculate new status based on count and new times
    const newStatus = calculateNewStatus(currentCount, newTimes, taskStatuses[key])

    try {
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          times: newTimes,
          status: newStatus
        })
      })

      await onRefresh()
      await onRefreshUser()
    } catch (error) {
      console.error('Error incrementing times:', error)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser, taskStatuses])
  
  const handleDecrementTimes = useCallback(async (task: any) => {
    if (!selectedTaskList || !task.id) return
    const key = getTaskKey(task)
    const currentTimes = task?.times || 1
    const currentCount = task?.count || 0

    if (currentTimes <= 1) return

    const newTimes = currentTimes - 1
    const newCount = (currentTimes === currentCount) ? Math.max(0, currentCount - 1) : currentCount

    // Calculate new status
    const newStatus = calculateNewStatus(newCount, newTimes, taskStatuses[key])

    // Optimistic update
    setTaskStatuses(prev => {
      const updated = { ...prev }
      if (newCount >= newTimes) {
        updated[key] = 'done'
      } else if (newCount > 0) {
        const existingStatus = prev[key]
        if (!existingStatus || existingStatus === 'done' || existingStatus === 'open') {
          updated[key] = 'in progress'
        }
      } else if (newCount === 0) {
        updated[key] = 'open'
      }
      return updated
    })

    try {
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          times: newTimes,
          count: newCount,
          status: newStatus
        })
      })

      await onRefresh()
      await onRefreshUser()
    } catch (error) {
      console.error('Error decrementing times:', error)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser, taskStatuses, setTaskStatuses])

  // Helper to apply optimistic updates to jobs
  const applyOptimisticUpdates = useCallback((jobsList: JobWithRelations[]): JobWithRelations[] => {
    if (optimisticJobUpdates.size === 0) return jobsList

    return jobsList.map(job => {
      const update = optimisticJobUpdates.get(job.id)
      return update ? { ...job, ...update } : job
    })
  }, [optimisticJobUpdates])

  // Apply optimistic updates to jobs
  const optimisticJobs = useMemo(() => applyOptimisticUpdates(jobs), [jobs, applyOptimisticUpdates])

  // Map jobs by taskId for quick lookup (using optimistic jobs)
  const jobsByTask = useMemo(() => {
    const map: Record<string, JobWithRelations> = {}
    optimisticJobs.forEach((job: JobWithRelations) => {
      // Store latest non-terminal job for each task (active jobs)
      // Terminal states: ACCEPTED, REJECTED, CANCELLED
      const isActiveJob = !['ACCEPTED', 'REJECTED', 'CANCELLED'].includes(job.status)
      if (isActiveJob && (!map[job.taskId] || new Date(job.createdAt) > new Date(map[job.taskId].createdAt))) {
        map[job.taskId] = job
      }
    })
    return map
  }, [optimisticJobs])

  // Get user's role in list
  const getUserRole = useCallback((): UserRole => {
    const users = Array.isArray(selectedTaskList?.users) ? selectedTaskList.users : []
    const userEntry = users.find((u: ListUser) => u.userId === userId)
    return userEntry?.role || 'COLLABORATOR'
  }, [selectedTaskList, userId])

  // Check if user is participant in job
  const isJobParticipant = useCallback((job: JobWithRelations, uid: string): boolean => {
    const users = Array.isArray(selectedTaskList?.users) ? selectedTaskList.users : []
    const isOwnerOrManager = users.some(
      (u: ListUser) => u.userId === uid && ['OWNER', 'MANAGER'].includes(u.role)
    )
    return (
      job.workerId === uid ||
      isOwnerOrManager ||
      job.reviewerIds?.includes(uid)
    )
  }, [selectedTaskList])

  // Job action handlers
  const handleRequestWork = useCallback(async (task: any) => {
    const taskKey = task.id || task.localeKey || task.name
    setPendingJobRequests(prev => new Set(prev).add(taskKey))
    try {
      const response = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          listId: selectedTaskList?.id,
          workerId: userId,
          occurrenceDate: date,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        console.error('Error creating job:', error)
      }
      await onRefresh()
    } catch (error) {
      console.error('Error requesting work:', error)
    } finally {
      setPendingJobRequests(prev => {
        const next = new Set(prev)
        next.delete(taskKey)
        return next
      })
    }
  }, [selectedTaskList?.id, userId, date, onRefresh])

  const handleApproveJobRequest = useCallback(async (jobId: string) => {
    // Optimistic update: immediately show new status
    setOptimisticJobUpdates(prev => new Map(prev).set(jobId, { status: 'IN_PROGRESS' }))
    setRefreshingJobId(jobId)

    try {
      const response = await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      })

      if (!response.ok) throw new Error('Failed to approve job')

      await onRefresh()
      // Clear optimistic update after successful refresh
      setOptimisticJobUpdates(prev => {
        const next = new Map(prev)
        next.delete(jobId)
        return next
      })
    } catch (error) {
      console.error('Error approving job:', error)
      // Rollback optimistic update on error
      setOptimisticJobUpdates(prev => {
        const next = new Map(prev)
        next.delete(jobId)
        return next
      })
    } finally {
      setRefreshingJobId(null)
    }
  }, [onRefresh])

  const handleRejectJob = useCallback(async (jobId: string) => {
    // Optimistic update: immediately show new status
    setOptimisticJobUpdates(prev => new Map(prev).set(jobId, { status: 'REJECTED' }))
    setRefreshingJobId(jobId)

    try {
      const response = await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REJECTED' }),
      })

      if (!response.ok) throw new Error('Failed to reject job')

      await onRefresh()
      // Clear optimistic update after successful refresh
      setOptimisticJobUpdates(prev => {
        const next = new Map(prev)
        next.delete(jobId)
        return next
      })
    } catch (error) {
      console.error('Error rejecting job:', error)
      // Rollback optimistic update on error
      setOptimisticJobUpdates(prev => {
        const next = new Map(prev)
        next.delete(jobId)
        return next
      })
    } finally {
      setRefreshingJobId(null)
    }
  }, [onRefresh])

  const handleWithdrawSubmission = useCallback(async (jobId: string) => {
    // Optimistic update: immediately show new status
    setOptimisticJobUpdates(prev => new Map(prev).set(jobId, { status: 'IN_PROGRESS' }))
    setRefreshingJobId(jobId)

    try {
      const response = await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      })

      if (!response.ok) throw new Error('Failed to withdraw submission')

      await onRefresh()
      // Clear optimistic update after successful refresh
      setOptimisticJobUpdates(prev => {
        const next = new Map(prev)
        next.delete(jobId)
        return next
      })
    } catch (error) {
      console.error('Error withdrawing submission:', error)
      // Rollback optimistic update on error
      setOptimisticJobUpdates(prev => {
        const next = new Map(prev)
        next.delete(jobId)
        return next
      })
    } finally {
      setRefreshingJobId(null)
    }
  }, [onRefresh])

  const handleSubmitWork = useCallback(async (data: { noteContent: string; selfReview: number }) => {
    if (!selectedJob) return

    // Optimistic update: immediately show new status and self-review
    setOptimisticJobUpdates(prev => new Map(prev).set(selectedJob.id, {
      status: 'SUBMITTED',
      selfReview: data.selfReview,
    }))
    setRefreshingJobId(selectedJob.id)

    try {
      const response = await fetch(`/api/v1/jobs/${selectedJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SUBMITTED',
          requesterNoteContent: data.noteContent,
          selfReview: data.selfReview,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit work')

      await onRefresh()
      // Clear optimistic update after successful refresh
      setOptimisticJobUpdates(prev => {
        const next = new Map(prev)
        next.delete(selectedJob.id)
        return next
      })
    } catch (error) {
      console.error('Error submitting work:', error)
      // Rollback optimistic update on error
      setOptimisticJobUpdates(prev => {
        const next = new Map(prev)
        next.delete(selectedJob.id)
        return next
      })
      throw error
    } finally {
      setRefreshingJobId(null)
    }
  }, [selectedJob, onRefresh])

  const handleReviewWork = useCallback(async (data: {
    action: 'accept' | 'validate' | 'reject'
    reviewNoteContent?: string
    managerReview?: number
  }) => {
    if (!selectedJob) return

    const statusMap: Record<string, string> = {
      accept: 'ACCEPTED',
      validate: 'VALIDATING',
      reject: 'REJECTED',
    }
    const newStatus = statusMap[data.action]

    // Optimistic update: immediately show new status and manager review
    const optimisticUpdate: Partial<JobWithRelations> = { status: newStatus as any }
    if (data.managerReview !== undefined) {
      optimisticUpdate.managerReview = data.managerReview
    }
    setOptimisticJobUpdates(prev => new Map(prev).set(selectedJob.id, optimisticUpdate))
    setRefreshingJobId(selectedJob.id)

    try {
      const response = await fetch(`/api/v1/jobs/${selectedJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          reviewerNoteContent: data.reviewNoteContent,
          managerReview: data.managerReview,
        }),
      })

      if (!response.ok) throw new Error('Failed to review work')

      await onRefresh()
      // Clear optimistic update after successful refresh
      setOptimisticJobUpdates(prev => {
        const next = new Map(prev)
        next.delete(selectedJob.id)
        return next
      })
    } catch (error) {
      console.error('Error reviewing work:', error)
      // Rollback optimistic update on error
      setOptimisticJobUpdates(prev => {
        const next = new Map(prev)
        next.delete(selectedJob.id)
        return next
      })
      throw error
    } finally {
      setRefreshingJobId(null)
    }
  }, [selectedJob, onRefresh])

  // Open submission dialog
  const openSubmissionDialog = useCallback((job: JobWithRelations, task: any) => {
    setSelectedJob(job)
    setSelectedTaskForJob(task)
    setIsSubmitDialogOpen(true)
  }, [])

  // Open review dialog
  const openReviewDialog = useCallback((job: JobWithRelations) => {
    setSelectedJob(job)
    setIsReviewDialogOpen(true)
  }, [])

  return (
    <>
      {editingTask && (
        <AddTaskForm
          selectedTaskListId={selectedTaskList?.id}
          editTask={editingTask}
          onCancel={() => setEditingTask(null)}
          onCreated={async () => {
            await onRefresh()
            setEditingTask(null)
          }}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
        {sortedTasks.map((task: any) => {
        const key = getTaskKey(task)
        const taskStatus = taskStatuses[key] || getTaskStatus(task)
        const isDone = taskStatus === 'done' || taskStatus === 'completed'
        
        // Get optimistic count from pending completions to ensure task object has latest count
        const pendingCompletion = pendingCompletionsRef.current.get(key)
        const taskWithOptimisticCount = pendingCompletion 
          ? { ...task, count: pendingCompletion.count }
          : task
        
        // Get jobs for this task (from new job system, using optimistic jobs)
        const taskJobs = optimisticJobs.filter((j: any) => j.taskId === task.id)
        const latestJob = taskJobs.length > 0 ? taskJobs[0] : null

        // For backward compatibility, check old completers array
        const lastCompleter = Array.isArray(task?.completers) && task.completers.length > 0
          ? task.completers[task.completers.length - 1]
          : undefined

        // Extract owners and collaborators from users array (new model) or fallback to old fields
        const users = Array.isArray((selectedTaskList as any)?.users) ? (selectedTaskList as any).users : []
        const ownersFromUsers = users.filter((u: any) => u.role === 'OWNER').map((u: any) => u.userId)
        const collaboratorsFromUsers = users.filter((u: any) => u.role === 'COLLABORATOR' || u.role === 'MANAGER').map((u: any) => u.userId)
        const ownersFromOld = Array.isArray((selectedTaskList as any)?.owners) ? (selectedTaskList as any).owners : []
        const collaboratorsFromOld = Array.isArray((selectedTaskList as any)?.collaborators) ? (selectedTaskList as any).collaborators : []
        const allOwners = ownersFromUsers.length > 0 ? ownersFromUsers : ownersFromOld
        const allCollaborators = collaboratorsFromUsers.length > 0 ? collaboratorsFromUsers : collaboratorsFromOld

        const hasCollaborators = allCollaborators.length > 0

        // Get the completer name: prioritize latest job, fallback to old completer
        const completerName = latestJob
          ? (latestJob.worker?.profiles?.[0]?.username || collabProfiles[String(latestJob.workerId)] || String(latestJob.workerId))
          : lastCompleter
            ? (collabProfiles[String(lastCompleter.id)] || String(lastCompleter.id))
            : null
        
        // Calculate earnings and prize for THIS specific task
        const listBudget = parseFloat((selectedTaskList as any)?.budget || '0')
        const listRole = (selectedTaskList as any)?.role
        // Use tasks from Task collection only (templateTasks is deprecated)
        const totalTasks = (selectedTaskList?.tasks as any[])?.length || 1
        const budgetDistribution = (selectedTaskList as any)?.budgetDistribution
        const premiumPercentage = (selectedTaskList as any)?.premiumPercentage || 0
        
        // Get user equity from session for prize pool calculation
        const userEquity = (selectedTaskList as any)?.userEquity || 0
        const premiumPool = calculatePrizePool(premiumPercentage, userEquity)
        
        let taskEarnings = 0
        let taskPremium = 0
        let isEstimate = true  // Flag to indicate if values are estimates (no accepted job)
        
        // Find accepted job for this task (contains the factored premium/earnings)
        const acceptedJob = taskJobs.find((j: any) => j.status === 'ACCEPTED')
        
        // Priority 1: Use values from accepted job (these are already factored and stored)
        if (acceptedJob && (acceptedJob.premium != null || acceptedJob.earnings != null)) {
          taskEarnings = acceptedJob.earnings || 0
          taskPremium = acceptedJob.premium || 0  // Already factored when job was accepted
          isEstimate = false
        }
        // Priority 2: Calculate estimate from budget distribution (no job yet)
        // Tasks don't hold financial data - only jobs do
        else {
          const allocation = getTaskAllocationFromDistribution(task.id, budgetDistribution, listBudget, premiumPool)
          if (allocation) {
            // Priority 2a: Custom per-task allocation
            taskEarnings = allocation.taskEarnings
            const rawPremium = allocation.taskPremium
            taskPremium = applyPremiumFactors(rawPremium, listRole, userSettings)
          }
          // Priority 2b: Area-based distribution
          else if (budgetDistribution?.areas?.length && task.area) {
            const { budgets: areaBudgets, premiums: areaPremiums } = convertEntityAllocationsToMaps(budgetDistribution.areas as any, listBudget, premiumPool)
            const areaBudget = areaBudgets[task.area] || 0
            const areaPremiumBudget = areaPremiums[task.area] || 0
            const tasksInArea = (selectedTaskList?.tasks as any[] || []).filter((t: any) => t.area === task.area).length || 1
            taskEarnings = areaBudget / tasksInArea
            taskPremium = applyPremiumFactors(areaPremiumBudget / tasksInArea, listRole, userSettings)
          }
          // Priority 2c: Category-based distribution
          else if (budgetDistribution?.categories?.length && task.categories?.length > 0) {
            const { budgets: categoryBudgets, premiums: categoryPremiums } = convertEntityAllocationsToMaps(budgetDistribution.categories as any, listBudget, premiumPool)
            let totalBudget = 0
            let totalPremium = 0
            const taskCategories = Array.isArray(task.categories) ? task.categories : [task.categories]
            
            taskCategories.forEach((category: any) => {
              const categoryBudget = categoryBudgets[category] || 0
              const categoryPremiumBudget = categoryPremiums[category] || 0
              const tasksInCategory = (selectedTaskList?.tasks as any[] || []).filter((t: any) => 
                Array.isArray(t.categories) ? t.categories.includes(category) : t.categories === category
              ).length || 1
              totalBudget += categoryBudget / tasksInCategory
              totalPremium += categoryPremiumBudget / tasksInCategory
            })
            
            if (taskCategories.length > 0) {
              taskEarnings = totalBudget / taskCategories.length
              taskPremium = applyPremiumFactors(totalPremium / taskCategories.length, listRole, userSettings)
            }
          }
          // Priority 3: If no custom allocation (Equal distribution - default), split evenly across all tasks
          else if (listBudget > 0 || premiumPool > 0) {
            // Equal distribution: divide budget and premium pool evenly across all tasks
            const earningsPerTask = listBudget > 0 ? listBudget / totalTasks : 0
            const premiumPerTask = premiumPool > 0 ? premiumPool / totalTasks : 0
            taskEarnings = earningsPerTask
            taskPremium = applyPremiumFactors(premiumPerTask, listRole, userSettings)
          }
          // isEstimate remains true - these are projected values
        }
        
        // Calculate totalGains using the (already factored) premium
        const taskTotalGains = taskEarnings + taskPremium

        // Determine task status
        const finalTaskStatus = taskStatuses[key] || getTaskStatus(task)
        const statusColor = getStatusColor(finalTaskStatus, 'css')
        const iconColor = getIconColor(finalTaskStatus)

        // Determine user role for job validation
        const userRole = users.find((u: any) => u.userId === userId)?.role || 'COLLABORATOR'
        const hasPendingJobs = taskJobs.some((j: any) => j.status === 'VALIDATING')
        const canValidateJobs = (userRole === 'OWNER' || userRole === 'MANAGER') && hasPendingJobs

        // Get the active job for this task (moved up for early access)
        const activeJob = jobsByTask[task.id]
        const isWorker = activeJob?.workerId === userId

        // Determine if user can change task status
        // Collaborators can only change status if they have an approved job (IN_PROGRESS, SUBMITTED, VALIDATING)
        const approvedJobStatuses = ['IN_PROGRESS', 'SUBMITTED', 'VALIDATING', 'ACCEPTED']
        const hasApprovedJob = isWorker && activeJob && approvedJobStatuses.includes(activeJob.status)
        const canChangeStatus = userRole === 'OWNER' || userRole === 'MANAGER' || hasApprovedJob

        // Get list owner username for display
        const ownerUserId = users.find((u: any) => u.role === 'OWNER')?.userId
        const ownerUsername = ownerUserId ? collabProfiles[ownerUserId] : null

        // Build options menu items
        const optionsMenuItems: OptionsMenuItem[] = [
          // Only show status options if user can change status
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
            onClick: () => handleStatusChange(taskWithOptimisticCount, status),
            icon: null,
          })) : []),
          {
            label: t('tasks.edit', { defaultValue: 'Edit' }),
            onClick: () => {
              // Find the source task from list.tasks (Task collection - templateTasks is deprecated)
              const sourceTask = selectedTaskList?.tasks?.find((t: any) =>
                t.id === task.id ||
                t.localeKey === task.localeKey ||
                (t.name && task.name && t.name.toLowerCase() === task.name.toLowerCase())
              )
              // Use source task if found, otherwise fall back to current task for ephemeral tasks
              setEditingTask(sourceTask || taskWithOptimisticCount)
            },
            icon: <Edit className="h-4 w-4" />,
            separator: true,
          },
          {
            label: t('tasks.incrementTimes', { defaultValue: 'Increment times' }),
            onClick: () => handleIncrementTimes(taskWithOptimisticCount),
            icon: <Plus className="h-4 w-4" />,
          },
          {
            label: t('tasks.decrementTimes', { defaultValue: 'Decrement times' }),
            onClick: () => handleDecrementTimes(taskWithOptimisticCount),
            icon: <Minus className="h-4 w-4" />,
          },
          {
            label: task?.redacted ? t('tasks.markAsNotSensitive', { defaultValue: 'Mark as not sensitive' }) : t('tasks.markAsSensitive', { defaultValue: 'Mark as sensitive' }),
            onClick: () => handleToggleRedacted(taskWithOptimisticCount),
            icon: task?.redacted ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
            separator: true,
          },
          ...((task.times || 1) > 1 && (task.count || 0) > 0
            ? [
                {
                  label: t('tasks.decrementCount'),
                  onClick: () => handleDecrementCount(taskWithOptimisticCount),
                  icon: <Minus className="h-4 w-4" />,
                  separator: true,
                },
              ]
            : []),
        ]

        // Check if user is participant in the job
        const isParticipant = activeJob ? isJobParticipant(activeJob, userId) : false
        const currentUserRole = getUserRole()

        // Add job workflow menu items for collaborators
        const jobMenuItems: OptionsMenuItem[] = []

        // Collaborator: Request to work on task (if no active job)
        if (userRole === 'COLLABORATOR' && !activeJob && !isDone) {
          jobMenuItems.push({
            label: t('tasks.requestToWork', { defaultValue: 'Request to Work' }),
            onClick: () => handleRequestWork(taskWithOptimisticCount),
            icon: <Send className="h-4 w-4" />,
            separator: true,
          })
        }

        // Worker: Submit work (if job is in progress)
        if (isWorker && activeJob?.status === 'IN_PROGRESS') {
          jobMenuItems.push({
            label: t('tasks.submitForReview', { defaultValue: 'Submit for Review' }),
            onClick: () => openSubmissionDialog(activeJob, taskWithOptimisticCount),
            icon: <Send className="h-4 w-4" />,
            separator: true,
          })
        }

        // Worker: Resubmit (if job needs changes)
        if (isWorker && activeJob?.status === 'VALIDATING') {
          jobMenuItems.push({
            label: t('tasks.resubmitWork', { defaultValue: 'Revise and Resubmit' }),
            onClick: () => openSubmissionDialog(activeJob, taskWithOptimisticCount),
            icon: <Send className="h-4 w-4" />,
            separator: true,
          })
        }

        // Show pending status for collaborators
        if (isWorker && activeJob?.status === 'REQUESTED') {
          jobMenuItems.push({
            label: t('tasks.requestPending', { defaultValue: 'Request Pending...' }),
            onClick: () => {},
            icon: <Clock className="h-4 w-4" />,
            disabled: true,
          })
        }

        // Combine menus
        const finalOptionsMenuItems = [...optionsMenuItems, ...jobMenuItems]

        return (
          <div key={`task__container--${key}`} className="flex flex-col">
            <TaskItem
              key={`task__item--${key}`}
              task={taskWithOptimisticCount}
              taskStatus={finalTaskStatus}
              statusColor={statusColor}
              iconColor={iconColor}
              optionsMenuItems={finalOptionsMenuItems}
              onClick={() => {
                // For collaborators without an active job on a non-done task, initiate job request
                if (userRole === 'COLLABORATOR' && !activeJob && !isDone) {
                  handleRequestWork(taskWithOptimisticCount)
                } else {
                  // Call task click handler
                  handleTaskClick(taskWithOptimisticCount)
                  
                  // Call optimistic callback with calculated financial values
                  // These are the values displayed in the task badge
                  if (handleTaskCompletionOptimistic) {
                    const currentCount = taskWithOptimisticCount?.count || 0
                    const times = taskWithOptimisticCount?.times || 1
                    const isCurrentlyCompleted = currentCount >= times
                    
                    // If completing, add optimistic earnings; if uncompleting, subtract
                    const multiplier = isCurrentlyCompleted ? -1 : 1
                    handleTaskCompletionOptimistic(
                      taskEarnings * multiplier,
                      taskPremium * multiplier
                    )
                  }
                }
              }}
              revealRedacted={revealRedacted}
              showCompleterBadge={true}
              completerName={completerName}
              taskEarnings={taskEarnings}
              taskPremium={taskPremium}
              taskTotalGains={taskTotalGains}
              hasCollaborators={hasCollaborators}
              variant={isDone ? 'default' : 'outline'}
              latestJob={latestJob}
              hasPendingJobs={hasPendingJobs}
              isOwnerOrManager={userRole === 'OWNER' || userRole === 'MANAGER'}
              ownerUsername={ownerUsername}
              userJobStatus={activeJob?.status || null}
              isCurrentUserWorker={isWorker}
              isPendingRequest={pendingJobRequests.has(key)}
            />

            {/* Job Details Card - shown for active jobs */}
            {activeJob && (
              <JobDetailsCard
                job={activeJob}
                userRole={currentUserRole}
                isParticipant={isParticipant}
                isWorker={isWorker}
                userId={userId}
                isRefreshing={refreshingJobId === activeJob.id}
                onApprove={() => handleApproveJobRequest(activeJob.id)}
                onReject={() => handleRejectJob(activeJob.id)}
                onValidate={() => openReviewDialog(activeJob)}
                onWithdraw={() => handleWithdrawSubmission(activeJob.id)}
                onRequestChanges={() => openReviewDialog(activeJob)}
                onSubmitWork={() => openSubmissionDialog(activeJob, taskWithOptimisticCount)}
              />
            )}
          </div>
        )
      })}
      </div>

      {/* Job Submission Dialog */}
      <JobSubmissionDialog
        open={isSubmitDialogOpen}
        onOpenChange={setIsSubmitDialogOpen}
        jobId={selectedJob?.id || ''}
        taskName={selectedTaskForJob?.displayName || selectedTaskForJob?.name || ''}
        isResubmit={selectedJob?.status === 'VALIDATING'}
        onSubmit={handleSubmitWork}
      />

      {/* Job Review Dialog */}
      <JobReviewDialog
        open={isReviewDialogOpen}
        onOpenChange={setIsReviewDialogOpen}
        job={selectedJob}
        onReview={handleReviewWork}
      />
    </>
  )
}

