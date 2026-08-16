/**
 * Migration: Convert embedded Task.documents to Document records (Do rebuild - Phase 1)
 *
 * The legacy Task.documents embedded array (DocumentReference[]) is replaced by
 * the activated Document collection via Task.documentIds. Each reference becomes
 * a real Document record owned by the task's list owner, then the embedded array
 * is unset.
 *
 * Idempotent: the embedded array is unset at the end, so re-runs find nothing.
 *
 * Run with: node src/migrations/0019-convert-task-documents.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']
const VIDEO_FORMATS = ['mp4', 'mov', 'webm']

function extractId(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return value.$oid || value.oid || String(value)
  return value ?? null
}

function formatFromFileName(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : null
}

function kindFromFormat(format) {
  if (!format) return 'document'
  if (IMAGE_FORMATS.includes(format)) return 'image'
  if (VIDEO_FORMATS.includes(format)) return 'video'
  return 'document'
}

async function main() {
  console.log('Starting migration: Convert embedded Task.documents to Document records')

  // 1. Raw-read tasks that still carry the embedded documents array
  const rawResult = await prisma.$runCommandRaw({
    find: 'Task',
    filter: { $and: [{ documents: { $exists: true } }, { documents: { $ne: [] } }, { documents: { $ne: null } }] },
  })

  const docs = rawResult?.cursor?.firstBatch || []
  console.log(`Found ${docs.length} tasks with embedded documents`)

  let tasksMigrated = 0
  let documentsCreated = 0
  let errors = 0

  for (const doc of docs) {
    const taskId = extractId(doc._id)
    if (!taskId) {
      errors++
      console.error('  Task without usable _id, skipping')
      continue
    }

    const references = Array.isArray(doc.documents) ? doc.documents : []

    // Documents require an owner; use the task's list owner
    let ownerUserId = null
    const listId = extractId(doc.listId)
    if (listId) {
      const list = await prisma.list.findUnique({
        where: { id: listId },
        select: { users: true },
      })
      ownerUserId = list?.users.find((u) => u.role === 'OWNER')?.userId ?? null
    }
    if (!ownerUserId) {
      console.error(`  Task ${taskId.substring(0, 8)}... has no list owner, skipping ${references.length} document(s)`)
      errors++
      continue
    }

    try {
      const createdIds = []
      for (const ref of references) {
        const fileUrl = ref.fileUrl
        if (!fileUrl) continue
        const format = formatFromFileName(ref.fileName)
        const created = await prisma.document.create({
          data: {
            fileUrl,
            fileName: ref.fileName || fileUrl.split('/').pop() || 'document',
            fileFormat: format,
            kind: kindFromFormat(format),
            userId: ownerUserId,
            ...(listId ? { listIds: [listId] } : {}),
          },
        })
        createdIds.push(created.id)
        documentsCreated++
      }

      if (createdIds.length > 0) {
        await prisma.task.update({
          where: { id: taskId },
          data: { documentIds: createdIds },
        })
        tasksMigrated++
      }
    } catch (error) {
      errors++
      console.error(`  Error migrating task ${taskId.substring(0, 8)}...:`, error.message)
    }
  }

  // 2. Unset the embedded documents array for all tasks (idempotent)
  await prisma.$runCommandRaw({
    update: 'Task',
    updates: [
      { q: { documents: { $exists: true } }, u: { $unset: { documents: '' } }, multi: true },
    ],
  })

  console.log('\nMigration completed:')
  console.log(`  Tasks migrated: ${tasksMigrated}`)
  console.log(`  Documents created: ${documentsCreated}`)
  console.log(`  Errors: ${errors}`)

  // Verification
  const remaining = await prisma.$runCommandRaw({
    find: 'Task',
    filter: { documents: { $exists: true } },
  })
  console.log(`Verification: tasks still carrying embedded documents: ${(remaining?.cursor?.firstBatch || []).length}`)
}

main()
  .catch((e) => {
    console.error('Migration error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
