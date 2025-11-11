/**
 * PRISMA DATA MIGRATION SCRIPT
 * -----------------------------
 *
 * Purpose:
 * Convert budget field from String to Float in TaskList collection
 *
 * How to Run:
 * 1. Save this file in your project (e.g., src/migrations)
 * 2. Run from terminal: `node src/migrations/0009-convert-budget-to-float.js`
 *
 * IMPORTANT: Always back up your database before running a migration script.
 */

const { PrismaClient } = require('../../generated/prisma')

const prisma = new PrismaClient()

async function main() {
  console.log('Starting migration: Convert budget from String to Float...')
  
  try {
    // Use raw MongoDB command to fetch all task lists with budget as string
    const result = await prisma.$runCommandRaw({
      find: 'TaskList',
      filter: {
        budget: { $type: 'string' }
      },
      projection: { _id: 1, budget: 1 }
    })

    const taskLists = result.cursor.firstBatch || []
    console.log(`Found ${taskLists.length} task lists with string budget values`)

    let converted = 0
    let skipped = 0
    let errors = 0

    for (const taskList of taskLists) {
      try {
        const budgetValue = taskList.budget
        
        // Skip if budget is null, undefined, or empty string
        if (!budgetValue || budgetValue === '') {
          skipped++
          continue
        }

        // Parse string to float
        const budgetFloat = parseFloat(String(budgetValue))
        
        // Skip if parsing resulted in NaN
        if (isNaN(budgetFloat)) {
          console.warn(`Skipping taskList ${taskList._id}: invalid budget value "${budgetValue}"`)
          skipped++
          continue
        }

        // Update using raw MongoDB command to bypass Prisma type checking
        await prisma.$runCommandRaw({
          update: 'TaskList',
          updates: [{
            q: { _id: taskList._id },
            u: {
              $set: { budget: budgetFloat }
            }
          }]
        })

        converted++
        if (converted % 100 === 0) {
          console.log(`Converted ${converted} task lists...`)
        }
      } catch (error) {
        console.error(`Error converting taskList ${taskList._id}:`, error)
        errors++
      }
    }

    console.log('\nMigration completed!')
    console.log(`- Converted: ${converted}`)
    console.log(`- Skipped: ${skipped}`)
    console.log(`- Errors: ${errors}`)
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })



