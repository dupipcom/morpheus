import type { Job, Task, List, Note, User, Profile } from '@/generated/prisma'

// User role in a list
export type UserRole = 'OWNER' | 'MANAGER' | 'COLLABORATOR' | 'FOLLOWER'

// Job status enum
export type JobStatus = 'REQUESTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'VALIDATING' | 'ACCEPTED' | 'REJECTED'

// List user with role
export interface ListUser {
  userId: string
  role: UserRole
}

// Job with relations for API responses
export interface JobWithRelations {
  id: string
  status: JobStatus
  workerId: string
  taskId: string
  listId: string
  occurrenceDate: string | null
  selfReview: number | null
  peerReview: number | null
  managerReview: number | null
  reviewerIds: string[]
  requesterNoteIds: string[]
  reviewersNoteIds: string[]
  earnings: number | null
  prize: number | null
  profit: number | null
  createdAt: Date
  updatedAt: Date
  task: {
    id: string
    name: string
    area: string
    categories: string[]
    status: string
  }
  list: {
    id: string
    name: string | null
    users: ListUser[]
  }
  worker: {
    id: string
    userId: string | null
    profiles: Profile[]
  }
  reviewers?: {
    id: string
    userId: string | null
    profiles: Profile[]
  }[]
  requesterNotes: Note[]
  reviewersNotes: (Note & {
    user: {
      id: string
      profiles: Profile[]
    }
  })[]
}

// Request body for updating job
export interface UpdateJobRequest {
  status?: JobStatus
  requesterNoteContent?: string
  reviewerNoteContent?: string
  selfReview?: number
  managerReview?: number
}

// Authorization context
export interface AuthContext {
  userRole?: UserRole
  isWorker: boolean
  isReviewer: boolean
  isOwnerOrManager: boolean
  isListMember: boolean
}
