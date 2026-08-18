/**
 * Migration 0023: Seed system wallets (Phase 6)
 *
 * SYSTEM:treasury — the issuer; allowance grants debit it, and it is allowed
 * to go negative (its negative balance is the DPIP in circulation).
 * SYSTEM:escrow — holds ticket funds until an event settles (Phase 9).
 *
 * Both belong to the first admin user (required by the Wallet.userId relation;
 * system wallets do NOT count against the user-created wallet cap).
 *
 * Idempotent: keyed on (kind, name) — re-runs find both and do nothing.
 *
 * Run with: node src/migrations/0023-seed-system-wallets.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

async function main() {
  const admin = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  })
  if (!admin) {
    console.log('No users exist yet — skipping (seed runs again safely later).')
    return
  }

  const seeds = [
    { name: 'SYSTEM:treasury', kind: 'SYSTEM' },
    { name: 'SYSTEM:escrow', kind: 'ESCROW' }
  ]

  let created = 0
  for (const seed of seeds) {
    const existing = await prisma.wallet.findFirst({
      where: { name: seed.name, kind: seed.kind }
    })
    if (existing) {
      console.log(`${seed.name} already exists (${existing.id})`)
      continue
    }

    await prisma.wallet.create({
      data: {
        userId: admin.id,
        name: seed.name,
        kind: seed.kind,
        ownerType: 'SYSTEM',
        isDefault: false,
        balance: 0,
        pendingBalance: 0,
        address: null
      }
    })
    created++
    console.log(`Seeded ${seed.name}`)
  }

  console.log(`Done. ${created} system wallets created.`)
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
