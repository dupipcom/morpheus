import prisma from '@/lib/prisma'

export const TASK_STATUS_MAP: Record<string, string> = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'READY',
  VALIDATING: 'IN_PROGRESS',
  ACCEPTED: 'DONE',
  REJECTED: 'OPEN',
  CANCELLED: 'OPEN',
}

export async function syncTaskStatus(
  taskId: string,
  jobStatus: string
): Promise<{ success: boolean; newTaskStatus?: string }> {
  const newTaskStatus = TASK_STATUS_MAP[jobStatus]

  if (!newTaskStatus) {
    return { success: false }
  }

  try {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: newTaskStatus as any }
    })

    return { success: true, newTaskStatus }
  } catch (error) {
    console.error('Error syncing task status:', error)
    return { success: false }
  }
}
