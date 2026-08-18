/**
 * Task Application Service Layer
 * Apply flow for public job posts (Phase 5).
 */

export { applyToTask, listApplications, updateApplicationStatus } from './applicationService'
export { APPLICATION_STATUSES } from './types'
export type {
  ApplicationStatus,
  ApplyToTaskInput,
  UpdateApplicationStatusInput
} from './types'
