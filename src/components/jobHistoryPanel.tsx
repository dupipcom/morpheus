'use client'

import { useState } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import { useJobs } from '@/lib/hooks/useJobs'

interface JobHistoryPanelProps {
  taskId: string
  isOpen: boolean
  onClose: () => void
  onReviewJob?: (job: any) => void
  userRole?: 'OWNER' | 'MANAGER' | 'COLLABORATOR' | 'FOLLOWER'
  currentUserId?: string
}

export function JobHistoryPanel({
  taskId,
  isOpen,
  onClose,
  onReviewJob,
  userRole,
  currentUserId,
}: JobHistoryPanelProps) {
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  const { jobs, isLoading, error } = useJobs({ taskId, status: filterStatus })

  if (!isOpen) return null

  const canReview = userRole === 'OWNER' || userRole === 'MANAGER'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACCEPTED':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'REJECTED':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'VALIDATING':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'REQUESTED':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const toggleJobExpanded = (jobId: string) => {
    setExpandedJobId(expandedJobId === jobId ? null : jobId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="relative w-full max-w-2xl rounded-t-lg bg-white shadow-xl dark:bg-gray-800 sm:rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h2 className="text-xl font-semibold">Job History</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter */}
        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <label htmlFor="statusFilter" className="mb-2 block text-sm font-medium">
            Filter by Status:
          </label>
          <select
            id="statusFilter"
            value={filterStatus || 'all'}
            onChange={(e) => setFilterStatus(e.target.value === 'all' ? undefined : e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
          >
            <option value="all">All</option>
            <option value="REQUESTED">Requested</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="VALIDATING">Validating</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        {/* Job List */}
        <div className="max-h-96 overflow-y-auto p-4">
          {isLoading && (
            <div className="py-8 text-center text-gray-500">Loading...</div>
          )}

          {error && (
            <div className="py-8 text-center text-red-600">
              Error loading job history
            </div>
          )}

          {!isLoading && !error && jobs.length === 0 && (
            <div className="py-8 text-center text-gray-500">
              No job history found
            </div>
          )}

          {!isLoading && !error && jobs.length > 0 && (
            <div className="space-y-3">
              {jobs.map((job: any) => {
                const isExpanded = expandedJobId === job.id
                const workerName = job.worker?.profiles?.[0]?.username || 'Unknown'
                const completionDate = new Date(job.createdAt).toLocaleDateString()
                const completionTime = new Date(job.createdAt).toLocaleTimeString()
                const isPending = job.status === 'VALIDATING'
                const isOwnJob = job.workerId === currentUserId

                return (
                  <div
                    key={job.id}
                    className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{workerName}</span>
                          <span
                            className={`rounded px-2 py-1 text-xs font-medium ${getStatusColor(
                              job.status
                            )}`}
                          >
                            {job.status}
                          </span>
                          {isPending && canReview && !isOwnJob && (
                            <span className="rounded bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                              Needs Review
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {completionDate} at {completionTime}
                        </div>
                      </div>

                      <button
                        onClick={() => toggleJobExpanded(job.id)}
                        className="ml-2 rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 space-y-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                        {job.selfReview !== null && job.selfReview !== undefined && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">
                              Self-Review:
                            </span>
                            <span className="font-medium">
                              {job.selfReview.toFixed(1)}/5
                            </span>
                          </div>
                        )}
                        {job.peerReview !== null && job.peerReview !== undefined && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">
                              Peer Review:
                            </span>
                            <span className="font-medium">
                              {job.peerReview.toFixed(1)}/5
                            </span>
                          </div>
                        )}
                        {job.managerReview !== null && job.managerReview !== undefined && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">
                              Manager Review:
                            </span>
                            <span className="font-medium">
                              {job.managerReview.toFixed(1)}/5
                            </span>
                          </div>
                        )}

                        {isPending && canReview && !isOwnJob && onReviewJob && (
                          <button
                            onClick={() => onReviewJob(job)}
                            className="mt-2 w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                          >
                            Review Job
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
