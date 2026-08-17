/**
 * Task Application Service
 *
 * Apply flow for public job posts (Phase 5): a task is a job post when its
 * visibility is PUBLIC and its owning list has jobBoardEnabled. Accepting an
 * application adds the applicant to Task.candidateIds and creates the
 * ListRequest-equivalent membership (COLLABORATOR UserReference on the list),
 * so the existing job/earnings flow works unchanged from there.
 */

import prisma from '@/lib/prisma'
import { ApiError } from '@/lib/services/errors'
import { sanitizeText } from '@/lib/utils/sanitize'
import { getViewerRole } from '@/lib/services/ownership'
import { getCurrentUser, batchEnrichUserProfiles } from '@/lib/services/visibility'
import { APPLICATION_STATUSES } from './types'
import type { ApplyToTaskInput, UpdateApplicationStatusInput } from './types'

/** Embedded List.users reference shape (UserReference in the Prisma schema). */
interface ListUserRef {
  userId: string
  role: string
}

/** Internal user id resolution shared by every function here. */
async function resolveUser(viewerUserId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { userId: viewerUserId },
    select: { id: true }
  })
  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found')
  }
  return user.id
}

/**
 * Apply to a job post.
 * 404 when the task (or its list's public surface) is not findable publicly,
 * 400 when applications are closed (applyBy past) or the openings are filled,
 * 409 on a duplicate application.
 */
export async function applyToTask(input: ApplyToTaskInput) {
  const { viewerUserId, taskId, message, documentIds } = input

  const userInternalId = await resolveUser(viewerUserId)

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      list: {
        select: { id: true, publicVisible: true, jobBoardEnabled: true, users: true }
      }
    }
  })

  if (!task || !task.list) {
    throw new ApiError(404, 'NOT_FOUND', 'Task not found')
  }

  // Unpublished lists and non-public tasks are invisible to applicants (privacy-preserving 404s)
  if (!task.list.publicVisible || !task.list.jobBoardEnabled) {
    throw new ApiError(404, 'NOT_FOUND', 'Task not found')
  }
  if (task.visibility !== 'PUBLIC') {
    throw new ApiError(404, 'NOT_FOUND', 'Task not found')
  }

  // Applications closed (applyBy is a UTC YYYY-MM-DD string, per date conventions)
  if (task.applyBy) {
    const today = new Date().toISOString().slice(0, 10)
    if (today > task.applyBy) {
      throw new ApiError(400, 'CLOSED', 'Applications closed')
    }
  }

  // Openings filled (ACCEPTED applications count against openings)
  const openings = task.openings ?? 1
  const acceptedCount = await prisma.taskApplication.count({
    where: { taskId: task.id, status: 'ACCEPTED' }
  })
  if (acceptedCount >= openings) {
    throw new ApiError(400, 'CLOSED', 'Position filled')
  }

  // Members with edit rights don't apply to their own jobs
  const memberRef = (task.list.users as ListUserRef[]).find((u) => u.userId === userInternalId)
  if (memberRef && ['OWNER', 'MANAGER', 'COLLABORATOR'].includes(memberRef.role)) {
    throw new ApiError(400, 'VALIDATION', 'Cannot apply to your own task')
  }

  try {
    return await prisma.taskApplication.create({
      data: {
        taskId: task.id,
        listId: task.list.id,
        userId: userInternalId,
        status: 'PENDING',
        message: message ? sanitizeText(message) : null,
        documentIds: Array.isArray(documentIds) ? documentIds : []
      }
    })
  } catch (error: unknown) {
    // @@unique([taskId, userId]) — double apply
    if ((error as { code?: string })?.code === 'P2002') {
      throw new ApiError(409, 'P2002', 'Already applied')
    }
    throw error
  }
}

/**
 * List applications for a task. Owner/manager of the owning list only.
 * Applicant profiles are batch-enriched (no N+1).
 */
export async function listApplications(params: { viewerUserId: string; taskId: string }) {
  const { viewerUserId, taskId } = params

  const userInternalId = await resolveUser(viewerUserId)

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { listId: true }
  })
  if (!task || !task.listId) {
    throw new ApiError(404, 'NOT_FOUND', 'Task not found')
  }

  const role = await getViewerRole(userInternalId, 'list', task.listId)
  if (role !== 'OWNER' && role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only owners and managers can view applications')
  }

  const applications = await prisma.taskApplication.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' }
  })

  const currentUser = await getCurrentUser(viewerUserId)
  const profiles = await batchEnrichUserProfiles(
    applications.map((a) => a.userId),
    currentUser
  )

  return applications.map((application) => ({
    ...application,
    applicant: profiles.get(application.userId)?.profile ?? null
  }))
}

/**
 * Accept / shortlist / decline / withdraw an application. Owner/manager of the
 * owning list only. ACCEPTED adds the applicant to Task.candidateIds and to
 * the list's users (COLLABORATOR) when not already a member.
 *
 * The updates are sequential, not transactional: MongoDB standalone (local dev)
 * has no multi-document transactions — each step is idempotent, so a crash
 * mid-way can only leave the candidate+membership applied without the status
 * flip, which re-running the accept repairs. Phase 6 introduces the
 * replica-set-backed transactional path for value movements.
 */
export async function updateApplicationStatus(input: UpdateApplicationStatusInput) {
  const { viewerUserId, taskId, applicationId, status } = input

  if (!APPLICATION_STATUSES.includes(status as (typeof APPLICATION_STATUSES)[number])) {
    throw new ApiError(400, 'VALIDATION', 'Invalid status')
  }

  const userInternalId = await resolveUser(viewerUserId)

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { listId: true, candidateIds: true }
  })
  if (!task || !task.listId) {
    throw new ApiError(404, 'NOT_FOUND', 'Task not found')
  }

  const role = await getViewerRole(userInternalId, 'list', task.listId)
  if (role !== 'OWNER' && role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only owners and managers can update applications')
  }

  const application = await prisma.taskApplication.findFirst({
    where: { id: applicationId, taskId }
  })
  if (!application) {
    throw new ApiError(404, 'NOT_FOUND', 'Application not found')
  }

  if (application.status === status) {
    return application // idempotent re-run
  }

  if (status === 'ACCEPTED') {
    if (!task.candidateIds.includes(application.userId)) {
      await prisma.task.update({
        where: { id: taskId },
        data: { candidateIds: { push: application.userId } }
      })
    }

    const list = await prisma.list.findUnique({
      where: { id: task.listId },
      select: { users: true }
    })
    const isMember = ((list?.users as ListUserRef[] | undefined) || []).some(
      (u) => u.userId === application.userId
    )
    if (!isMember) {
      await prisma.list.update({
        where: { id: task.listId },
        data: {
          users: { push: { userId: application.userId, role: 'COLLABORATOR' as const } }
        }
      })
    }
  }

  return prisma.taskApplication.update({
    where: { id: applicationId },
    data: { status }
  })
}
