/**
 * Migration 0024: Backfill ledger entries for settled legacy transfers (Phase 6)
 *
 * For SETTLED TRANSFER transactions normalized by 0022, write the paired
 * LedgerEntry rows (DEBIT from, CREDIT to) and replay balanceAfter in
 * createdAt order. Wallet balances start at 0 and are set to the replayed
 * result — any Kaleido holdings are NOT auto-credited (deliberate, separately
 * approved treasury action).
 *
 * Idempotent: skips transactions that already have entries; the balance replay
 * re-computes from scratch each run, so re-runs converge to the same state.
 *
 * Run with: node src/migrations/0024-backfill-ledger-entries.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

async function main() {
  const settled = await prisma.transaction.findMany({
    where: { status: 'SETTLED', kind: 'TRANSFER', fromWalletId: { not: null }, toWalletId: { not: null }, amountMinor: { not: null } },
    include: { entries: true },
    orderBy: { createdAt: 'asc' }
  })
  console.log(`Found ${settled.length} settled legacy transfers`)

  const balance = new Map() // walletId -> replayed minor-unit balance

  let written = 0
  let skipped = 0

  for (const transaction of settled) {
    if (transaction.entries.length > 0) {
      skipped++
      continue
    }

    const from = transaction.fromWalletId
    const to = transaction.toWalletId
    const amount = transaction.amountMinor

    const fromBefore = balance.get(from) ?? 0
    const toBefore = balance.get(to) ?? 0

    // Replay the movement
    balance.set(from, fromBefore - amount)
    balance.set(to, toBefore + amount)

    await prisma.ledgerEntry.createMany({
      data: [
        { transactionId: transaction.id, walletId: from, direction: 'DEBIT', amount, balanceAfter: fromBefore - amount },
        { transactionId: transaction.id, walletId: to, direction: 'CREDIT', amount, balanceAfter: toBefore + amount }
      ]
    })

    written++
    if (written % 50 === 0) console.log(`Wrote entries for ${written} transfers...`)
  }

  // Apply the replayed balances to wallets (balances start at 0; wallets not
  // involved in any legacy transfer stay at their default 0)
  let balanceUpdates = 0
  for (const [walletId, finalBalance] of balance) {
    await prisma.wallet.update({
      where: { id: walletId },
      data: { balance: finalBalance }
    })
    balanceUpdates++
  }

  console.log(`Done. ${written} transfer pairs written, ${skipped} skipped (already have entries), ${balanceUpdates} wallet balances applied.`)
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
