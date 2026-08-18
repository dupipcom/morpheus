/**
 * Migration 0028: Backfill event slugs (Phase 8)
 *
 * The Event collection is new, so there is nothing to slug on first run — but
 * the script exists so a re-run after a failed publish repairs any event
 * lacking a `publicUrl` (the slug is ALWAYS generated at creation; this is
 * the repair path only).
 *
 * Idempotent: only touches events with missing publicUrl.
 *
 * Run with: node src/migrations/0028-backfill-event-slugs.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

function slugify(name) {
  return (
    (name || 'event')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event'
  )
}

async function main() {
  const events = await prisma.event.findMany({ select: { id: true, name: true, publicUrl: true } })
  const missing = events.filter((e) => !e.publicUrl)
  console.log(`Found ${missing.length} events without publicUrl out of ${events.length} total`)

  const taken = new Set(events.filter((e) => e.publicUrl).map((e) => e.publicUrl))

  let updated = 0
  for (const event of missing) {
    let slug = `${slugify(event.name)}-${event.id.slice(-4)}`
    for (let attempt = 0; taken.has(slug) && attempt < 5; attempt++) {
      slug = `${slugify(event.name)}-${event.id.slice(-4)}-${attempt + 1}`
    }
    if (taken.has(slug)) slug = `${slug}-${Date.now()}`
    taken.add(slug)
    await prisma.event.update({ where: { id: event.id }, data: { publicUrl: slug } })
    updated++
  }

  console.log(`Done. Repaired ${updated} events.`)
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
