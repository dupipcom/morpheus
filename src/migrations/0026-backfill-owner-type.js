/**
 * Migration 0026: Backfill ownerType USER (Phase 7)
 *
 * Set `ownerType: 'USER'` on every existing `List`, `Wallet` and `Project`
 * (defaults cover new rows; this normalises old ones for index use).
 *
 * Idempotent: updateMany is a no-op on already-normalised rows.
 *
 * Run with: node src/migrations/0026-backfill-owner-type.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

async function main() {
  const lists = await prisma.list.updateMany({
    where: { ownerType: { not: 'USER' } },
    data: { ownerType: 'USER' }
  })
  const wallets = await prisma.wallet.updateMany({
    where: { ownerType: { not: 'USER' } },
    data: { ownerType: 'USER' }
  })
  const projects = await prisma.project.updateMany({
    where: { ownerType: { not: 'USER' } },
    data: { ownerType: 'USER' }
  })

  console.log(`Done. Lists: ${lists.count}, Wallets: ${wallets.count}, Projects: ${projects.count}.`)
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
