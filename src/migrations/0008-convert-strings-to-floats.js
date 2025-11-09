/**
 * PRISMA DATA MIGRATION SCRIPT
 * -----------------------------
 *
 * Purpose:
 * Convert string values to float numbers for:
 * - user.stash
 * - user.equity
 * - user.availableBalance
 * - user.totalEarnings
 * - user.entries[year].days[date].earnings
 * - user.entries[year].weeks[week].earnings
 * - user.entries[year].oneOffs[date].earnings
 * - user.entries[year].days[date].prize
 * - user.entries[year].weeks[week].prize
 * - user.entries[year].oneOffs[date].prize
 * - user.entries[year].days[date].profit
 * - user.entries[year].weeks[week].profit
 * - user.entries[year].oneOffs[date].profit
 * - user.entries[year].days[date].availableBalance
 * - user.entries[year].weeks[week].availableBalance
 *
 * How to Run:
 * 1. Save this file in your project (e.g., src/migrations)
 * 2. Run from terminal: `node src/migrations/0008-convert-strings-to-floats.js`
 *
 * IMPORTANT: Always back up your database before running a migration script.
 */

const { PrismaClient } = require('../../generated/prisma')

// Logger helper function for consistent console logging format
const logger = (str, originalMessage) => {
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

  const isDb = str.includes('db')
  const isError = str.includes('error')
  const isIdle = str.includes('idle')
  const isWarning = str.includes('warning')

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

const prisma = new PrismaClient()

/**
 * Convert a value to float if it's a string, otherwise return as-is
 */
function toFloat(value) {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? 0 : parsed
  }
  return value
}

/**
 * Convert completers array from strings to floats
 */
function convertCompletersToFloats(completers) {
  if (!Array.isArray(completers)) {
    return completers
  }

  const converted = completers.map(completer => {
    if (!completer || typeof completer !== 'object') {
      return completer
    }

    const updated = { ...completer }
    let completerModified = false

    if (typeof completer.earnings === 'string') {
      updated.earnings = toFloat(completer.earnings)
      completerModified = true
    }
    if (typeof completer.prize === 'string') {
      updated.prize = toFloat(completer.prize)
      completerModified = true
    }

    return completerModified ? updated : completer
  })

  return converted.some((c, i) => c !== completers[i]) ? converted : completers
}

/**
 * Convert tasks array and their completers from strings to floats
 */
function convertTasksToFloats(tasks) {
  if (!Array.isArray(tasks)) {
    return tasks
  }

  const converted = tasks.map(task => {
    if (!task || typeof task !== 'object') {
      return task
    }

    const updated = { ...task }
    let taskModified = false

    // Convert completers if they exist
    if (Array.isArray(task.completers)) {
      const convertedCompleters = convertCompletersToFloats(task.completers)
      if (convertedCompleters !== task.completers) {
        updated.completers = convertedCompleters
        taskModified = true
      }
    }

    return taskModified ? updated : task
  })

  return converted.some((t, i) => t !== tasks[i]) ? converted : tasks
}

/**
 * Convert entries structure from strings to floats
 */
function convertEntriesToFloats(entries) {
  if (!entries || typeof entries !== 'object') {
    return entries
  }

  let wasModified = false
  const converted = { ...entries }

  // Process all years
  for (const yearKey in converted) {
    if (Object.prototype.hasOwnProperty.call(converted, yearKey)) {
      const year = parseInt(yearKey)
      if (isNaN(year)) continue

      const yearData = converted[year]
      if (!yearData || typeof yearData !== 'object') continue

      const updatedYearData = { ...yearData }

      // Process days
      if (yearData.days && typeof yearData.days === 'object') {
        const days = { ...yearData.days }
        for (const dateKey in days) {
          if (Object.prototype.hasOwnProperty.call(days, dateKey)) {
            const dayData = days[dateKey]
            if (!dayData || typeof dayData !== 'object') continue

            const updatedDay = { ...dayData }
            let dayModified = false

            // Convert earnings, prize, profit, availableBalance
            if (typeof dayData.earnings === 'string') {
              updatedDay.earnings = toFloat(dayData.earnings)
              dayModified = true
            }
            if (typeof dayData.prize === 'string') {
              updatedDay.prize = toFloat(dayData.prize)
              dayModified = true
            }
            if (typeof dayData.profit === 'string') {
              updatedDay.profit = toFloat(dayData.profit)
              dayModified = true
            }
            if (typeof dayData.availableBalance === 'string') {
              updatedDay.availableBalance = toFloat(dayData.availableBalance)
              dayModified = true
            }

            // Convert tasks and their completers if they exist
            if (Array.isArray(dayData.tasks)) {
              const convertedTasks = convertTasksToFloats(dayData.tasks)
              if (convertedTasks !== dayData.tasks) {
                updatedDay.tasks = convertedTasks
                dayModified = true
              }
            }

            if (dayModified) {
              days[dateKey] = updatedDay
              wasModified = true
            }
          }
        }
        updatedYearData.days = days
      }

      // Process weeks
      if (yearData.weeks && typeof yearData.weeks === 'object') {
        const weeks = { ...yearData.weeks }
        for (const weekKey in weeks) {
          if (Object.prototype.hasOwnProperty.call(weeks, weekKey)) {
            const weekData = weeks[weekKey]
            if (!weekData || typeof weekData !== 'object') continue

            const updatedWeek = { ...weekData }
            let weekModified = false

            // Convert earnings, prize, profit, availableBalance
            if (typeof weekData.earnings === 'string') {
              updatedWeek.earnings = toFloat(weekData.earnings)
              weekModified = true
            }
            if (typeof weekData.prize === 'string') {
              updatedWeek.prize = toFloat(weekData.prize)
              weekModified = true
            }
            if (typeof weekData.profit === 'string') {
              updatedWeek.profit = toFloat(weekData.profit)
              weekModified = true
            }
            if (typeof weekData.availableBalance === 'string') {
              updatedWeek.availableBalance = toFloat(weekData.availableBalance)
              weekModified = true
            }

            // Convert tasks and their completers if they exist
            if (Array.isArray(weekData.tasks)) {
              const convertedTasks = convertTasksToFloats(weekData.tasks)
              if (convertedTasks !== weekData.tasks) {
                updatedWeek.tasks = convertedTasks
                weekModified = true
              }
            }

            if (weekModified) {
              weeks[weekKey] = updatedWeek
              wasModified = true
            }
          }
        }
        updatedYearData.weeks = weeks
      }

      // Process oneOffs
      if (yearData.oneOffs && typeof yearData.oneOffs === 'object') {
        const oneOffs = { ...yearData.oneOffs }
        for (const dateKey in oneOffs) {
          if (Object.prototype.hasOwnProperty.call(oneOffs, dateKey)) {
            const oneOffData = oneOffs[dateKey]
            if (!oneOffData || typeof oneOffData !== 'object') continue

            const updatedOneOff = { ...oneOffData }
            let oneOffModified = false

            // Convert earnings, prize, profit
            if (typeof oneOffData.earnings === 'string') {
              updatedOneOff.earnings = toFloat(oneOffData.earnings)
              oneOffModified = true
            }
            if (typeof oneOffData.prize === 'string') {
              updatedOneOff.prize = toFloat(oneOffData.prize)
              oneOffModified = true
            }
            if (typeof oneOffData.profit === 'string') {
              updatedOneOff.profit = toFloat(oneOffData.profit)
              oneOffModified = true
            }

            // Convert tasks and their completers if they exist
            if (Array.isArray(oneOffData.tasks)) {
              const convertedTasks = convertTasksToFloats(oneOffData.tasks)
              if (convertedTasks !== oneOffData.tasks) {
                updatedOneOff.tasks = convertedTasks
                oneOffModified = true
              }
            }

            if (oneOffModified) {
              oneOffs[dateKey] = updatedOneOff
              wasModified = true
            }
          }
        }
        updatedYearData.oneOffs = oneOffs
      }

      if (wasModified) {
        converted[year] = updatedYearData
      }
    }
  }

  return wasModified ? converted : entries
}

async function main() {
  logger('migration_start', 'Converting string values to floats for user fields and entries')

  // Use Prisma's $runCommandRaw to fetch users without type checking
  // This bypasses Prisma's type validation
  const usersResult = await prisma.$runCommandRaw({
    find: 'User',
    filter: {},
    projection: {
      _id: 1,
      stash: 1,
      equity: 1,
      availableBalance: 1,
      totalEarnings: 1,
      entries: 1
    }
  })

  const users = usersResult.cursor.firstBatch || []
  logger('migration_documents_found', `Found ${users.length} users`)

  let usersUpdated = 0
  let usersSkipped = 0

  for (const user of users) {
    let wasModified = false
    const updateData = {}

    // Convert stash
    if (typeof user.stash === 'string') {
      updateData.stash = toFloat(user.stash)
      wasModified = true
    }

    // Convert equity
    if (typeof user.equity === 'string') {
      updateData.equity = toFloat(user.equity)
      wasModified = true
    }

    // Convert availableBalance
    if (typeof user.availableBalance === 'string') {
      updateData.availableBalance = toFloat(user.availableBalance)
      wasModified = true
    }

    // Convert totalEarnings
    if (typeof user.totalEarnings === 'string') {
      updateData.totalEarnings = toFloat(user.totalEarnings)
      wasModified = true
    }

    // Convert entries
    const convertedEntries = convertEntriesToFloats(user.entries)
    if (convertedEntries !== user.entries) {
      updateData.entries = convertedEntries
      wasModified = true
    }

    if (wasModified) {
      usersUpdated++
      // Use $runCommandRaw to update without type checking
      await prisma.$runCommandRaw({
        update: 'User',
        updates: [{
          q: { _id: user._id },
          u: { $set: updateData }
        }]
      })
      logger('migration_user_update', `User ${user._id} updated`)
    } else {
      usersSkipped++
    }
  }

  logger('migration_success', 'Migration completed successfully')
  logger('migration_summary', {
    totalUsers: users.length,
    usersUpdated,
    usersSkipped
  })
}

main()
  .catch((e) => {
    logger('migration_failed', `Migration failed: ${e}`)
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

