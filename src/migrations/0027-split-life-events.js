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
 * Run with: node src/migrations/0027-split-life-events.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

async function main() {
  const events = await prisma.event.findMany({ select: { id: true } })
  console.log(`Found ${events.length} legacy life events`)

  // 1. Copy into LifeEvent preserving _id
  let copied = 0
  for (const event of events) {
    const existing = await prisma.lifeEvent.findUnique({ where: { id: event.id }, select: { id: true } })
    if (existing) continue
    const source = await prisma.event.findUnique({ where: { id: event.id } })
    await prisma.lifeEvent.create({
      data: {
        id: source.id,
        name: source.name,
        quality: source.quality,
        visibility: source.visibility,
        userId: source.userId,
        noteIds: source.noteIds || [],
        documentIds: source.documentIds || [],
        createdAt: source.createdAt,
        updatedAt: source.updatedAt
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
