/**
 * Migration Dry Run: Preview List tasks to Task collection migration
 *
 * This script shows what will be migrated without making any changes:
 * 1. All list.templateTasks
 * 2. All list.ephemeralTasks.open (if exists)
 * 3. All list.ephemeralTasks.closed (if exists)
 *
 * Run with: node src/migrations/0017-migrate-list-tasks-to-collection-dry-run.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

/**
 * Determine recurrence rule based on list role
 */
function getRecurrenceFromListRole(listRole) {
  if (!listRole || typeof listRole !== 'string') {
    return 'NONE'
  }

  if (listRole.startsWith('daily.')) {
    return 'DAILY'
  }

  if (listRole.startsWith('weekly.')) {
    return 'WEEKLY'
  }

  return 'NONE'
}

/**
 * Get a unique key for a task to avoid duplicates
 */
function getTaskKey(task) {
  return task.localeKey || task.name?.toLowerCase() || ''
}

async function main() {
  console.log('DRY RUN: Preview List tasks to Task collection migration')
  console.log('==========================================================')
  console.log('⚠️  This is a dry run - no changes will be made\n')

  try {
    // Fetch all lists with their embedded tasks
    const lists = await prisma.list.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        area: true,
        templateTasks: true,
      }
    })

    // Fetch raw documents to get ephemeralTasks
    const listsWithEphemeral = await prisma.$runCommandRaw({
      find: 'List',
      filter: {}
    })

    // Create a map of list IDs to their ephemeralTasks data
    const ephemeralTasksMap = new Map()
    if (listsWithEphemeral?.cursor?.firstBatch) {
      listsWithEphemeral.cursor.firstBatch.forEach(doc => {
        if (doc.ephemeralTasks) {
          // MongoDB returns ObjectId as an object, need to convert to hex string
          const docId = typeof doc._id === 'object' && doc._id.$oid
            ? doc._id.$oid
            : (typeof doc._id === 'string' ? doc._id : doc._id.toString())
          ephemeralTasksMap.set(docId, doc.ephemeralTasks)
        }
      })
    }

    console.log(`Found ${lists.length} lists to analyze`)
    console.log(`Found ${ephemeralTasksMap.size} lists with ephemeral tasks\n`)

    let totalNewTasks = 0
    let totalExistingTasks = 0
    let listsWithNewTasks = 0
    let listsWithNoChanges = 0

    for (const list of lists) {
      const tasksToCreate = []
      const taskKeys = new Set()

      // 1. Count templateTasks
      if (Array.isArray(list.templateTasks) && list.templateTasks.length > 0) {
        for (const task of list.templateTasks) {
          const key = getTaskKey(task)
          if (key && !taskKeys.has(key)) {
            taskKeys.add(key)
            tasksToCreate.push({
              name: task.name,
              localeKey: task.localeKey,
              status: task.status?.toUpperCase() || 'OPEN',
              recurrence: getRecurrenceFromListRole(list.role),
              source: 'templateTask'
            })
          }
        }
      }

      // 2. Count ephemeralTasks.open
      const ephemeralTasks = ephemeralTasksMap.get(list.id)
      if (ephemeralTasks?.open && Array.isArray(ephemeralTasks.open)) {
        for (const task of ephemeralTasks.open) {
          const key = getTaskKey(task)
          if (key && !taskKeys.has(key)) {
            taskKeys.add(key)
            tasksToCreate.push({
              name: task.name,
              localeKey: task.localeKey,
              status: task.status?.toUpperCase() || 'OPEN',
              recurrence: getRecurrenceFromListRole(list.role),
              source: 'ephemeralTask-open'
            })
          }
        }
      }

      // 3. Count ephemeralTasks.closed
      if (ephemeralTasks?.closed && Array.isArray(ephemeralTasks.closed)) {
        for (const task of ephemeralTasks.closed) {
          const key = getTaskKey(task)
          if (key && !taskKeys.has(key)) {
            taskKeys.add(key)
            tasksToCreate.push({
              name: task.name,
              localeKey: task.localeKey,
              status: task.status?.toUpperCase() || 'OPEN',
              recurrence: getRecurrenceFromListRole(list.role),
              source: 'ephemeralTask-closed'
            })
          }
        }
      }

      // Check existing tasks
      const existingTasks = await prisma.task.findMany({
        where: { listId: list.id },
        select: { localeKey: true, name: true }
      })

      const existingTaskKeys = new Set()
      existingTasks.forEach(t => {
        const key = getTaskKey(t)
        if (key) existingTaskKeys.add(key)
      })

      // Filter out tasks that already exist
      const newTasks = tasksToCreate.filter(task => {
        const key = task.localeKey || task.name?.toLowerCase()
        return key && !existingTaskKeys.has(key)
      })

      const skippedCount = tasksToCreate.length - newTasks.length

      if (newTasks.length > 0 || skippedCount > 0) {
        console.log(`\n📋 List: ${list.name || list.id}`)
        console.log(`   Role: ${list.role || 'none'} → Recurrence: ${getRecurrenceFromListRole(list.role)}`)

        if (newTasks.length > 0) {
          console.log(`   ✅ Will create ${newTasks.length} new tasks:`)
          newTasks.forEach(task => {
            console.log(`      - ${task.name} (${task.source}, ${task.recurrence})`)
          })
          listsWithNewTasks++
          totalNewTasks += newTasks.length
        }

        if (skippedCount > 0) {
          console.log(`   ⏭️  Will skip ${skippedCount} tasks (already exist)`)
          totalExistingTasks += skippedCount
        }
      } else {
        listsWithNoChanges++
      }
    }

    console.log('\n==========================================================')
    console.log('Summary:')
    console.log('==========================================================')
    console.log(`Lists analyzed: ${lists.length}`)
    console.log(`Lists with new tasks: ${listsWithNewTasks}`)
    console.log(`Lists with no changes: ${listsWithNoChanges}`)
    console.log(`Total new tasks to create: ${totalNewTasks}`)
    console.log(`Total tasks already exist: ${totalExistingTasks}`)

    if (totalNewTasks > 0) {
      console.log('\n✅ To apply these changes, run:')
      console.log('   node src/migrations/0017-migrate-list-tasks-to-collection.js')
    } else {
      console.log('\n✨ No migration needed - all tasks already exist')
    }

  } catch (error) {
    console.error('\n❌ Dry run failed:', error)
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
