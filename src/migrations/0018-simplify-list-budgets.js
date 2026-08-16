/**
 * Migration: Simplify List budget fields (Do rebuild - Phase 1)
 *
 * Snapshots the removed legacy budget fields (templateTasks, remainingBudget,
 * premiumPercentage, budgetDistribution, listBudgetId, relatedBudgetIds) into
 * List.legacy, maps the legacy percentage-based budget onto the new simplified
 * fields (budgetType / budgetPercent), and unsets the removed fields.
 *
 * Mapping:
 * - premiumPercentage > 0  ->  budgetType: "PERCENT", budgetPercent = premiumPercentage
 * - else budget > 0        ->  budgetType: "FIAT"
 *
 * Idempotent: legacy fields are unset at the end, so re-runs find nothing.
 *
 * Run with: node src/migrations/0018-simplify-list-budgets.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

function extractId(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return value.$oid || value.oid || String(value)
  return value ?? null
}

async function main() {
  console.log('Starting migration: Simplify List budget fields')

  // 1. Raw-read lists that still carry legacy fields (new Prisma client no longer types them)
  const rawResult = await prisma.$runCommandRaw({
    find: 'List',
    filter: {
      $or: [
        { templateTasks: { $exists: true } },
        { remainingBudget: { $exists: true } },
        { premiumPercentage: { $exists: true } },
        { budgetDistribution: { $exists: true } },
        { listBudgetId: { $exists: true } },
        { relatedBudgetIds: { $exists: true } },
      ],
    },
  })

  const docs = rawResult?.cursor?.firstBatch || []
  console.log(`Found ${docs.length} lists with legacy fields`)

  let migrated = 0
  let errors = 0

  for (const doc of docs) {
    const id = extractId(doc._id)
    if (!id) {
      errors++
      console.error('  List without usable _id, skipping')
      continue
    }

    try {
      const premiumPercentage = typeof doc.premiumPercentage === 'number' ? doc.premiumPercentage : null
      const budget = typeof doc.budget === 'number' ? doc.budget : null

      const legacy = {
        templateTasks: doc.templateTasks ?? null,
        remainingBudget: doc.remainingBudget ?? null,
        premiumPercentage: premiumPercentage ?? null,
        budgetDistribution: doc.budgetDistribution ?? null,
        listBudgetId: extractId(doc.listBudgetId),
        relatedBudgetIds: (doc.relatedBudgetIds || []).map(extractId),
      }

      let budgetType = null
      let budgetPercent = null
      if (premiumPercentage && premiumPercentage > 0) {
        budgetType = 'PERCENT'
        budgetPercent = premiumPercentage
      } else if (budget && budget > 0) {
        budgetType = 'FIAT'
      }

      await prisma.list.update({
        where: { id },
        data: { legacy, budgetType, budgetPercent },
      })
      migrated++
    } catch (error) {
      errors++
      console.error(`  Error migrating list ${id.substring(0, 8)}...:`, error.message)
    }
  }

  // 2. Unset the removed fields for all lists (idempotent)
  await prisma.$runCommandRaw({
    update: 'List',
    updates: [
      { q: { templateTasks: { $exists: true } }, u: { $unset: { templateTasks: '' } }, multi: true },
      { q: { remainingBudget: { $exists: true } }, u: { $unset: { remainingBudget: '' } }, multi: true },
      { q: { premiumPercentage: { $exists: true } }, u: { $unset: { premiumPercentage: '' } }, multi: true },
      { q: { budgetDistribution: { $exists: true } }, u: { $unset: { budgetDistribution: '' } }, multi: true },
      { q: { listBudgetId: { $exists: true } }, u: { $unset: { listBudgetId: '' } }, multi: true },
      { q: { relatedBudgetIds: { $exists: true } }, u: { $unset: { relatedBudgetIds: '' } }, multi: true },
    ],
  })

  console.log('\nMigration completed:')
  console.log(`  Migrated: ${migrated}`)
  console.log(`  Errors: ${errors}`)

  // Verification
  const remaining = await prisma.$runCommandRaw({
    find: 'List',
    filter: { $or: [{ templateTasks: { $exists: true } }, { budgetDistribution: { $exists: true } }] },
  })
  console.log(`Verification: lists still carrying legacy fields: ${(remaining?.cursor?.firstBatch || []).length}`)
}

main()
  .catch((e) => {
    console.error('Migration error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
