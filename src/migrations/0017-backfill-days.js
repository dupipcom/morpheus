/**
 * Migration: Backfill Days for user 68fed19c5cc5994cf6a51fd3
 *
 * Reads legacy day data from src/migrations/data/days-backfill.json and upserts
 * each date entry into the Day collection, preserving all existing records.
 *
 * Before running:
 *   1. Save the source data file as:
 *        src/migrations/data/days-backfill.json
 *      The file content should be the raw JSON object body (without outer braces).
 *      The migration wraps it automatically, so either format works:
 *        - With outer braces:    { "2025-08-01": { ... }, ... }
 *        - Without outer braces: "2025-08-01": { ... }, ...
 *
 *   2. node src/migrations/0017-backfill-days.js
 *
 * Field mapping:
 *   date, week, month               → Day.date, .week, .month
 *   month                           → Day.quarter (ceil(month/3)), .semester (1|2)
 *   tasks[].name                    → EmbeddedTask.name  (required)
 *   tasks[].area                    → EmbeddedTask.area  (Areas enum: self|home|social|work)
 *   tasks[].categories              → EmbeddedTask.categories (Category[])
 *   tasks[].status                  → EmbeddedTask.status (string)
 *   tasks[].times                   → EmbeddedTask.times
 *   tasks[].count                   → EmbeddedTask.count (nullable)
 *   tasks[].localeKey               → EmbeddedTask.localeKey
 *   tasks[].contacts[]{id,name}     → EmbeddedTask.persons (PersonReference, drops interactionQuality)
 *   moodAverage                     → Day.average
 *   mood{gratitude,optimism,...}    → Day.mood (Mood)
 *   progress                        → Day.progress
 *   earnings                        → Day.balance (parsed as float)
 *   text, ticker, day-level contacts, status → Day.analysis (stored as JSON)
 *
 * Skipped source fields: cadence, displayName, favorite, isEphemeral, done, tasksNumber,
 *   availableBalance, ticker (stored in analysis only), contacts at day level (stored in analysis)
 */

const path = require('path')
const fs   = require('fs')
const { PrismaClient } = require('../../generated/prisma')

const prisma = new PrismaClient()

// ─── Target user ──────────────────────────────────────────────────────────────
const TARGET_USER_ID = '<TARGET_USER_ID>'  // <-- REPLACE with actual user ID before running

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive ISO quarter (1–4) from month number (1–12) */
function toQuarter(month) {
  return Math.ceil(month / 3)
}

/** Derive semester (1 or 2) from month number */
function toSemester(month) {
  return month <= 6 ? 1 : 2
}

/** Safely parse a value as Float, returning null if invalid */
function toFloat(val) {
  if (val === null || val === undefined || val === '') return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

/**
 * Map a raw task object from the legacy format to a Prisma EmbeddedTask shape.
 * Unknown/extra fields (cadence, displayName, favorite, isEphemeral) are dropped.
 */
function mapTask(t) {
  // Map contacts → persons (PersonReference requires id + name only)
  const persons = Array.isArray(t.contacts)
    ? t.contacts
        .filter(c => c && c.id && c.name)
        .map(c => ({ id: c.id, name: c.name }))
    : []

  return {
    name:      t.name,
    area:      t.area,                          // Areas enum value
    categories: Array.isArray(t.categories) ? t.categories : [],
    status:    t.status || 'Open',
    times:     t.times   != null ? parseInt(t.times, 10)  : null,
    count:     t.count   != null ? parseInt(t.count, 10)  : null,
    localeKey: t.localeKey || null,
    persons,
    things:    [],                              // not present in legacy data
    events:    [],
    notes:     [],
    documents: [],
    id:        t.id   || null,
    createdAt: t.createdAt || null,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load and parse data file
  const dataFile = path.join(__dirname, 'data', 'days-backfill.json')
  if (!fs.existsSync(dataFile)) {
    console.error(`\nData file not found: ${dataFile}`)
    console.error('Please save the source data there before running this migration.\n')
    process.exit(1)
  }

  let rawContent = fs.readFileSync(dataFile, 'utf8').trim()

  // Support both "{ ... }" and bare "key: value, ..." formats
  if (!rawContent.startsWith('{')) {
    rawContent = `{${rawContent}}`
  }
  // Strip trailing commas before closing brace (common in exports)
  rawContent = rawContent.replace(/,\s*}$/, '}')

  let daysData
  try {
    daysData = JSON.parse(rawContent)
  } catch (err) {
    console.error('Failed to parse days-backfill.json:', err.message)
    process.exit(1)
  }

  const dateKeys = Object.keys(daysData).sort()
  console.log(`\nMigration: Backfill Days for user ${TARGET_USER_ID}`)
  console.log(`Found ${dateKeys.length} date entries to process\n`)

  // 2. Verify the user exists
  const user = await prisma.user.findUnique({ where: { id: TARGET_USER_ID } })
  if (!user) {
    console.error(`User ${TARGET_USER_ID} not found in database. Aborting.`)
    process.exit(1)
  }
  console.log(`User found: ${user.userId || user.id}\n`)

  let created  = 0
  let updated  = 0
  let skipped  = 0
  let errors   = 0

  // 3. Process each day
  for (const dateKey of dateKeys) {
    const src = daysData[dateKey]

    try {
      const month    = src.month   ? parseInt(src.month,  10) : null
      const week     = src.week    ? parseInt(src.week,   10) : null
      const quarter  = month ? toQuarter(month)  : null
      const semester = month ? toSemester(month) : null

      // Map tasks
      const tasks = Array.isArray(src.tasks)
        ? src.tasks.filter(t => t && t.name).map(mapTask)
        : []

      // Map mood
      const mood = src.mood && typeof src.mood === 'object' ? {
        gratitude:  toFloat(src.mood.gratitude)  ?? 0,
        optimism:   toFloat(src.mood.optimism)   ?? 0,
        restedness: toFloat(src.mood.restedness) ?? 0,
        tolerance:  toFloat(src.mood.tolerance)  ?? 0,
        selfEsteem: toFloat(src.mood.selfEsteem) ?? 0,
        trust:      toFloat(src.mood.trust)      ?? 0,
      } : null

      // Store legacy fields that don't have a direct column in analysis
      const analysis = {}
      if (src.text)     analysis.text     = src.text
      if (src.ticker   != null) analysis.ticker   = toFloat(src.ticker)
      if (src.status)   analysis.dayStatus = src.status          // "Open"/"Closed"
      if (src.done     != null) analysis.done      = src.done
      if (src.tasksNumber != null) analysis.tasksNumber = src.tasksNumber
      if (src.availableBalance != null) analysis.availableBalance = src.availableBalance
      // Day-level contacts (stored as extra context, not mapped to relations)
      if (Array.isArray(src.contacts) && src.contacts.length > 0) {
        analysis.contacts = src.contacts
      }

      const dayData = {
        date:     dateKey,
        week,
        month,
        quarter,
        semester,
        tasks,
        mood:     mood ?? undefined,
        average:  toFloat(src.moodAverage),
        progress: toFloat(src.progress),
        balance:  toFloat(src.earnings),
        analysis: Object.keys(analysis).length > 0 ? analysis : undefined,
        userId:   TARGET_USER_ID,
      }

      // Upsert using the compound unique index [userId, date]
      const existing = await prisma.day.findUnique({
        where: { userId_date: { userId: TARGET_USER_ID, date: dateKey } },
        select: { id: true }
      })

      if (existing) {
        await prisma.day.update({
          where: { id: existing.id },
          data:  dayData,
        })
        updated++
        process.stdout.write(`  ↻ Updated  ${dateKey}\n`)
      } else {
        await prisma.day.create({ data: dayData })
        created++
        process.stdout.write(`  ✓ Created  ${dateKey}\n`)
      }
    } catch (err) {
      errors++
      console.error(`  ✗ Error on ${dateKey}: ${err.message}`)
    }
  }

  console.log('\n─────────────────────────────────────')
  console.log(`  Created : ${created}`)
  console.log(`  Updated : ${updated}`)
  console.log(`  Skipped : ${skipped}`)
  console.log(`  Errors  : ${errors}`)
  console.log(`  Total   : ${dateKeys.length}`)
  console.log('─────────────────────────────────────\n')

  if (errors > 0) {
    console.warn(`Migration completed with ${errors} error(s). Review the output above.`)
    process.exit(1)
  }
}

main()
  .catch(err => {
    console.error('Fatal migration error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
