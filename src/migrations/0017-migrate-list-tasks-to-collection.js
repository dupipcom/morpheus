/**
 * Migration: Convert List templateTasks and ephemeralTasks to Task collection
 *
 * This migration creates Task collection entries for:
 * 1. All list.templateTasks
 * 2. All list.ephemeralTasks.open (if exists)
 * 3. All list.ephemeralTasks.closed (if exists)
 *
 * Recurrence mapping:
 * - Lists with role starting with "daily." → DAILY recurrence
 * - Lists with role starting with "weekly." → WEEKLY recurrence
 * - All other lists → NONE recurrence (one-off tasks)
 *
 * Run with: node src/migrations/0017-migrate-list-tasks-to-collection.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

/**
 * Determine recurrence rule based on list role
 */
function getRecurrenceFromListRole(listRole) {
  if (!listRole || typeof listRole !== 'string') {
    return null
  }

  if (listRole.startsWith('daily.')) {
    return {
      frequency: 'DAILY',
      interval: 1,
      byWeekday: [],
      byMonthDay: [],
      byMonth: []
    }
  }

  if (listRole.startsWith('weekly.')) {
    return {
      frequency: 'WEEKLY',
      interval: 1,
      byWeekday: [],
      byMonthDay: [],
      byMonth: []
    }
  }

  // One-off or custom lists get no recurrence
  return {
    frequency: 'NONE',
    interval: 1,
    byWeekday: [],
    byMonthDay: [],
    byMonth: []
  }
}

/**
 * Convert an embedded task to Task model data
 */
function convertEmbeddedTaskToTaskData(embeddedTask, listId, listRole, listArea) {
  const recurrence = getRecurrenceFromListRole(listRole)

  // Use task's area if available, otherwise fall back to list's area
  const area = embeddedTask.area || listArea || 'self'

  return {
    name: embeddedTask.name,
    categories: embeddedTask.categories || [],
    area: area,
    status: embeddedTask.status?.toUpperCase() || 'OPEN',
    recurrence: recurrence,
    nextOccurrence: embeddedTask.nextOccurrence || null,
    lastOccurrence: embeddedTask.lastOccurrence || null,
    firstOccurrence: embeddedTask.firstOccurrence || null,
    times: embeddedTask.times || null,
    count: embeddedTask.count || null,
    localeKey: embeddedTask.localeKey || null,
    completedOn: embeddedTask.completedOn || null,
    dueDate: embeddedTask.dueDate || null,
    budget: embeddedTask.budget || null,
    visibility: embeddedTask.visibility || null,
    quality: embeddedTask.quality || null,
    redacted: embeddedTask.redacted || false,
    persons: embeddedTask.persons || [],
    things: embeddedTask.things || [],
    events: embeddedTask.events || [],
    notes: embeddedTask.notes || [],
    documents: embeddedTask.documents || [],
    listId: listId
  }
}

/**
 * Get a unique key for a task to avoid duplicates
 */
function getTaskKey(task) {
  return task.localeKey || task.name?.toLowerCase() || ''
}

async function main() {
  console.log('Starting migration: Convert List tasks to Task collection')
  console.log('============================================================\n')

  try {
    // Fetch all lists with their embedded tasks
    // Use Prisma's findMany which will return all fields including those not in schema
    const lists = await prisma.list.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        area: true,
        templateTasks: true,
        // Note: ephemeralTasks is not in schema but may exist in MongoDB
        // We'll access it via the raw document if needed
      }
    })

    // For MongoDB, we also need to fetch raw documents to get ephemeralTasks
    // Since Prisma doesn't expose fields not in schema, we'll use runCommandRaw
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

    console.log(`Found ${lists.length} lists to process`)
    console.log(`Found ${ephemeralTasksMap.size} lists with ephemeral tasks\n`)

    let totalTasksCreated = 0
    let totalTasksSkipped = 0
    let totalErrors = 0
    const listResults = []

    for (const list of lists) {
      try {
        console.log(`\nProcessing list: ${list.name || list.id}`)
        console.log(`  Role: ${list.role || 'none'}`)
        console.log(`  Area: ${list.area || 'none'}`)

        const tasksToCreate = []
        const taskKeys = new Set()

        // 1. Process templateTasks
        if (Array.isArray(list.templateTasks) && list.templateTasks.length > 0) {
          console.log(`  Found ${list.templateTasks.length} template tasks`)

          for (const task of list.templateTasks) {
            const key = getTaskKey(task)
            if (key && !taskKeys.has(key)) {
              taskKeys.add(key)
              tasksToCreate.push({
                ...convertEmbeddedTaskToTaskData(task, list.id, list.role, list.area),
                source: 'templateTask'
              })
            }
          }
        }

        // 2. Process ephemeralTasks from the raw MongoDB data
        const ephemeralTasks = ephemeralTasksMap.get(list.id)

        if (ephemeralTasks?.open && Array.isArray(ephemeralTasks.open)) {
          console.log(`  Found ${ephemeralTasks.open.length} open ephemeral tasks`)

          for (const task of ephemeralTasks.open) {
            const key = getTaskKey(task)
            // Only add if we haven't seen this task key before
            if (key && !taskKeys.has(key)) {
              taskKeys.add(key)
              tasksToCreate.push({
                ...convertEmbeddedTaskToTaskData(task, list.id, list.role, list.area),
                source: 'ephemeralTask-open'
              })
            } else if (key) {
              console.log(`    Skipping duplicate ephemeral task: ${task.name}`)
            }
          }
        }

        // 3. Process ephemeralTasks.closed
        if (ephemeralTasks?.closed && Array.isArray(ephemeralTasks.closed)) {
          console.log(`  Found ${ephemeralTasks.closed.length} closed ephemeral tasks`)

          for (const task of ephemeralTasks.closed) {
            const key = getTaskKey(task)
            // Only add if we haven't seen this task key before
            if (key && !taskKeys.has(key)) {
              taskKeys.add(key)
              tasksToCreate.push({
                ...convertEmbeddedTaskToTaskData(task, list.id, list.role, list.area),
                source: 'ephemeralTask-closed'
              })
            } else if (key) {
              console.log(`    Skipping duplicate ephemeral task: ${task.name}`)
            }
          }
        }

        // Check if tasks already exist in Task collection for this list
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

        if (newTasks.length === 0) {
          console.log(`  No new tasks to create (${skippedCount} already exist)`)
          totalTasksSkipped += skippedCount
          listResults.push({
            listId: list.id,
            listName: list.name,
            created: 0,
            skipped: skippedCount,
            error: null
          })
          continue
        }

        console.log(`  Creating ${newTasks.length} new tasks (${skippedCount} already exist)`)

        // Create all tasks for this list
        const createdTasks = []
        for (const taskData of newTasks) {
          try {
            const { source, ...dataWithoutSource } = taskData
            const created = await prisma.task.create({
              data: dataWithoutSource
            })
            createdTasks.push({ ...created, source })
            console.log(`    ✓ Created task: ${created.name} (from ${source})`)
          } catch (error) {
            console.error(`    ✗ Failed to create task: ${taskData.name}`, error.message)
            totalErrors++
          }
        }

        totalTasksCreated += createdTasks.length
        totalTasksSkipped += skippedCount

        listResults.push({
          listId: list.id,
          listName: list.name,
          created: createdTasks.length,
          skipped: skippedCount,
          error: null
        })

        // Update migration metadata on the list
        await prisma.list.update({
          where: { id: list.id },
          data: {
            migrationMetadata: {
              migratedAt: new Date().toISOString(),
              migratedTaskKeys: Array.from(taskKeys),
              tasksCreated: createdTasks.length,
              tasksSkipped: skippedCount,
              migrationScript: '0017-migrate-list-tasks-to-collection'
            }
          }
        })

      } catch (error) {
        console.error(`  ✗ Error processing list ${list.id}:`, error.message)
        totalErrors++
        listResults.push({
          listId: list.id,
          listName: list.name,
          created: 0,
          skipped: 0,
          error: error.message
        })
      }
    }

    console.log('\n============================================================')
    console.log('Migration completed!')
    console.log('============================================================')
    console.log(`Lists processed: ${lists.length}`)
    console.log(`Tasks created: ${totalTasksCreated}`)
    console.log(`Tasks skipped (already exist): ${totalTasksSkipped}`)
    console.log(`Errors: ${totalErrors}`)

    // Summary by list
    console.log('\nResults by list:')
    listResults.forEach(result => {
      console.log(`  ${result.listName || result.listId}:`)
      console.log(`    Created: ${result.created}`)
      console.log(`    Skipped: ${result.skipped}`)
      if (result.error) {
        console.log(`    Error: ${result.error}`)
      }
    })

    // Verify the migration
    console.log('\nVerifying migration...')
    const totalTasksInDb = await prisma.task.count()
    console.log(`Total tasks in database: ${totalTasksInDb}`)

    // Check for lists that still have templateTasks but no Task records
    const listsNeedingMigration = await prisma.list.findMany({
      where: {
        templateTasks: { isEmpty: false }
      },
      include: {
        tasks: { select: { id: true } }
      }
    })

    const listsWithoutTasks = listsNeedingMigration.filter(l => l.tasks.length === 0)
    if (listsWithoutTasks.length > 0) {
      console.log(`\n⚠️  WARNING: ${listsWithoutTasks.length} lists still have templateTasks but no Task records`)
      console.log('These lists may need manual review:')
      listsWithoutTasks.forEach(l => {
        console.log(`  - ${l.name || l.id} (${l.templateTasks.length} template tasks)`)
      })
    } else {
      console.log('✅ All lists with templateTasks have corresponding Task records')
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
