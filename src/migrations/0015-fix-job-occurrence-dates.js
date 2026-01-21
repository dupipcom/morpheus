/**
 * Migration: Fix Job occurrenceDate for jobs missing this field
 *
 * This migration sets occurrenceDate based on createdAt for jobs that don't have
 * an occurrenceDate value. This ensures all jobs can be properly counted in
 * date-specific views.
 *
 * Run with: node src/migrations/0015-fix-job-occurrence-dates.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

async function main() {
  console.log('Starting migration: Fix Job occurrenceDate values')

  try {
    // Find jobs without occurrenceDate
    const jobsToFix = await prisma.job.findMany({
      where: {
        status: 'ACCEPTED',
        occurrenceDate: null
      },
      select: {
        id: true,
        createdAt: true,
        task: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    console.log(`Found ${jobsToFix.length} jobs without occurrenceDate`)

    if (jobsToFix.length === 0) {
      console.log('✅ No jobs need fixing')
      return
    }

    let updated = 0
    let errors = 0

    for (const job of jobsToFix) {
      try {
        // Convert createdAt to YYYY-MM-DD format
        const dateStr = job.createdAt.toISOString().split('T')[0]

        await prisma.job.update({
          where: { id: job.id },
          data: { occurrenceDate: dateStr }
        })

        updated++
        console.log(`  Job ${job.id} (${job.task?.name || 'unknown'}): occurrenceDate set to ${dateStr}`)
      } catch (error) {
        errors++
        console.error(`  Error updating job ${job.id}:`, error.message)
      }
    }

    console.log('\nMigration completed:')
    console.log(`  Updated: ${updated}`)
    console.log(`  Errors: ${errors}`)

    if (errors === 0) {
      console.log('✅ All jobs now have valid occurrenceDate values')
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
