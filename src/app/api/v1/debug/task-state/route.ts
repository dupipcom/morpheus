import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')
  const date = searchParams.get('date')

  if (!taskId) {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 })
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      jobs: {
        where: date ? { occurrenceDate: date } : undefined,
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const acceptedJobs = task.jobs.filter(j => j.status === 'ACCEPTED')

  return NextResponse.json({
    task: {
      id: task.id,
      name: task.name,
      status: task.status,
      count: task.count,
      times: task.times,
      firstOccurrence: task.firstOccurrence,
      lastOccurrence: task.lastOccurrence
    },
    jobs: {
      total: task.jobs.length,
      accepted: acceptedJobs.length,
      byDate: date ? acceptedJobs.filter(j => j.occurrenceDate === date).length : null,
      details: acceptedJobs.map(j => ({
        id: j.id,
        workerId: j.workerId,
        status: j.status,
        occurrenceDate: j.occurrenceDate,
        createdAt: j.createdAt
      }))
    },
    calculated: {
      globalCount: acceptedJobs.length,
      dateCount: date ? acceptedJobs.filter(j => j.occurrenceDate === date).length : null,
      shouldBeCompleted: acceptedJobs.length >= (task.times || 1)
    }
  })
}
