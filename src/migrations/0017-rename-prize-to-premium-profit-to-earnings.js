/**
 * Migration: Rename prize → premium and profit → earnings
 *
 * This migration updates legacy field names to match the new schema:
 * 1. Completer.prize → Completer.premium (in embedded tasks across Day, List, Template)
 * 2. Ticker.profit → Ticker.earnings (in Day.ticker)
 *
 * The application code already has backwards compatibility reading both old and new names,
 * but this migration ensures data consistency with the updated schema.
 *
 * Run with: node src/migrations/0017-rename-prize-to-premium-profit-to-earnings.js
 * Dry run:  DRY_RUN=true node src/migrations/0017-rename-prize-to-premium-profit-to-earnings.js
 */

const { PrismaClient } = require('../../generated/prisma')

const prisma = new PrismaClient()
const DRY_RUN = process.env.DRY_RUN === 'true'
const BATCH_SIZE = 100

/**
 * Rename prize → premium in completers array
 * Returns { updated: array, modified: boolean }
 */
function renameCompleterPrize(completers) {
  if (!Array.isArray(completers)) {
    return { updated: completers, modified: false }
  }

  let modified = false
  const updated = completers.map(completer => {
    if (!completer || typeof completer !== 'object') {
      return completer
    }

    // Check if prize field exists and premium doesn't
    if ('prize' in completer && !('premium' in completer)) {
      const { prize, ...rest } = completer
      modified = true
      return { ...rest, premium: prize }
    }

    return completer
  })

  return { updated, modified }
}

/**
 * Process tasks array and rename prize → premium in completers
 * Returns { updated: array, modified: boolean }
 */
function processTasksCompleters(tasks) {
  if (!Array.isArray(tasks)) {
    return { updated: tasks, modified: false }
  }

  let anyModified = false
  const updated = tasks.map(task => {
    if (!task || typeof task !== 'object') {
      return task
    }

    if (Array.isArray(task.completers)) {
      const { updated: updatedCompleters, modified } = renameCompleterPrize(task.completers)
      if (modified) {
        anyModified = true
        return { ...task, completers: updatedCompleters }
      }
    }

    return task
  })

  return { updated, modified: anyModified }
}

/**
 * Rename profit → earnings in ticker array
 * Returns { updated: array, modified: boolean }
 */
function renameTickerProfit(ticker) {
  if (!Array.isArray(ticker)) {
    return { updated: ticker, modified: false }
  }

  let modified = false
  const updated = ticker.map(item => {
    if (!item || typeof item !== 'object') {
      return item
    }

    // Check if profit field exists and earnings doesn't
    if ('profit' in item && !('earnings' in item)) {
      const { profit, ...rest } = item
      modified = true
      return { ...rest, earnings: profit }
    }

    return item
  })

  return { updated, modified }
}

/**
 * Process Day records: rename Ticker.profit → earnings and Completer.prize → premium
 */
async function migrateDays() {
  console.log('\n--- Processing Day records ---')

  const total = await prisma.day.count()
  console.log(`Total Day records: ${total}`)

  let processed = 0
  let updated = 0
  let errors = 0
  let skip = 0

  while (true) {
    const batch = await prisma.day.findMany({
      take: BATCH_SIZE,
      skip,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        ticker: true,
        tasks: true
      }
    })

    if (batch.length === 0) break

    for (const day of batch) {
      try {
        const updateData = {}
        let needsUpdate = false

        // Process ticker: rename profit → earnings
        if (day.ticker) {
          const { updated: updatedTicker, modified } = renameTickerProfit(day.ticker)
          if (modified) {
            updateData.ticker = updatedTicker
            needsUpdate = true
          }
        }

        // Process tasks: rename completers.prize → premium
        if (day.tasks) {
          const { updated: updatedTasks, modified } = processTasksCompleters(day.tasks)
          if (modified) {
            updateData.tasks = updatedTasks
            needsUpdate = true
          }
        }

        if (needsUpdate) {
          if (!DRY_RUN) {
            await prisma.day.update({
              where: { id: day.id },
              data: updateData
            })
          }
          updated++
          console.log(`  Day ${day.id}: updated (ticker: ${!!updateData.ticker}, tasks: ${!!updateData.tasks})`)
        }

        processed++
      } catch (error) {
        errors++
        console.error(`  Error processing Day ${day.id}:`, error.message)
      }
    }

    skip += BATCH_SIZE
    if (processed % 500 === 0 || processed === total) {
      console.log(`  Progress: ${processed}/${total} (${Math.round(processed / total * 100)}%)`)
    }
  }

  return { processed, updated, errors }
}

/**
 * Process List records: rename Completer.prize → premium in templateTasks
 */
async function migrateLists() {
  console.log('\n--- Processing List records ---')

  const total = await prisma.list.count()
  console.log(`Total List records: ${total}`)

  let processed = 0
  let updated = 0
  let errors = 0
  let skip = 0

  while (true) {
    const batch = await prisma.list.findMany({
      take: BATCH_SIZE,
      skip,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        templateTasks: true
      }
    })

    if (batch.length === 0) break

    for (const list of batch) {
      try {
        const updateData = {}
        let needsUpdate = false

        // Process templateTasks: rename completers.prize → premium
        if (list.templateTasks) {
          const { updated: updatedTasks, modified } = processTasksCompleters(list.templateTasks)
          if (modified) {
            updateData.templateTasks = updatedTasks
            needsUpdate = true
          }
        }

        if (needsUpdate) {
          if (!DRY_RUN) {
            await prisma.list.update({
              where: { id: list.id },
              data: updateData
            })
          }
          updated++
          console.log(`  List ${list.id}: updated templateTasks`)
        }

        processed++
      } catch (error) {
        errors++
        console.error(`  Error processing List ${list.id}:`, error.message)
      }
    }

    skip += BATCH_SIZE
    if (processed % 500 === 0 || processed === total) {
      console.log(`  Progress: ${processed}/${total} (${Math.round(processed / total * 100)}%)`)
    }
  }

  return { processed, updated, errors }
}

/**
 * Process Template records: rename Completer.prize → premium in tasks
 */
async function migrateTemplates() {
  console.log('\n--- Processing Template records ---')

  const total = await prisma.template.count()
  console.log(`Total Template records: ${total}`)

  let processed = 0
  let updated = 0
  let errors = 0
  let skip = 0

  while (true) {
    const batch = await prisma.template.findMany({
      take: BATCH_SIZE,
      skip,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        tasks: true
      }
    })

    if (batch.length === 0) break

    for (const template of batch) {
      try {
        const updateData = {}
        let needsUpdate = false

        // Process tasks: rename completers.prize → premium
        if (template.tasks) {
          const { updated: updatedTasks, modified } = processTasksCompleters(template.tasks)
          if (modified) {
            updateData.tasks = updatedTasks
            needsUpdate = true
          }
        }

        if (needsUpdate) {
          if (!DRY_RUN) {
            await prisma.template.update({
              where: { id: template.id },
              data: updateData
            })
          }
          updated++
          console.log(`  Template ${template.id}: updated tasks`)
        }

        processed++
      } catch (error) {
        errors++
        console.error(`  Error processing Template ${template.id}:`, error.message)
      }
    }

    skip += BATCH_SIZE
    if (processed % 500 === 0 || processed === total) {
      console.log(`  Progress: ${processed}/${total} (${Math.round(processed / total * 100)}%)`)
    }
  }

  return { processed, updated, errors }
}

async function main() {
  console.log('='.repeat(70))
  console.log('Migration: Rename prize → premium and profit → earnings')
  console.log('='.repeat(70))
  console.log(`DRY_RUN: ${DRY_RUN}`)
  console.log('')

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE: No changes will be made to the database')
    console.log('')
  }

  try {
    const dayResults = await migrateDays()
    const listResults = await migrateLists()
    const templateResults = await migrateTemplates()

    console.log('\n' + '='.repeat(70))
    console.log('Migration Summary')
    console.log('='.repeat(70))
    console.log(`\nDay records:`)
    console.log(`  Processed: ${dayResults.processed}`)
    console.log(`  Updated: ${dayResults.updated}`)
    console.log(`  Errors: ${dayResults.errors}`)

    console.log(`\nList records:`)
    console.log(`  Processed: ${listResults.processed}`)
    console.log(`  Updated: ${listResults.updated}`)
    console.log(`  Errors: ${listResults.errors}`)

    console.log(`\nTemplate records:`)
    console.log(`  Processed: ${templateResults.processed}`)
    console.log(`  Updated: ${templateResults.updated}`)
    console.log(`  Errors: ${templateResults.errors}`)

    const totalUpdated = dayResults.updated + listResults.updated + templateResults.updated
    const totalErrors = dayResults.errors + listResults.errors + templateResults.errors

    console.log(`\nTotal Updated: ${totalUpdated}`)
    console.log(`Total Errors: ${totalErrors}`)

    if (DRY_RUN && totalUpdated > 0) {
      console.log('\n✅ Dry run complete. Run without DRY_RUN=true to apply changes.')
    } else if (!DRY_RUN && totalUpdated > 0) {
      console.log('\n✅ Migration completed successfully!')
    } else if (totalUpdated === 0) {
      console.log('\n✅ No records needed updating. Data is already in the new format.')
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
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
