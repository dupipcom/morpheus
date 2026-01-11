'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface JobReviewModalProps {
  job: any
  isOpen: boolean
  onClose: () => void
  onAccept: (peerReview?: number, managerReview?: number) => Promise<void>
  onReject: () => Promise<void>
  userRole: 'OWNER' | 'MANAGER' | 'COLLABORATOR' | 'FOLLOWER'
  currentUserId: string
}

export function JobReviewModal({
  job,
  isOpen,
  onClose,
  onAccept,
  onReject,
  userRole,
  currentUserId,
}: JobReviewModalProps) {
  const [peerReview, setPeerReview] = useState<number | undefined>(job?.peerReview)
  const [managerReview, setManagerReview] = useState<number | undefined>(job?.managerReview)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen || !job) return null

  // Prevent worker from validating their own job
  const isOwnJob = job.workerId === currentUserId
  const canValidate = (userRole === 'OWNER' || userRole === 'MANAGER') && !isOwnJob

  if (!canValidate) {
    return null
  }

  const handleAccept = async () => {
    setIsSubmitting(true)
    try {
      await onAccept(peerReview, managerReview)
      onClose()
    } catch (error) {
      console.error('Error accepting job:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    setIsSubmitting(true)
    try {
      await onReject()
      onClose()
    } catch (error) {
      console.error('Error rejecting job:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const workerName = job.worker?.profiles?.[0]?.username || 'Unknown'
  const taskName = job.task?.name || 'Unknown Task'
  const completionDate = new Date(job.createdAt).toLocaleDateString()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Review Job Completion</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Job Details */}
        <div className="mb-6 space-y-3">
          <div>
            <span className="font-medium">Task:</span> {taskName}
          </div>
          <div>
            <span className="font-medium">Worker:</span> {workerName}
          </div>
          <div>
            <span className="font-medium">Completed:</span> {completionDate}
          </div>
          {job.selfReview !== null && job.selfReview !== undefined && (
            <div>
              <span className="font-medium">Self-Review:</span> {job.selfReview.toFixed(1)}/5
            </div>
          )}
        </div>

        {/* Review Scores */}
        <div className="mb-6 space-y-4">
          <div>
            <label htmlFor="peerReview" className="mb-1 block text-sm font-medium">
              Peer Review Score (0-5)
            </label>
            <input
              id="peerReview"
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={peerReview || ''}
              onChange={(e) => setPeerReview(parseFloat(e.target.value))}
              className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              placeholder="Optional"
            />
          </div>

          <div>
            <label htmlFor="managerReview" className="mb-1 block text-sm font-medium">
              Manager Review Score (0-5)
            </label>
            <input
              id="managerReview"
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={managerReview || ''}
              onChange={(e) => setManagerReview(parseFloat(e.target.value))}
              className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              placeholder="Optional"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={isSubmitting}
            className="flex-1 rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Processing...' : 'Accept'}
          </button>
          <button
            onClick={handleReject}
            disabled={isSubmitting}
            className="flex-1 rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Processing...' : 'Reject'}
          </button>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>

        {isOwnJob && (
          <p className="mt-4 text-sm text-red-600">
            You cannot validate your own job completion.
          </p>
        )}
      </div>
    </div>
  )
}
