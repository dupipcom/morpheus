/**
 * Migration 0027: Split life events (Phase 8)
 *
 * The pre-Phase-8 `Event` model is a LIFE event (name + quality). Public
 * events take over the `Event` name, so every document is copied into a new
 * `LifeEvent` collection (preserving `_id`), every inbound reference is
 * rewritten, and the source documents are deleted:
 *   Note.eventIds → lifeEventIds
 *   Document.eventIds → lifeEventIds
 *   Day.eventIds → lifeEventIds
 *   Comment.eventId → lifeEventId (+ entityType 'event' rows keep their
 *     polymorphic value; the scalar relation is migrated)
 *   Task.events EmbeddedType[] snapshots are LEFT as-is — their ids still
 *     resolve against LifeEvent.
 *
 * Idempotent: keyed on "a LifeEvent with this _id already exists".
 *
 * NOTE: legacy Event documents predate the `publicUrl` field, which the
 * current Prisma client declares non-nullable — typed reads would throw
 * P2032. Step 1 therefore reads raw documents via $runCommandRaw; the rows
 * are deleted at the end of this migration, so no backfill is needed.
 *
 * Run with: node src/migrations/0027-split-life-events.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

/** Raw BSON ObjectId (or string / { $oid }) → hex string. */
function toObjectIdString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value?.$oid === 'string') return value.$oid
  const str = String(value)
  return str
}

/** Raw BSON date (Date instance, string, number or { $date }) → JS Date. */
function toDate(value) {
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  if (value?.$date) return new Date(value.$date)
  return new Date()
}

async function main() {
  const rawResult = await prisma.$runCommandRaw({ find: 'Event', filter: {}, limit: 1000 })
  const events = rawResult?.cursor?.firstBatch ?? []
  console.log(`Found ${events.length} legacy life events`)

  // 1. Copy into LifeEvent preserving _id
  let copied = 0
  for (const doc of events) {
    const id = toObjectIdString(doc._id)
    const existing = await prisma.lifeEvent.findUnique({ where: { id }, select: { id: true } })
    if (existing) continue
    await prisma.lifeEvent.create({
      data: {
        id,
        name: doc.name ?? '',
        quality: typeof doc.quality === 'number' ? doc.quality : null,
        visibility: doc.visibility ?? 'PRIVATE',
        userId: toObjectIdString(doc.userId),
        noteIds: Array.isArray(doc.noteIds) ? doc.noteIds.map(toObjectIdString) : [],
        documentIds: Array.isArray(doc.documentIds) ? doc.documentIds.map(toObjectIdString) : [],
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt)
      }
    })
    copied++
  }
  console.log(`Copied ${copied} events into LifeEvent`)

  // 2. Rewrite inbound references
  const notes = await prisma.note.findMany({ where: { eventIds: { isEmpty: false } }, select: { id: true, eventIds: true } })
  for (const note of notes) {
    await prisma.note.update({
      where: { id: note.id },
      data: { lifeEventIds: note.eventIds, eventIds: [] }
    })
  }
  console.log(`Rewrote ${notes.length} notes`)

  const documents = await prisma.document.findMany({ where: { eventIds: { isEmpty: false } }, select: { id: true, eventIds: true } })
  for (const document of documents) {
    await prisma.document.update({
      where: { id: document.id },
      data: { lifeEventIds: document.eventIds, eventIds: [] }
    })
  }
  console.log(`Rewrote ${documents.length} documents`)

  // Day: the old data lives under the DB field `eventIds`, which the new
  // client maps to lifeEventIds — a raw $rename moves it (idempotent: the
  // second run finds nothing to rename).
  const renamed = await prisma.$runCommandRaw({
    update: 'Day',
    updates: [
      { q: { eventIds: { $exists: true } }, u: { $rename: { eventIds: 'lifeEventIds' } }, multi: true }
    ]
  })
  console.log(`Renamed eventIds → lifeEventIds on ${renamed.nModified ?? 0} days`)

  const comments = await prisma.comment.findMany({ where: { eventId: { not: null } }, select: { id: true, eventId: true } })
  for (const comment of comments) {
    await prisma.comment.update({
      where: { id: comment.id },
      data: { lifeEventId: comment.eventId, eventId: null }
    })
  }
  console.log(`Rewrote ${comments.length} comments`)

  // 3. Delete source documents
  const deleted = await prisma.event.deleteMany({})
  console.log(`Deleted ${deleted.count} legacy event documents.`)
  console.log('Done.')
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
