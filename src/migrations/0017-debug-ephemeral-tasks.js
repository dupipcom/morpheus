/**
 * Debug Script: Inspect ephemeral tasks in MongoDB
 *
 * This script inspects the actual MongoDB data to see what ephemeral tasks exist
 * and why they might not be migrating.
 *
 * Run with: node src/migrations/0017-debug-ephemeral-tasks.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

async function main() {
  console.log('Debugging Ephemeral Tasks')
  console.log('========================\n')

  try {
    // Fetch raw MongoDB data
    const listsRaw = await prisma.$runCommandRaw({
      find: 'List',
      filter: {}
    })

    if (!listsRaw?.cursor?.firstBatch) {
      console.log('❌ No lists found in database')
      return
    }

    const allLists = listsRaw.cursor.firstBatch
    console.log(`Found ${allLists.length} total lists in MongoDB\n`)

    let listsWithEphemeralOpen = 0
    let listsWithEphemeralClosed = 0
    let totalEphemeralOpen = 0
    let totalEphemeralClosed = 0

    for (const list of allLists) {
      // MongoDB returns ObjectId as an object, need to convert to hex string
      const listId = typeof list._id === 'object' && list._id.$oid
        ? list._id.$oid
        : (typeof list._id === 'string' ? list._id : list._id.toString())
      const listName = list.name || listId

      // Check for ephemeralTasks field
      if (list.ephemeralTasks) {
        console.log(`\n📋 List: ${listName}`)
        console.log(`   ID: ${listId}`)
        console.log(`   Role: ${list.role || 'none'}`)

        // Check open tasks
        if (list.ephemeralTasks.open && Array.isArray(list.ephemeralTasks.open)) {
          const openCount = list.ephemeralTasks.open.length
          console.log(`   ✓ ephemeralTasks.open: ${openCount} tasks`)
          listsWithEphemeralOpen++
          totalEphemeralOpen += openCount

          // Show first few tasks
          list.ephemeralTasks.open.slice(0, 3).forEach((task, i) => {
            console.log(`      ${i + 1}. ${task.name}`)
            console.log(`         - id: ${task.id || 'none'}`)
            console.log(`         - localeKey: ${task.localeKey || 'none'}`)
            console.log(`         - status: ${task.status || 'none'}`)
          })
          if (list.ephemeralTasks.open.length > 3) {
            console.log(`      ... and ${list.ephemeralTasks.open.length - 3} more`)
          }
        }

        // Check closed tasks
        if (list.ephemeralTasks.closed && Array.isArray(list.ephemeralTasks.closed)) {
          const closedCount = list.ephemeralTasks.closed.length
          console.log(`   ✓ ephemeralTasks.closed: ${closedCount} tasks`)
          listsWithEphemeralClosed++
          totalEphemeralClosed += closedCount

          // Show first few tasks
          list.ephemeralTasks.closed.slice(0, 3).forEach((task, i) => {
            console.log(`      ${i + 1}. ${task.name}`)
            console.log(`         - id: ${task.id || 'none'}`)
            console.log(`         - localeKey: ${task.localeKey || 'none'}`)
            console.log(`         - status: ${task.status || 'none'}`)
            console.log(`         - completedOn: ${task.completedOn || 'none'}`)
          })
          if (list.ephemeralTasks.closed.length > 3) {
            console.log(`      ... and ${list.ephemeralTasks.closed.length - 3} more`)
          }
        }

        // Check existing tasks in Task collection for this list
        const existingTasks = await prisma.task.findMany({
          where: { listId: listId },
          select: { id: true, name: true, localeKey: true, status: true }
        })

        console.log(`   📊 Existing Task collection entries: ${existingTasks.length}`)

        // Check for matches
        if (existingTasks.length > 0) {
          const existingNames = new Set(existingTasks.map(t => t.name?.toLowerCase()))
          const existingLocaleKeys = new Set(existingTasks.map(t => t.localeKey).filter(Boolean))

          let matchingOpen = 0
          let matchingClosed = 0

          if (list.ephemeralTasks.open) {
            matchingOpen = list.ephemeralTasks.open.filter(t => {
              return existingLocaleKeys.has(t.localeKey) || existingNames.has(t.name?.toLowerCase())
            }).length
          }

          if (list.ephemeralTasks.closed) {
            matchingClosed = list.ephemeralTasks.closed.filter(t => {
              return existingLocaleKeys.has(t.localeKey) || existingNames.has(t.name?.toLowerCase())
            }).length
          }

          if (matchingOpen > 0 || matchingClosed > 0) {
            console.log(`   ⚠️  Matching tasks already in collection:`)
            if (matchingOpen > 0) {
              console.log(`      - ${matchingOpen} open ephemeral tasks already exist`)
            }
            if (matchingClosed > 0) {
              console.log(`      - ${matchingClosed} closed ephemeral tasks already exist`)
            }
          }
        }
      }
    }

    console.log('\n========================')
    console.log('Summary:')
    console.log('========================')
    console.log(`Lists with ephemeralTasks.open: ${listsWithEphemeralOpen}`)
    console.log(`Lists with ephemeralTasks.closed: ${listsWithEphemeralClosed}`)
    console.log(`Total ephemeral open tasks: ${totalEphemeralOpen}`)
    console.log(`Total ephemeral closed tasks: ${totalEphemeralClosed}`)

    if (totalEphemeralOpen === 0 && totalEphemeralClosed === 0) {
      console.log('\n✅ No ephemeral tasks found in database')
      console.log('   This is normal if ephemeral tasks have been cleaned up or migrated')
    }

  } catch (error) {
    console.error('\n❌ Error:', error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
