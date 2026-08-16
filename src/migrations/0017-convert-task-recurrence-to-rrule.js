/**
 * Migration: Convert Task.recurrence to RRULE strings (Do rebuild - Phase 1)
 *
 * Converts the legacy RecurrenceRule embedded type into an RFC-5545 RRULE string
 * on Task.rrule, sets Task.dtstart from firstOccurrence, snapshots all removed
 * fields into Task.legacy, maps legacy premium to premiumType, and unsets the
 * removed fields. Tasks without a recurrence rule inherit one from their list
 * role prefix (daily. -> FREQ=DAILY, weekly. -> FREQ=WEEKLY).
 *
 * Idempotent: legacy fields are unset at the end, so re-runs find nothing.
 *
 * Run with: node src/migrations/0017-convert-task-recurrence-to-rrule.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

// Legacy byWeekday stored JS getDay() numbers (0 = Sunday)
const JS_DAY_TO_RRULE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function extractId(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return value.$oid || value.oid || String(value)
  return value ?? null
}

function toDateString(value) {
  if (!value) return null
  // EJSON dates come as { $date: '...' }
  const raw = value && typeof value === 'object' && value.$date ? value.$date : value
  const d = new Date(raw)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * Build an RRULE string from a legacy RecurrenceRule object
 */
function buildRRule(recurrence) {
  if (!recurrence || typeof recurrence !== 'object') return null
  const frequency = recurrence.frequency
  if (!frequency || frequency === 'NONE') return null

  const parts = [`FREQ=${frequency}`]
  const interval = recurrence.interval || 1
  if (interval && interval !== 1) parts.push(`INTERVAL=${interval}`)

  const byWeekday = (recurrence.byWeekday || [])
    .map((n) => JS_DAY_TO_RRULE[n])
    .filter(Boolean)
  if (byWeekday.length > 0) parts.push(`BYDAY=${byWeekday.join(',')}`)

  const byMonthDay = recurrence.byMonthDay || []
  if (byMonthDay.length > 0) parts.push(`BYMONTHDAY=${byMonthDay.join(',')}`)

  const byMonth = recurrence.byMonth || []
  if (byMonth.length > 0) parts.push(`BYMONTH=${byMonth.join(',')}`)

  if (recurrence.endDate) {
    const until = new Date(recurrence.endDate)
    if (!isNaN(until.getTime())) {
      parts.push(`UNTIL=${until.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
    }
  } else if (recurrence.occurrenceCount) {
    parts.push(`COUNT=${recurrence.occurrenceCount}`)
  }

  return parts.join(';')
}

function deriveRRuleFromListRole(role) {
  const prefix = (role || '').split('.')[0]
  if (prefix === 'daily') return 'FREQ=DAILY'
  if (prefix === 'weekly') return 'FREQ=WEEKLY'
  return null
}

async function main() {
  console.log('Starting migration: Convert Task.recurrence to RRULE strings')

  // 1. Raw-read tasks that still carry legacy fields (new Prisma client no longer types them)
  const rawResult = await prisma.$runCommandRaw({
    find: 'Task',
    filter: {
      $or: [
        { recurrence: { $exists: true, $ne: null } },
        { firstOccurrence: { $exists: true } },
        { nextOccurrence: { $exists: true } },
        { lastOccurrence: { $exists: true } },
        { count: { $exists: true } },
        { budget: { $exists: true } },
        { earnings: { $exists: true } },
        { totalGains: { $exists: true } },
      ],
    },
  })

  const docs = rawResult?.cursor?.firstBatch || []
  console.log(`Found ${docs.length} tasks with legacy fields`)

  let converted = 0
  let errors = 0

  for (const doc of docs) {
    const id = extractId(doc._id)
    if (!id) {
      errors++
      console.error('  Task without usable _id, skipping')
      continue
    }

    try {
      // Role-derived rules are applied in pass 2 (needs the list relation, not present in raw docs)
      const rrule = buildRRule(doc.recurrence)
      const legacy = {
        recurrence: doc.recurrence ?? null,
        firstOccurrence: doc.firstOccurrence ?? null,
        nextOccurrence: doc.nextOccurrence ?? null,
        lastOccurrence: doc.lastOccurrence ?? null,
        count: doc.count ?? null,
        budget: doc.budget ?? null,
        earnings: doc.earnings ?? null,
        premium: doc.premium ?? null,
        totalGains: doc.totalGains ?? null,
      }
      const premium = typeof doc.premium === 'number' ? doc.premium : null

      await prisma.task.update({
        where: { id },
        data: {
          rrule,
          dtstart: toDateString(doc.firstOccurrence) ?? toDateString(doc.createdAt),
          premiumType: premium && premium > 0 ? 'FIAT' : null,
          legacy,
        },
      })
      converted++
    } catch (error) {
      errors++
      console.error(`  Error converting task ${id.substring(0, 8)}...:`, error.message)
    }
  }

  // 2. Tasks without any legacy fields: inherit recurrence from list role prefix
  const tasksWithoutRule = await prisma.task.findMany({
    where: { rrule: null, listId: { not: null } },
    select: { id: true, list: { select: { role: true } } },
  })

  let roleDerived = 0
  for (const task of tasksWithoutRule) {
    const rrule = deriveRRuleFromListRole(task.list?.role)
    if (!rrule) continue
    await prisma.task.update({ where: { id: task.id }, data: { rrule } })
    roleDerived++
  }
  console.log(`Derived RRULE from list role for ${roleDerived} tasks (${tasksWithoutRule.length} checked)`)

  // 3. Unset the removed fields for all tasks (idempotent)
  await prisma.$runCommandRaw({
    update: 'Task',
    updates: [
      { q: { recurrence: { $exists: true } }, u: { $unset: { recurrence: '' } }, multi: true },
      { q: { nextOccurrence: { $exists: true } }, u: { $unset: { nextOccurrence: '' } }, multi: true },
      { q: { lastOccurrence: { $exists: true } }, u: { $unset: { lastOccurrence: '' } }, multi: true },
      { q: { firstOccurrence: { $exists: true } }, u: { $unset: { firstOccurrence: '' } }, multi: true },
      { q: { count: { $exists: true } }, u: { $unset: { count: '' } }, multi: true },
      { q: { budget: { $exists: true } }, u: { $unset: { budget: '' } }, multi: true },
      { q: { earnings: { $exists: true } }, u: { $unset: { earnings: '' } }, multi: true },
      { q: { totalGains: { $exists: true } }, u: { $unset: { totalGains: '' } }, multi: true },
    ],
  })

  console.log('\nMigration completed:')
  console.log(`  Converted: ${converted}`)
  console.log(`  Role-derived: ${roleDerived}`)
  console.log(`  Errors: ${errors}`)

  // Verification
  const remaining = await prisma.$runCommandRaw({
    find: 'Task',
    filter: { $or: [{ recurrence: { $exists: true } }, { count: { $exists: true } }] },
  })
  console.log(`Verification: tasks still carrying legacy fields: ${(remaining?.cursor?.firstBatch || []).length}`)
}

main()
  .catch((e) => {
    console.error('Migration error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
