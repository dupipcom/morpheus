/**
 * Migration: Sync Task.count with actual Job totals
 *
 * This migration synchronizes the Task.count field with the actual number of
 * ACCEPTED jobs for each task. It also updates occurrence dates based on job data.
 *
 * This ensures data consistency after migrating to the Job-based completion tracking system.
 *
 * Run with: node src/migrations/0014-sync-task-counts-with-jobs.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

async function main() {
  console.log('Starting migration: Sync Task.count with actual Job totals')

  try {
    // Fetch all tasks with their jobs
    const tasks = await prisma.task.findMany({
      select: {
        id: true,
        name: true,
        count: true,
        firstOccurrence: true,
        lastOccurrence: true,
        jobs: {
          where: { status: 'ACCEPTED' },
          select: {
            occurrenceDate: true,
            createdAt: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    console.log(`Found ${tasks.length} tasks to process`)

    let updated = 0
    let alreadySynced = 0
    let errors = 0

    for (const task of tasks) {
      try {
        const acceptedJobs = task.jobs || []
        const calculatedCount = acceptedJobs.length

        // Prepare update data
        const updateData = {}
        let needsUpdate = false

        // Check if count needs updating
        if (task.count !== calculatedCount) {
          updateData.count = calculatedCount
          needsUpdate = true
        }

        // Update occurrence dates based on jobs
        if (acceptedJobs.length > 0) {
          const firstJob = acceptedJobs[0]
          const lastJob = acceptedJobs[acceptedJobs.length - 1]

          // Update firstOccurrence if different or null
          const firstOccurrenceDate = firstJob.occurrenceDate
            ? new Date(firstJob.occurrenceDate)
            : firstJob.createdAt

          if (!task.firstOccurrence || task.firstOccurrence.getTime() !== firstOccurrenceDate.getTime()) {
            updateData.firstOccurrence = firstOccurrenceDate
            needsUpdate = true
          }

          // Update lastOccurrence if different or null
          const lastOccurrenceDate = lastJob.occurrenceDate
            ? new Date(lastJob.occurrenceDate)
            : lastJob.createdAt

          if (!task.lastOccurrence || task.lastOccurrence.getTime() !== lastOccurrenceDate.getTime()) {
            updateData.lastOccurrence = lastOccurrenceDate
            needsUpdate = true
          }
        } else {
          // No accepted jobs - clear occurrence dates if they exist
          if (task.firstOccurrence !== null) {
            updateData.firstOccurrence = null
            needsUpdate = true
          }
          if (task.lastOccurrence !== null) {
            updateData.lastOccurrence = null
            needsUpdate = true
          }
        }

        // Skip if no updates needed
        if (!needsUpdate) {
          alreadySynced++
          continue
        }

        // Update task
        await prisma.task.update({
          where: { id: task.id },
          data: updateData
        })

        updated++

        const changes = []
        if (updateData.count !== undefined) {
          changes.push(`count: ${task.count} → ${updateData.count}`)
        }
        if (updateData.firstOccurrence !== undefined) {
          changes.push(`firstOccurrence updated`)
        }
        if (updateData.lastOccurrence !== undefined) {
          changes.push(`lastOccurrence updated`)
        }

        console.log(`  Task "${task.name}" (${task.id}): ${changes.join(', ')}`)
      } catch (error) {
        errors++
        console.error(`  Error updating task ${task.id}:`, error.message)
      }
    }

    console.log('\nMigration completed:')
    console.log(`  Updated: ${updated}`)
    console.log(`  Already synced: ${alreadySynced}`)
    console.log(`  Errors: ${errors}`)

    // Verify job occurrence dates
    console.log('\nVerifying job occurrence dates...')
    const jobsWithoutDate = await prisma.job.count({
      where: {
        status: 'ACCEPTED',
        occurrenceDate: null
      }
    })

    console.log(`Jobs without occurrenceDate: ${jobsWithoutDate}`)

    if (jobsWithoutDate > 0) {
      console.log('\n⚠️  WARNING: Found jobs without occurrenceDate')
      console.log('These jobs will not be counted in date-specific views')
      console.log('Run migration 0015-fix-job-occurrence-dates.js to fix this')
    } else {
      console.log('✅ All jobs have valid occurrenceDate values')
    }
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
