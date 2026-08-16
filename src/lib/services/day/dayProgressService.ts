/**
 * Day Progress Calculation Service
 * Calculates Day.progress and Day.productivity based on Jobs (not embedded tasks)
 */

import prisma from '@/lib/prisma'
import { getWeekNumber } from '@/lib/utils/date'

/**
 * List-level productivity data
 */
export interface ListProductivity {
  totalTasks: number
  completedTasks: number
  percentage: number
}

/**
 * Productivity object keyed by listId
 */
export interface Productivity {
  [listId: string]: ListProductivity
}

/**
 * Result of progress calculation
 */
export interface ProgressCalculation {
  productivity: Productivity
  progress: number
}

/**
 * Calculate productivity and progress for a specific date based on Jobs
 *
 * @param userId - User ID
 * @param occurrenceDate - Date in YYYY-MM-DD format
 * @returns Productivity object and overall progress percentage
 */
export async function calculateDayProgressFromJobs(
  userId: string,
  occurrenceDate: string
): Promise<ProgressCalculation> {
  // Get all ACCEPTED jobs for this user and date
  const jobs = await prisma.job.findMany({
    where: {
      occurrenceDate,
      status: 'ACCEPTED'
    },
    include: {
      task: {
        select: {
          id: true,
          listId: true,
          times: true
        }
      },
      list: {
        select: {
          id: true,
          users: {
            select: {
              userId: true,
              role: true
            }
          }
        }
      }
    }
  })

  // Filter jobs to only include those from lists the user is a member of
  const userJobs = jobs.filter(job =>
    job.list?.users.some(u => u.userId === userId)
  )

  // Group jobs by listId
  const jobsByList = userJobs.reduce((acc, job) => {
    const listId = job.listId
    if (!acc[listId]) {
      acc[listId] = []
    }
    acc[listId].push(job)
    return acc
  }, {} as Record<string, typeof jobs>)

  // Calculate productivity for each list
  const productivity: Productivity = {}

  for (const [listId, listJobs] of Object.entries(jobsByList)) {
    // Get unique task IDs that were completed (have ACCEPTED jobs)
    const completedTaskIds = new Set(listJobs.map(j => j.taskId))
    const completedTasks = completedTaskIds.size

    // Get total tasks for this list
    // For now, use simple count of all tasks in the list
    // This provides a baseline completion percentage
    const totalTasks = await prisma.task.count({
      where: { listId }
    })

    const percentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

    productivity[listId] = {
      totalTasks: totalTasks || 1,
      completedTasks,
      percentage
    }
  }

  // Calculate overall progress (average of all list percentages)
  const listIds = Object.keys(productivity)
  const overallProgress = listIds.length > 0
    ? listIds.reduce((sum, listId) => sum + productivity[listId].percentage, 0) / listIds.length
    : 0

  return {
    productivity,
    progress: overallProgress
  }
}

/**
 * Update Day.progress and Day.productivity for a specific date
 * Creates Day record if it doesn't exist
 *
 * @param userId - User ID
 * @param occurrenceDate - Date in YYYY-MM-DD format
 */
export async function updateDayProgress(
  userId: string,
  occurrenceDate: string
): Promise<void> {
  // Calculate progress from jobs
  const { productivity, progress } = await calculateDayProgressFromJobs(userId, occurrenceDate)

  // Find or create Day record
  const existingDay = await prisma.day.findUnique({
    where: {
      userId_date: {
        userId,
        date: occurrenceDate
      }
    }
  })

  if (existingDay) {
    // Update existing Day
    await prisma.day.update({
      where: { id: existingDay.id },
      data: {
        productivity: productivity as any,
        progress
      }
    })
  } else {
    // Create new Day record
    const date = new Date(occurrenceDate)
    const week = getWeekNumber(date).week
    const month = date.getMonth() + 1
    const quarter = Math.ceil(month / 3)
    const semester = month <= 6 ? 1 : 2

    await prisma.day.create({
      data: {
        userId,
        date: occurrenceDate,
        week,
        month,
        quarter,
        semester,
        productivity: productivity as any,
        progress,
        tasks: [],
        ticker: []
      }
    })
  }
}

/**
 * Recalculate progress for multiple dates
 * Useful after bulk Job operations
 *
 * @param userId - User ID
 * @param occurrenceDates - Array of dates in YYYY-MM-DD format
 */
export async function updateMultipleDaysProgress(
  userId: string,
  occurrenceDates: string[]
): Promise<void> {
  for (const date of occurrenceDates) {
    await updateDayProgress(userId, date)
  }
}
