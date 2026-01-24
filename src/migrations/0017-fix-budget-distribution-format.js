/**
 * Migration: Fix budgetDistribution format
 * 
 * This migration converts empty object {} budgetDistribution values to null
 * so that Prisma can properly parse them with the new EntityAllocationsType[] schema.
 * 
 * The new schema expects:
 * {
 *   areas: EntityAllocationsType[],
 *   categories: EntityAllocationsType[],
 *   tasks: EntityAllocationsType[]
 * }
 * 
 * But existing data may have: {} (empty object)
 */

const { MongoClient } = require('mongodb')

async function migrate() {
  const uri = process.env.DATABASE_URL
  if (!uri) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const client = new MongoClient(uri)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db()
    const listsCollection = db.collection('List')

    // Find all lists with empty object budgetDistribution
    // MongoDB's $type operator: 3 = object
    const listsWithEmptyBudgetDistribution = await listsCollection.find({
      budgetDistribution: { $type: 'object' },
      $or: [
        { 'budgetDistribution.areas': { $exists: false } },
        { 'budgetDistribution.categories': { $exists: false } },
        { 'budgetDistribution.tasks': { $exists: false } }
      ]
    }).toArray()

    console.log(`Found ${listsWithEmptyBudgetDistribution.length} lists with invalid budgetDistribution`)

    // Update each list to either null or proper format
    let updatedCount = 0
    for (const list of listsWithEmptyBudgetDistribution) {
      const budgetDist = list.budgetDistribution

      // Check if it's truly empty or missing arrays
      const isEmpty = !budgetDist || 
        (Object.keys(budgetDist).length === 0) ||
        (!budgetDist.areas && !budgetDist.categories && !budgetDist.tasks)

      if (isEmpty) {
        // Set to null for empty objects
        await listsCollection.updateOne(
          { _id: list._id },
          { $set: { budgetDistribution: null } }
        )
        console.log(`Set budgetDistribution to null for list ${list._id}`)
      } else {
        // Ensure arrays exist
        const newBudgetDist = {
          areas: Array.isArray(budgetDist.areas) ? budgetDist.areas : [],
          categories: Array.isArray(budgetDist.categories) ? budgetDist.categories : [],
          tasks: Array.isArray(budgetDist.tasks) ? budgetDist.tasks : []
        }
        await listsCollection.updateOne(
          { _id: list._id },
          { $set: { budgetDistribution: newBudgetDist } }
        )
        console.log(`Fixed budgetDistribution arrays for list ${list._id}`)
      }
      updatedCount++
    }

    console.log(`Migration complete. Updated ${updatedCount} lists.`)
  } finally {
    await client.close()
    console.log('Disconnected from MongoDB')
  }
}

migrate().catch(console.error)
