import prisma from '@/lib/prisma'

export interface AuditLogEntry {
  userId: string
  action: string
  resourceType: 'Job' | 'Task' | 'Note'
  resourceId: string
  metadata?: Record<string, unknown>
}

/**
 * Create structured audit log for compliance tracking
 * Required for: ISO 27001, SOC II, DORA compliance
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    // Log to structured format for audit trail
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata,
    }

    // Log to console in structured JSON format
    console.log(JSON.stringify({
      type: 'AUDIT',
      ...logEntry,
    }))

    // TODO: Store in dedicated audit log table or external service
    // await prisma.auditLog.create({ data: logEntry })
    // OR send to external audit service (e.g., CloudWatch, Datadog)
  } catch (error) {
    // Never fail the request due to audit logging failure
    console.error('Failed to create audit log:', error)
  }
}

/**
 * Audit log for job status transitions
 */
export async function logJobStatusChange(params: {
  userId: string
  jobId: string
  oldStatus: string
  newStatus: string
  taskId?: string
  listId?: string
}): Promise<void> {
  await createAuditLog({
    userId: params.userId,
    action: 'job.status.update',
    resourceType: 'Job',
    resourceId: params.jobId,
    metadata: {
      oldStatus: params.oldStatus,
      newStatus: params.newStatus,
      taskId: params.taskId,
      listId: params.listId,
    },
  })
}

/**
 * Audit log for job acceptance (financial event)
 */
export async function logJobAcceptance(params: {
  userId: string
  jobId: string
  workerId: string
  taskId: string
  listId: string
  managerReview?: number
}): Promise<void> {
  await createAuditLog({
    userId: params.userId,
    action: 'job.accepted',
    resourceType: 'Job',
    resourceId: params.jobId,
    metadata: {
      workerId: params.workerId,
      taskId: params.taskId,
      listId: params.listId,
      managerReview: params.managerReview,
      // Don't log financial amounts in audit logs (PCI compliance)
      event: 'earnings_calculated',
    },
  })
}

/**
 * Audit log for authorization failures
 */
export async function logAuthorizationFailure(params: {
  userId: string
  action: string
  resourceType: 'Job' | 'Task' | 'Note'
  resourceId: string
  reason: string
}): Promise<void> {
  await createAuditLog({
    userId: params.userId,
    action: `${params.action}.denied`,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    metadata: {
      reason: params.reason,
    },
  })
}
