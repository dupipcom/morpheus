/**
 * Migration: Recalculate Day.progress from Jobs
 *
 * This migration recalculates Day.progress and Day.productivity for all existing
 * Day records based on actual ACCEPTED jobs instead of embedded task status.
 *
 * This ensures historical productivity data is accurate after migrating to
 * Job-based completion tracking.
 *
 * Run with: node src/migrations/0015-recalculate-day-progress-from-jobs.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

/**
 * Calculate productivity from jobs for a specific date
 */
async function calculateProgressFromJobs(userId, occurrenceDate) {
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
          listId: true
        }
      },
      list: {
        select: {
          id: true,
          users: true
        }
      }
    }
  })

  // Filter jobs to only include those from lists the user is a member of
  const userJobs = jobs.filter(job =>
    job.list?.users.some(u => u.userId === userId)
  )

  if (userJobs.length === 0) {
    return { productivity: {}, progress: 0 }
  }

  // Group jobs by listId
  const jobsByList = {}
  for (const job of userJobs) {
    const listId = job.listId
    if (!jobsByList[listId]) {
      jobsByList[listId] = []
    }
    jobsByList[listId].push(job)
  }

  // Calculate productivity for each list
  const productivity = {}

  for (const [listId, listJobs] of Object.entries(jobsByList)) {
    // Get unique task IDs that were completed
    const completedTaskIds = new Set(listJobs.map(j => j.taskId))
    const completedTasks = completedTaskIds.size

    // Get total tasks for this list (simplified - counts all active tasks)
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

  // Calculate overall progress
  const listIds = Object.keys(productivity)
  const overallProgress = listIds.length > 0
    ? listIds.reduce((sum, listId) => sum + productivity[listId].percentage, 0) / listIds.length
    : 0

  return { productivity, progress: overallProgress }
}

async function main() {
  console.log('Starting migration: Recalculate Day.progress from Jobs')

  try {
    // Get all unique dates from jobs
    const jobDates = await prisma.job.findMany({
      where: {
        status: 'ACCEPTED',
        occurrenceDate: { not: null }
      },
      select: {
        occurrenceDate: true,
        worker: {
          select: { id: true }
        }
      },
      distinct: ['occurrenceDate']
    })

    console.log(`Found ${jobDates.length} unique dates with ACCEPTED jobs`)

    let updated = 0
    let created = 0
    let unchanged = 0
    let errors = 0

    // Group by user and date
    const userDateMap = new Map()
    for (const job of jobDates) {
      if (!job.occurrenceDate || !job.worker) continue

      const key = `${job.worker.id}:${job.occurrenceDate}`
      if (!userDateMap.has(key)) {
        userDateMap.set(key, {
          userId: job.worker.id,
          date: job.occurrenceDate
        })
      }
    }

    console.log(`Processing ${userDateMap.size} user-date combinations`)

    for (const { userId, date } of userDateMap.values()) {
      try {
        // Calculate progress from jobs
        const { productivity, progress } = await calculateProgressFromJobs(userId, date)

        // Check if Day exists
        const existingDay = await prisma.day.findUnique({
          where: {
            userId_date: { userId, date }
          },
          select: {
            id: true,
            progress: true,
            productivity: true
          }
        })

        if (existingDay) {
          // Check if update is needed
          const progressChanged = Math.abs((existingDay.progress || 0) - progress) > 0.01

          if (progressChanged) {
            await prisma.day.update({
              where: { id: existingDay.id },
              data: {
                productivity,
                progress
              }
            })
            updated++
            console.log(`  Updated Day for user ${userId.substring(0, 8)}... on ${date}: progress ${(existingDay.progress || 0).toFixed(2)} → ${progress.toFixed(2)}`)
          } else {
            unchanged++
          }
        } else {
          // Create new Day record
          const dateObj = new Date(date)
          const month = dateObj.getMonth() + 1
          const quarter = Math.ceil(month / 3)
          const semester = month <= 6 ? 1 : 2

          // Calculate week number
          const tempDate = new Date(dateObj.valueOf())
          const dayNum = (dateObj.getDay() + 6) % 7
          tempDate.setDate(tempDate.getDate() - dayNum + 3)
          const firstThursday = tempDate.valueOf()
          tempDate.setMonth(0, 1)
          if (tempDate.getDay() !== 4) {
            tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7)
          }
          const week = 1 + Math.ceil((firstThursday - tempDate.valueOf()) / 604800000)

          await prisma.day.create({
            data: {
              userId,
              date,
              week,
              month,
              quarter,
              semester,
              productivity,
              progress,
              tasks: [],
              ticker: []
            }
          })
          created++
          console.log(`  Created Day for user ${userId.substring(0, 8)}... on ${date}: progress ${progress.toFixed(2)}`)
        }
      } catch (error) {
        errors++
        console.error(`  Error processing user ${userId.substring(0, 8)}... on ${date}:`, error.message)
      }
    }

    console.log('\nMigration completed:')
    console.log(`  Updated: ${updated}`)
    console.log(`  Created: ${created}`)
    console.log(`  Unchanged: ${unchanged}`)
    console.log(`  Errors: ${errors}`)

    // Verify: Check for days with old progress calculation
    console.log('\nVerifying migration...')
    const daysWithProgress = await prisma.day.count({
      where: { progress: { not: null } }
    })
    console.log(`Total days with progress: ${daysWithProgress}`)

  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error('Migration error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
