import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/utils/utils'

interface UseJobsOptions {
  listId?: string
  taskId?: string
  workerId?: string
  status?: string
  date?: string
}

interface CreateJobData {
  taskId: string
  listId: string
  workerId: string
  status?: string
  reviewerIds?: string[]
}

interface UpdateJobData {
  status?: string
  selfReview?: number
  peerReview?: number
  managerReview?: number
  reviewerIds?: string[]
}

export function useJobs(options: UseJobsOptions = {}) {
  const { listId, taskId, workerId, status, date } = options
  const [optimisticJobs, setOptimisticJobs] = useState<any[]>([])

  // Build query string from options
  const queryParams = new URLSearchParams()
  if (listId) queryParams.append('listId', listId)
  if (taskId) queryParams.append('taskId', taskId)
  if (workerId) queryParams.append('workerId', workerId)
  if (status) queryParams.append('status', status)
  if (date) queryParams.append('date', date)

  const queryString = queryParams.toString()
  const url = queryString ? `/api/v1/jobs?${queryString}` : null

  const { data, error, mutate, isLoading } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  const jobs = data?.jobs || []

  // Merge optimistic jobs with fetched jobs
  const mergedJobs = [...optimisticJobs, ...jobs.filter((job: any) =>
    !optimisticJobs.some((optJob) => optJob.id === job.id)
  )]

  const createJob = useCallback(async (jobData: CreateJobData) => {
    const tempId = `temp-${Date.now()}`
    const optimisticJob = {
      id: tempId,
      ...jobData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      selfReview: null,
      peerReview: null,
      managerReview: null,
      _isOptimistic: true,
    }

    // Optimistic update
    setOptimisticJobs((prev) => [...prev, optimisticJob])

    try {
      const response = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobData),
      })

      if (!response.ok) {
        throw new Error('Failed to create job')
      }

      const result = await response.json()

      // Remove optimistic job and refresh
      setOptimisticJobs((prev) => prev.filter((job) => job.id !== tempId))
      await mutate()

      return result.job
    } catch (error) {
      // Revert optimistic update on error
      setOptimisticJobs((prev) => prev.filter((job) => job.id !== tempId))
      console.error('Error creating job:', error)
      throw error
    }
  }, [mutate])

  const updateJob = useCallback(async (jobId: string, updates: UpdateJobData) => {
    // Optimistic update
    const optimisticUpdate = {
      id: jobId,
      ...updates,
      updatedAt: new Date().toISOString(),
      _isOptimistic: true,
    }

    setOptimisticJobs((prev) => {
      const existing = prev.find((job) => job.id === jobId)
      if (existing) {
        return prev.map((job) =>
          job.id === jobId ? { ...job, ...updates } : job
        )
      }
      return [...prev, optimisticUpdate]
    })

    try {
      const response = await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error('Failed to update job')
      }

      const result = await response.json()

      // Clear optimistic update and refresh
      setOptimisticJobs((prev) => prev.filter((job) => job.id !== jobId))
      await mutate()

      return result.job
    } catch (error) {
      // Revert optimistic update on error
      setOptimisticJobs((prev) => prev.filter((job) => job.id !== jobId))
      console.error('Error updating job:', error)
      throw error
    }
  }, [mutate])

  const deleteJob = useCallback(async (jobId: string) => {
    // Optimistic update - remove from list
    const jobToRemove = mergedJobs.find((job: any) => job.id === jobId)
    setOptimisticJobs((prev) => [...prev, { ...jobToRemove, _isDeleted: true }])

    try {
      const response = await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete job')
      }

      // Clear optimistic update and refresh
      setOptimisticJobs((prev) => prev.filter((job) => job.id !== jobId))
      await mutate()
    } catch (error) {
      // Revert optimistic update on error
      setOptimisticJobs((prev) => prev.filter((job) => !job._isDeleted))
      console.error('Error deleting job:', error)
      throw error
    }
  }, [mutate, mergedJobs])

  return {
    jobs: mergedJobs.filter((job: any) => !job._isDeleted),
    isLoading,
    error,
    createJob,
    updateJob,
    deleteJob,
    mutate,
  }
}
