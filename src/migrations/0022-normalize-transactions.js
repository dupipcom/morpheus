/**
 * Migration 0022: Normalize legacy transactions (Phase 6)
 *
 * IMPORTANT: run BEFORE pushing the schema change that adds the unique index
 * on Transaction.reference — Mongo unique indexes reject duplicate nulls, so
 * every row must carry a reference before the index can be built.
 *
 * - status/type: lowercase legacy values → the new enums-as-strings
 *   ('pending' → 'PENDING', 'transfer' → 'TRANSFER' as kind)
 * - amountMinor: round(amount × 100) — legacy `amount` is kept for old rows
 * - reference: backfilled as `legacy:<_id>` (idempotency-safe, unique)
 * - fromWalletId/toWalletId: resolved from fromAddress/toAddress where a
 *   wallet with that address exists
 * - unresolvable rows → status FAILED, failureReason 'legacy-unsettled'
 *   (they never moved value: no ledger entries are written)
 *
 * Idempotent: only touches rows missing reference/amountMinor; re-runs find
 * nothing left to do.
 *
 * Run with: node src/migrations/0022-normalize-transactions.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

function normalizeStatus(status) {
  if (!status) return 'FAILED'
  return String(status).toUpperCase()
}

function normalizeKind(type) {
  if (!type) return 'TRANSFER'
  const upper = String(type).toUpperCase()
  if (upper === 'TRANSFER') return 'TRANSFER'
  if (upper === 'PURCHASE' || upper === 'PAYMENT') return 'TICKET_PURCHASE'
  return 'ADJUSTMENT'
}

async function main() {
  const transactions = await prisma.transaction.findMany({
    select: { id: true, amount: true, reference: true, fromAddress: true, toAddress: true, status: true, type: true }
  })
  console.log(`Found ${transactions.length} transactions`)

  // Wallet lookup by address (single pass — no N+1 per row)
  const addresses = new Set(
    transactions.flatMap((t) => [t.fromAddress, t.toAddress]).filter(Boolean)
  )
  const wallets = await prisma.wallet.findMany({
    where: { address: { in: [...addresses] } },
    select: { id: true, address: true }
  })
  const walletByAddress = new Map(wallets.map((w) => [w.address, w.id]))

  let updated = 0
  let failed = 0

  for (const transaction of transactions) {
    const fromWalletId = transaction.fromAddress ? walletByAddress.get(transaction.fromAddress) : undefined
    const toWalletId = transaction.toAddress ? walletByAddress.get(transaction.toAddress) : undefined

    const status = normalizeStatus(transaction.status)
    const unresolvable = !fromWalletId || !toWalletId

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        reference: transaction.reference || `legacy:${transaction.id}`,
        amountMinor: Math.round((transaction.amount || 0) * 100),
        kind: normalizeKind(transaction.type),
        status: unresolvable ? 'FAILED' : status,
        failureReason: unresolvable ? 'legacy-unsettled' : transaction.status ? undefined : 'legacy-unsettled',
        fromWalletId: fromWalletId || null,
        toWalletId: toWalletId || null
      }
    })

    if (unresolvable) failed++
    updated++
    if (updated % 100 === 0) console.log(`Updated ${updated} transactions...`)
  }

  console.log(`Done. ${updated} transactions normalized; ${failed} marked FAILED (unresolvable legacy).`)
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
