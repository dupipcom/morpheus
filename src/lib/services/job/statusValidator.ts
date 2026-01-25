export interface StatusTransitionRule {
  to: string[]
  roles: string[]
  requiresNote?: boolean
}

export const STATUS_TRANSITIONS: Record<string, StatusTransitionRule> = {
  REQUESTED: {
    to: ['IN_PROGRESS', 'REJECTED', 'CANCELLED'],
    roles: ['OWNER', 'MANAGER'],
  },
  IN_PROGRESS: {
    to: ['SUBMITTED', 'CANCELLED'],
    roles: ['WORKER', 'OWNER', 'MANAGER'],
    requiresNote: true, // Submission must have note
  },
  SUBMITTED: {
    to: ['IN_PROGRESS', 'VALIDATING', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
    roles: ['WORKER', 'OWNER', 'MANAGER', 'REVIEWER'],
  },
  VALIDATING: {
    to: ['IN_PROGRESS', 'SUBMITTED', 'CANCELLED'],
    roles: ['WORKER', 'OWNER', 'MANAGER'],
  },
  ACCEPTED: {
    to: ['CANCELLED'], // Allow cancellation for compliance (e.g., re-opening non-recurring tasks)
    roles: ['OWNER', 'MANAGER'],
  },
  REJECTED: {
    to: [], // Terminal state
    roles: [],
  },
  CANCELLED: {
    to: [], // Terminal state - jobs are never deleted for compliance
    roles: [],
  },
}

export function validateStatusTransition(
  currentStatus: string,
  newStatus: string
): { valid: boolean; error?: string } {
  const rule = STATUS_TRANSITIONS[currentStatus]

  if (!rule) {
    return { valid: false, error: `Unknown current status: ${currentStatus}` }
  }

  if (!rule.to.includes(newStatus)) {
    return {
      valid: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${rule.to.join(', ')}`
    }
  }

  return { valid: true }
}

export function isAuthorizedForTransition(
  currentStatus: string,
  newStatus: string,
  context: {
    userRole?: string
    isWorker: boolean
    isReviewer: boolean
  }
): { authorized: boolean; error?: string } {
  const rule = STATUS_TRANSITIONS[currentStatus]

  if (!rule) {
    return { authorized: false, error: 'Invalid status' }
  }

  const { userRole, isWorker, isReviewer } = context

  // Check worker-only transitions
  if (rule.roles.includes('WORKER')) {
    if (
      (newStatus === 'SUBMITTED' || newStatus === 'IN_PROGRESS') &&
      isWorker
    ) {
      return { authorized: true }
    }
  }

  // Check owner/manager transitions
  if (rule.roles.includes('OWNER') || rule.roles.includes('MANAGER')) {
    if (userRole && ['OWNER', 'MANAGER'].includes(userRole)) {
      return { authorized: true }
    }
  }

  // Check reviewer transitions
  if (rule.roles.includes('REVIEWER')) {
    if (isReviewer || (userRole && ['OWNER', 'MANAGER'].includes(userRole))) {
      return { authorized: true }
    }
  }

  return {
    authorized: false,
    error: `You are not authorized to transition from ${currentStatus} to ${newStatus}`
  }
}
