/**
 * Migration: Backfill Days for user 68fed19c5cc5994cf6a51fd3
 *
 * Backfills Day records and AI_ENABLED Notes from three data sources:
 *   1. days-backfill.json — structured JSON daily data (Aug–Oct 2025)
 *   2. notion-v0.csv      — legacy Notion POC database export (2024)
 *   3. notion-v1.csv      — structured Notion export (2025)
 *
 * CSV sources create/update Day records with mood data and create AI_ENABLED Note
 * records from text content (Journal, Jots, "What's in your head?").
 * Existing Day records receive mood data only when not already populated.
 *
 * Before running:
 *   1. Ensure all three data files are present under src/migrations/data/.
 *   2. Set TARGET_USER_ID below to the actual Prisma user id.
 *   3. node src/migrations/0017-backfill-days.js
 *
 * Phase 1 — days-backfill.json field mapping:
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
 * Phase 2 — notion-v0.csv field mapping (1–5 integer scales):
 *   Day                    → date  (parsed "@Month DD, YYYY")
 *   Perceived Energy Levels → Day.mood.restedness
 *   Trust Levels            → Day.mood.trust
 *   Self-esteem Levels      → Day.mood.selfEsteem
 *   Pride Levels            → Day.mood.gratitude
 *   Optimism Levels         → Day.mood.optimism
 *   Stress Handle Levels    → Day.mood.tolerance
 *   (average computed from the 6 dimensions above)
 *   🗞️ Journal / Jots      → Note (visibility: AI_ENABLED) linked to Day
 *
 * Phase 3 — notion-v1.csv field mapping (1–5 integer scales):
 *   Task name              → date  (parsed "Your Life: @Month DD, YYYY")
 *   Mood: Rested           → Day.mood.restedness
 *   Mood: Trusting         → Day.mood.trust
 *   Mood: Attractive       → Day.mood.selfEsteem
 *   Mood: Grateful         → Day.mood.gratitude
 *   Mood: Optimistic       → Day.mood.optimism
 *   Mood: Relaxed          → Day.mood.tolerance
 *   Mood: Average          → Day.average  ("80%" → 4.0 on 1–5 scale, ÷ 20)
 *   What's in your head?   → Note (visibility: AI_ENABLED) linked to Day
 *
 * Skipped source fields (Phase 1): cadence, displayName, favorite, isEphemeral, done,
 *   tasksNumber, availableBalance, ticker (stored in analysis only), day-level contacts.
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

// ─── CSV Parser ──────────────────────────────────────────────────────────────

/**
 * Minimal RFC-4180-compliant CSV parser.
 * Handles quoted fields with embedded commas and newlines; strips UTF-8 BOM.
 * Returns an array of objects keyed by the header row.
 */
function parseCSV(content) {
  let pos = 0
  const n = content.length
  if (n > 0 && content.charCodeAt(0) === 0xFEFF) pos = 1  // strip BOM

  function readField() {
    if (pos >= n) return ''
    if (content[pos] === '"') {
      pos++  // consume opening quote
      let val = ''
      while (pos < n) {
        if (content[pos] === '"') {
          pos++
          if (pos < n && content[pos] === '"') { val += '"'; pos++ }  // escaped ""
          else break  // end of quoted field
        } else {
          val += content[pos++]
        }
      }
      return val
    }
    let val = ''
    while (pos < n && content[pos] !== ',' && content[pos] !== '\r' && content[pos] !== '\n') {
      val += content[pos++]
    }
    return val
  }

  function readRow() {
    const fields = []
    while (pos < n) {
      fields.push(readField())
      if (pos < n && content[pos] === ',') { pos++; continue }
      if (pos < n && content[pos] === '\r') pos++
      if (pos < n && content[pos] === '\n') pos++
      break
    }
    return fields
  }

  const headers = readRow()
  const rows = []
  while (pos < n) {
    const fields = readRow()
    if (fields.length > 1 || (fields.length === 1 && fields[0] !== '')) {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = fields[i] !== undefined ? fields[i] : '' })
      rows.push(obj)
    }
  }
  return rows
}

// ─── Notion Date / Text Helpers ───────────────────────────────────────────────

const MONTH_MAP = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
}

/**
 * Parse Notion-style dates to ISO "YYYY-MM-DD".
 * Handles "@Month DD, YYYY" (v0) and "Your Life: @Month DD, YYYY [time]" (v1).
 */
function parseNotionDate(raw) {
  if (!raw) return null
  const s = raw.replace(/^Your Life:\s*/i, '').replace(/^@/, '').trim()
  const m = s.match(/^(\w+)\s+(\d{1,2}),\s*(\d{4})/)
  if (!m) return null
  const month = MONTH_MAP[m[1].toLowerCase()]
  if (!month) return null
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/**
 * Strip Notion hyperlinks, keeping only the human-readable title text
 * that precedes each "(https://app.notion.com/...)" reference.
 */
function stripNotionLinks(text) {
if (!text) return ''
  return text
    .replace(/(.+?)\s*\(https?:\/\/(?:app\.notion\.com|www\.notion\.so)\/([^)]+)\)/g, '<a href="https://notion.so/$2">$1</a>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Notion-v0 Mapping ────────────────────────────────────────────────────────

/**
 * Map a notion-v0 CSV row to a Mood object.
 * All individual columns are 1–5 integer scales.
 *   Perceived Energy Levels → restedness
 *   Trust Levels            → trust
 *   Self-esteem Levels      → selfEsteem
 *   Pride Levels            → gratitude
 *   Optimism Levels         → optimism
 *   Stress Handle Levels    → tolerance
 */
function mapV0Mood(row) {
  const gratitude  = toFloat(row['Pride Levels'])
  const optimism   = toFloat(row['Optimism Levels'])
  const restedness = toFloat(row['Perceived Energy Levels'])
  const tolerance  = toFloat(row['Stress Handle Levels'])
  const selfEsteem = toFloat(row['Self-esteem Levels'])
  const trust      = toFloat(row['Trust Levels'])

  if ([gratitude, optimism, restedness, tolerance, selfEsteem, trust].every(v => v === null)) {
    return null
  }
  return {
    gratitude:  gratitude  ?? 0,
    optimism:   optimism   ?? 0,
    restedness: restedness ?? 0,
    tolerance:  tolerance  ?? 0,
    selfEsteem: selfEsteem ?? 0,
    trust:      trust      ?? 0,
  }
}

/**
 * Extract AI-enabled note sources from a notion-v0 row.
 * Strips Notion hyperlinks, keeping the human-readable entry titles.
 * Returns [{source, content}] for non-empty sources only.
 */
function extractV0Notes(row) {
  const notes = []

  const journal = stripNotionLinks(row['🗞️ Journal'] || '')
  if (journal && journal !== '0') {
    notes.push({ source: 'notion-v0/journal', content: journal })
  }

  const jots = stripNotionLinks(row['Jots'] || '')
  if (jots && jots !== '0') {
    notes.push({ source: 'notion-v0/jots', content: jots })
  }

  return notes
}

// ─── Notion-v1 Mapping ────────────────────────────────────────────────────────

/**
 * Map a notion-v1 CSV row to a Mood object.
 * All individual columns are 1–5 integer scales.
 *   Mood: Rested     → restedness
 *   Mood: Trusting   → trust
 *   Mood: Attractive → selfEsteem
 *   Mood: Grateful   → gratitude
 *   Mood: Optimistic → optimism
 *   Mood: Relaxed    → tolerance
 */
function mapV1Mood(row) {
  const gratitude  = toFloat(row['Mood: Grateful'])
  const optimism   = toFloat(row['Mood: Optimistic'])
  const restedness = toFloat(row['Mood: Rested'])
  const tolerance  = toFloat(row['Mood: Relaxed'])
  const selfEsteem = toFloat(row['Mood: Attractive'])
  const trust      = toFloat(row['Mood: Trusting'])

  if ([gratitude, optimism, restedness, tolerance, selfEsteem, trust].every(v => v === null)) {
    return null
  }
  return {
    gratitude:  gratitude  ?? 0,
    optimism:   optimism   ?? 0,
    restedness: restedness ?? 0,
    tolerance:  tolerance  ?? 0,
    selfEsteem: selfEsteem ?? 0,
    trust:      trust      ?? 0,
  }
}

/**
 * Parse "Mood: Average" from v1 — stored as percentage string "80%" —
 * and normalise to the 1–5 scale used by individual mood dimensions (÷ 20).
 */
function parseV1Average(raw) {
  if (!raw) return null
  const pct = parseFloat(String(raw).replace('%', ''))
  return isNaN(pct) ? null : pct / 20
}

/**
 * Extract AI-enabled note sources from a notion-v1 row.
 */
function extractV1Notes(row) {
  const content = (row["What's in your head?"] || '').trim()
  if (!content || content === '0') return []
  return [{ source: 'notion-v1/head', content }]
}

/** Compute the mean of all non-zero mood dimension values (null-safe). */
function computeMoodAverage(mood) {
  if (!mood) return null
  const vals = Object.values(mood).filter(v => v > 0)
  return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
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
  console.log(`\nMigration: Backfill Days for user ${TARGET_USER_ID}\n`)
  console.log(`── Phase 1: days-backfill.json ──`)
  console.log(`   ${dateKeys.length} entries\n`)

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

  console.log(`   Phase 1 → Created: ${created}  Updated: ${updated}  Skipped: ${skipped}  Errors: ${errors}`)

  // ─── Phase 2: notion-v0.csv ─────────────────────────────────────────────────
  const v0File = path.join(__dirname, 'data', 'notion-v0.csv')
  if (!fs.existsSync(v0File)) {
    console.warn(`\n⚠  notion-v0.csv not found at ${v0File} — skipping`)
  } else {
    console.log(`\n── Phase 2: notion-v0.csv ──`)
    const v0Rows = parseCSV(fs.readFileSync(v0File, 'utf8'))
    console.log(`   ${v0Rows.length} rows\n`)
    let v0Created = 0, v0Updated = 0, v0Notes = 0, v0Errors = 0

    for (const row of v0Rows) {
      // v0 first column may carry a BOM — try both key spellings
      const rawDay  = row['\uFEFFDay'] || row['Day'] || ''
      const dateKey = parseNotionDate(rawDay)
      if (!dateKey) continue  // skip rows with unparseable dates

      try {
        const mood    = mapV0Mood(row)
        const average = computeMoodAverage(mood)

        let day = await prisma.day.findUnique({
          where:  { userId_date: { userId: TARGET_USER_ID, date: dateKey } },
          select: { id: true, mood: true, average: true },
        })

        if (!day) {
          const dt    = new Date(dateKey + 'T00:00:00Z')
          const month = dt.getUTCMonth() + 1
          day = await prisma.day.create({
            data: {
              date:     dateKey,
              month,
              quarter:  toQuarter(month),
              semester: toSemester(month),
              mood:     mood    ?? undefined,
              average:  average ?? undefined,
              userId:   TARGET_USER_ID,
            },
          })
          v0Created++
          process.stdout.write(`  ✓ Created  ${dateKey} (v0)\n`)
        } else {
          const patch = {}
          if (!day.mood    && mood    !== null) patch.mood    = mood
          if (day.average == null && average !== null) patch.average = average
          if (Object.keys(patch).length > 0) {
            await prisma.day.update({ where: { id: day.id }, data: patch })
            v0Updated++
            process.stdout.write(`  ↻ Updated  ${dateKey} (v0 mood)\n`)
          }
        }

        // Create AI_ENABLED Notes from Journal / Jots columns
        for (const { content } of extractV0Notes(row)) {
          const dup = await prisma.note.findFirst({
            where:  { userId: TARGET_USER_ID, date: dateKey, content },
            select: { id: true },
          })
          if (dup) continue
          const note = await prisma.note.create({
            data: { content, date: dateKey, visibility: 'AI_ENABLED', userId: TARGET_USER_ID },
          })
          await prisma.day.update({
            where: { id: day.id },
            data:  { noteIds: { push: note.id } },
          })
          v0Notes++
        }
      } catch (err) {
        v0Errors++
        console.error(`  ✗ Error on ${dateKey} (v0): ${err.message}`)
      }
    }

    console.log(`   Phase 2 → Created: ${v0Created}  Updated: ${v0Updated}  Notes: ${v0Notes}  Errors: ${v0Errors}`)
    created += v0Created
    updated += v0Updated
    errors  += v0Errors
  }

  // ─── Phase 3: notion-v1.csv ─────────────────────────────────────────────────
  const v1File = path.join(__dirname, 'data', 'notion-v1.csv')
  if (!fs.existsSync(v1File)) {
    console.warn(`\n⚠  notion-v1.csv not found at ${v1File} — skipping`)
  } else {
    console.log(`\n── Phase 3: notion-v1.csv ──`)
    const v1Rows = parseCSV(fs.readFileSync(v1File, 'utf8'))
    console.log(`   ${v1Rows.length} rows\n`)
    let v1Created = 0, v1Updated = 0, v1Notes = 0, v1Errors = 0

    for (const row of v1Rows) {
      const rawName = row['\uFEFFTask name'] || row['Task name'] || ''
      const dateKey = parseNotionDate(rawName)
      if (!dateKey) continue

      try {
        const mood    = mapV1Mood(row)
        const average = parseV1Average(row['Mood: Average'])

        let day = await prisma.day.findUnique({
          where:  { userId_date: { userId: TARGET_USER_ID, date: dateKey } },
          select: { id: true, mood: true, average: true },
        })

        if (!day) {
          const dt    = new Date(dateKey + 'T00:00:00Z')
          const month = dt.getUTCMonth() + 1
          day = await prisma.day.create({
            data: {
              date:     dateKey,
              month,
              quarter:  toQuarter(month),
              semester: toSemester(month),
              mood:     mood    ?? undefined,
              average:  average ?? undefined,
              userId:   TARGET_USER_ID,
            },
          })
          v1Created++
          process.stdout.write(`  ✓ Created  ${dateKey} (v1)\n`)
        } else {
          const patch = {}
          if (!day.mood    && mood    !== null) patch.mood    = mood
          if (day.average == null && average !== null) patch.average = average
          if (Object.keys(patch).length > 0) {
            await prisma.day.update({ where: { id: day.id }, data: patch })
            v1Updated++
            process.stdout.write(`  ↻ Updated  ${dateKey} (v1 mood)\n`)
          }
        }

        // Create AI_ENABLED Notes from "What's in your head?" column
        for (const { content } of extractV1Notes(row)) {
          const dup = await prisma.note.findFirst({
            where:  { userId: TARGET_USER_ID, date: dateKey, content },
            select: { id: true },
          })
          if (dup) continue
          const note = await prisma.note.create({
            data: { content, date: dateKey, visibility: 'AI_ENABLED', userId: TARGET_USER_ID },
          })
          await prisma.day.update({
            where: { id: day.id },
            data:  { noteIds: { push: note.id } },
          })
          v1Notes++
        }
      } catch (err) {
        v1Errors++
        console.error(`  ✗ Error on ${dateKey} (v1): ${err.message}`)
      }
    }

    console.log(`   Phase 3 → Created: ${v1Created}  Updated: ${v1Updated}  Notes: ${v1Notes}  Errors: ${v1Errors}`)
    created += v1Created
    updated += v1Updated
    errors  += v1Errors
  }

  // ─── Combined summary ─────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────')
  console.log(`  Created : ${created}`)
  console.log(`  Updated : ${updated}`)
  console.log(`  Skipped : ${skipped}`)
  console.log(`  Errors  : ${errors}`)
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
