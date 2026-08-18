/**
 * Migration 0021: Create default wallets for existing users (Phase 6)
 *
 * One default wallet per existing user (kind USER, isDefault true, balance 0
 * minor units). Users who already have a default keep it; users with wallets
 * but no default get their oldest wallet marked default; users with none get
 * a fresh wallet.
 *
 * Idempotent: re-runs find every user already covered and do nothing.
 *
 * Run with: node src/migrations/0021-create-default-wallets.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true },
    orderBy: { createdAt: 'asc' }
  })
  console.log(`Found ${users.length} users`)

  let created = 0
  let marked = 0
  let skipped = 0

  for (const user of users) {
    const existingDefault = await prisma.wallet.findFirst({
      where: { userId: user.id, isDefault: true }
    })
    if (existingDefault) {
      skipped++
      continue
    }

    const oldest = await prisma.wallet.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' }
    })

    if (oldest) {
      await prisma.wallet.update({
        where: { id: oldest.id },
        data: { isDefault: true }
      })
      marked++
    } else {
      await prisma.wallet.create({
        data: {
          userId: user.id,
          name: 'Default',
          kind: 'USER',
          isDefault: true,
          ownerType: 'USER',
          balance: 0,
          pendingBalance: 0,
          address: null
        }
      })
      created++
    }

    if ((created + marked) % 50 === 0) {
      console.log(`Progress: ${created} created, ${marked} marked, ${skipped} skipped`)
    }
  }

  console.log(`Done. ${created} wallets created, ${marked} marked default, ${skipped} already had one.`)
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
