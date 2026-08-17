/**
 * Task Application Service Types
 * Job-post apply flow (Phase 5). A task is a job post when its visibility is
 * PUBLIC and its list has jobBoardEnabled.
 */

export const APPLICATION_STATUSES = [
  'PENDING',
  'SHORTLISTED',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN'
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export interface ApplyToTaskInput {
  viewerUserId: string
  taskId: string
  message?: string | null
  documentIds?: string[]
}

export interface UpdateApplicationStatusInput {
  viewerUserId: string
  taskId: string
  applicationId: string
  status: string
}
