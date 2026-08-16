/**
 * List Completion Service (Job-Based)
 * Calculates completion percentage from Jobs instead of embedded completedTasks
 */

import prisma from '@/lib/prisma'

/**
 * Calculate completion percentage for a list on a specific date from Jobs
 *
 * @param listId - The list ID
 * @param occurrenceDate - Date in YYYY-MM-DD format
 * @returns Completion percentage (0-100)
 */
export async function calculateListCompletionFromJobs(
  listId: string,
  occurrenceDate: string
): Promise<number> {
  // Get all tasks for this list
  const totalTasks = await prisma.task.count({
    where: { listId }
  })

  if (totalTasks === 0) return 0

  // Get ACCEPTED jobs for this list and date (completed tasks)
  const completedJobs = await prisma.job.findMany({
    where: {
      listId,
      occurrenceDate,
      status: 'ACCEPTED'
    },
    select: {
      taskId: true
    }
  })

  // Count unique completed tasks (a task with multiple jobs counts as 1)
  const uniqueCompletedTasks = new Set(completedJobs.map(j => j.taskId)).size

  return (uniqueCompletedTasks / totalTasks) * 100
}

/**
 * Calculate completion data for all dates in a year for a list
 * Returns data in the format expected by doToolbar
 *
 * @param listId - The list ID
 * @param year - The year
 * @returns Object with date keys mapping to completion percentages
 */
export async function calculateYearCompletionFromJobs(
  listId: string,
  year: number
): Promise<Record<string, { completion: number }>> {
  // Get all ACCEPTED jobs for this list in this year
  const jobs = await prisma.job.findMany({
    where: {
      listId,
      status: 'ACCEPTED',
      occurrenceDate: {
        startsWith: year.toString()
      }
    },
    select: {
      occurrenceDate: true,
      taskId: true
    }
  })

  // Get total tasks count
  const totalTasks = await prisma.task.count({
    where: { listId }
  })

  if (totalTasks === 0) return {}

  // Group jobs by date
  const jobsByDate = jobs.reduce((acc, job) => {
    if (!job.occurrenceDate) return acc

    if (!acc[job.occurrenceDate]) {
      acc[job.occurrenceDate] = new Set()
    }
    acc[job.occurrenceDate].add(job.taskId)
    return acc
  }, {} as Record<string, Set<string>>)

  // Calculate completion percentage for each date
  const result: Record<string, { completion: number }> = {}

  for (const [date, taskIds] of Object.entries(jobsByDate)) {
    const uniqueCompletedTasks = taskIds.size
    const completion = (uniqueCompletedTasks / totalTasks) * 100
    result[date] = { completion }
  }

  return result
}

/**
 * Get completion data structure for doToolbar
 * Merges Job-based data with existing legacy data
 *
 * @param listId - The list ID
 * @returns CompletedTasks structure with job-based completion data
 */
export async function getListCompletionData(listId: string): Promise<Record<number, Record<string, { completion: number }>>> {
  // Get all ACCEPTED jobs for this list
  const jobs = await prisma.job.findMany({
    where: {
      listId,
      status: 'ACCEPTED'
    },
    select: {
      occurrenceDate: true,
      taskId: true
    }
  })

  // Filter out jobs without occurrenceDate
  const validJobs = jobs.filter(j => j.occurrenceDate !== null && j.occurrenceDate !== undefined)

  if (validJobs.length === 0) return {}

  // Get total tasks count
  const totalTasks = await prisma.task.count({
    where: { listId }
  })

  if (totalTasks === 0) return {}

  // Group by year and date
  const result: Record<number, Record<string, { completion: number }>> = {}

  // Group jobs by year and date
  const jobsByYearAndDate: Record<number, Record<string, Set<string>>> = {}

  for (const job of validJobs) {
    if (!job.occurrenceDate) continue

    const year = parseInt(job.occurrenceDate.substring(0, 4))
    const date = job.occurrenceDate

    if (!jobsByYearAndDate[year]) {
      jobsByYearAndDate[year] = {}
    }
    if (!jobsByYearAndDate[year][date]) {
      jobsByYearAndDate[year][date] = new Set()
    }
    jobsByYearAndDate[year][date].add(job.taskId)
  }

  // Calculate completion for each date
  for (const [yearStr, dateData] of Object.entries(jobsByYearAndDate)) {
    const year = parseInt(yearStr)
    result[year] = {}

    for (const [date, taskIds] of Object.entries(dateData)) {
      const uniqueCompletedTasks = taskIds.size
      const completion = (uniqueCompletedTasks / totalTasks) * 100
      result[year][date] = { completion }
    }
  }

  return result
}
