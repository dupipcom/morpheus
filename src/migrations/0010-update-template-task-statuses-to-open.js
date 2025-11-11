/**
 * PRISMA DATA MIGRATION SCRIPT
 * -----------------------------
 *
 * Purpose:
 * Update all task statuses in Template documents to "open".
 * This migration replaces any status value (e.g., "Not started", "Open", etc.)
 * with "open" for all tasks in all templates.
 *
 * How to Run:
 *   node src/migrations/0010-update-template-task-statuses-to-open.js
 *
 * IMPORTANT:
 * ALWAYS back up your database before running a migration script.
 */

const { PrismaClient } = require('../../generated/prisma')

// Logger helper function for consistent console logging format
const logger = (str, originalMessage) => {
  // Convert objects to strings to avoid circular references
  let message = str
  if (originalMessage !== undefined) {
    if (typeof originalMessage === 'object') {
      try {
        message = `${str} - ${JSON.stringify(originalMessage, null, 2)}`
      } catch (error) {
        message = `${str} - [Object - circular reference or non-serializable]`
      }
    } else {
      message = `${str} - ${String(originalMessage)}`
    }
  }

  // Determine colors based on message content
  const isDb = str.includes('db')
  const isError = str.includes('error')
  const isIdle = str.includes('idle')
  const isWarning = str.includes('warning')

  // Create console.log color settings object
  const colorSettings = {
    background: isDb ? 'cyan' : '#1f1f1f',
    color: isError ? 'red' : isIdle || isWarning ? 'yellow' : 'green',
    fontWeight: 'bold',
    padding: '2px 4px',
    borderRadius: '3px'
  }

  console.log(
    `%cdpip::morpheus::${message}`,
    `background: ${colorSettings.background}; color: ${colorSettings.color}; font-weight: ${colorSettings.fontWeight}; padding: ${colorSettings.padding}; border-radius: ${colorSettings.borderRadius};`
  )
}

// Instantiate Prisma Client
const prisma = new PrismaClient()

/**
 * The main migration function.
 */
async function main() {
  logger('migration_start', 'Updating template task statuses to "open"')

  // 1. Fetch all templates from the database
  const templates = await prisma.template.findMany({
    select: {
      id: true,
      tasks: true
    }
  })

  logger('migration_templates_found', `Found ${templates.length} templates`)

  let updatedCount = 0
  let totalTasksUpdated = 0
  const updatePromises = []

  // 2. Loop through each template
  for (const template of templates) {
    const tasks = Array.isArray(template.tasks) ? template.tasks : []
    
    if (tasks.length === 0) {
      logger('migration_skip_empty_template', { templateId: template.id })
      continue
    }

    // 3. Update all task statuses to "open"
    let hasChanges = false
    const updatedTasks = tasks.map((task) => {
      if (!task || typeof task !== 'object') {
        return task
      }

      const currentStatus = task.status || task.taskStatus
      
      // Only update if status exists and is not already "open"
      if (currentStatus && currentStatus !== 'open' && currentStatus !== 'Open') {
        hasChanges = true
        totalTasksUpdated++
        
        // Create updated task object
        const updatedTask = { ...task }
        
        // Update status field (remove taskStatus if it exists, set status to "open")
        if (updatedTask.taskStatus) {
          delete updatedTask.taskStatus
        }
        updatedTask.status = 'open'
        
        logger('migration_task_status_updated', {
          templateId: template.id,
          taskName: task.name || 'unnamed',
          oldStatus: currentStatus,
          newStatus: 'open'
        })
        
        return updatedTask
      }
      
      // Ensure status is set to "open" even if it was missing
      if (!currentStatus) {
        hasChanges = true
        totalTasksUpdated++
        return {
          ...task,
          status: 'open',
          ...(task.taskStatus && { taskStatus: undefined })
        }
      }
      
      return task
    })

    // 4. If tasks were modified, add update operation
    if (hasChanges) {
      updatedCount++
      const updatePromise = prisma.template.update({
        where: { id: template.id },
        data: {
          tasks: updatedTasks
        }
      })
      updatePromises.push(updatePromise)
      logger('migration_template_queued_for_update', {
        templateId: template.id,
        tasksUpdated: updatedTasks.filter((t, i) => t !== tasks[i]).length
      })
    }
  }

  // 5. Execute all update promises in a single transaction
  if (updatePromises.length > 0) {
    logger('migration_applying_updates', `Applying ${updatedCount} template updates (${totalTasksUpdated} tasks total)`)
    await prisma.$transaction(updatePromises)
    logger('migration_success', `Successfully updated ${updatedCount} templates with ${totalTasksUpdated} tasks`)
  } else {
    logger('migration_complete', 'No templates needed updates - all tasks already have status "open"')
  }
}

// 6. Execute the main function and handle potential errors
main()
  .catch((e) => {
    logger('migration_failed', `Migration failed: ${e.message || e}`)
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    // 7. Ensure the Prisma Client disconnects after the script finishes
    await prisma.$disconnect()
  })

