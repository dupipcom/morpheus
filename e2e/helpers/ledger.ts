/**
 * Ledger test-harness helpers.
 *
 * The Phase 6 ledger has no public "credit" endpoint yet (allowance grants
 * arrive in Phase 11), so the harness issues system credits the same way the
 * Phase 11 cron will — through the ledger's invariant-respecting writes —
 * directly against the generated Prisma client (no app-service imports:
 * Playwright does not resolve the repo's tsconfig path aliases).
 *
 * All amounts are integer minor units (1 DPIP = 100).
 */

import { PrismaClient } from '../../generated/prisma'

export const prisma = new PrismaClient()

/** Seed the treasury wallet when migrations haven't run (or ran with no users). */
export async function ensureTreasury(adminInternalUserId: string) {
  const existing = await prisma.wallet.findFirst({
    where: { kind: 'SYSTEM', name: 'SYSTEM:treasury' }
  })
  if (existing) return existing
  return prisma.wallet.create({
    data: {
      userId: adminInternalUserId,
      name: 'SYSTEM:treasury',
      kind: 'SYSTEM',
      ownerType: 'SYSTEM',
      isDefault: false,
      balance: 0,
      pendingBalance: 0,
      address: null
    }
  })
}

/**
 * System-issued credit: treasury (may go negative) → wallet, with the paired
 * ledger entries — the same invariant shape as ledgerService.credit.
 */
export async function creditMinor(params: {
  toWalletId: string
  amountMinor: number
  actorUserId: string
  reference: string
}) {
  const { toWalletId, amountMinor, actorUserId, reference } = params
  const treasury = await prisma.wallet.findFirstOrThrow({
    where: { kind: 'SYSTEM', name: 'SYSTEM:treasury' }
  })

  const transaction = await prisma.transaction.create({
    data: {
      reference,
      kind: 'ALLOWANCE_GRANT',
      status: 'PENDING',
      amountMinor,
      fromWalletId: treasury.id,
      toWalletId,
      userId: actorUserId,
      fromAddress: '',
      toAddress: '',
      amount: amountMinor / 100
    }
  })

  await prisma.wallet.update({
    where: { id: treasury.id },
    data: { balance: { decrement: amountMinor } }
  })
  await prisma.wallet.update({
    where: { id: toWalletId },
    data: { balance: { increment: amountMinor } }
  })

  const [fromAfter, toAfter] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({ where: { id: treasury.id }, select: { balance: true } }),
    prisma.wallet.findUniqueOrThrow({ where: { id: toWalletId }, select: { balance: true } })
  ])

  await prisma.ledgerEntry.createMany({
    data: [
      { transactionId: transaction.id, walletId: treasury.id, direction: 'DEBIT', amount: amountMinor, balanceAfter: fromAfter.balance },
      { transactionId: transaction.id, walletId: toWalletId, direction: 'CREDIT', amount: amountMinor, balanceAfter: toAfter.balance }
    ]
  })

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { status: 'SETTLED', settledAt: new Date() }
  })
}

/**
 * The ledger invariants from the phase doc: Σ DEBIT − Σ CREDIT = 0, and every
 * wallet's balance equals the balanceAfter of its newest entry. Divergences
 * are returned, never silently repaired.
 */
export async function checkLedgerInvariants(): Promise<{
  balanced: boolean
  debitSum: number
  creditSum: number
  balanceMismatches: string[]
}> {
  const grouped = await prisma.ledgerEntry.groupBy({
    by: ['direction'],
    _sum: { amount: true }
  })
  const debitSum = grouped.find((g) => g.direction === 'DEBIT')?._sum.amount ?? 0
  const creditSum = grouped.find((g) => g.direction === 'CREDIT')?._sum.amount ?? 0

  const balanceMismatches: string[] = []
  const walletsWithEntries = await prisma.ledgerEntry.groupBy({ by: ['walletId'] })
  for (const group of walletsWithEntries) {
    const [wallet, latestEntry] = await Promise.all([
      prisma.wallet.findUnique({ where: { id: group.walletId }, select: { balance: true } }),
      prisma.ledgerEntry.findFirst({
        where: { walletId: group.walletId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true }
      })
    ])
    if (wallet && latestEntry && wallet.balance !== latestEntry.balanceAfter) {
      balanceMismatches.push(group.walletId)
    }
  }

  return { balanced: debitSum === creditSum, debitSum, creditSum, balanceMismatches }
}

/** Minimal document row (event publish requires a cover). */
export async function createDocument(userId: string, fileName = 'e2e-cover.png') {
  return prisma.document.create({
    data: {
      userId,
      fileName,
      fileUrl: `https://e2e.example.com/${fileName}`,
      kind: 'image'
    }
  })
}

/** Best-effort cleanup of the internal User rows created by a test run. */
export async function cleanupInternalUsers(clerkUserIds: string[]) {
  if (clerkUserIds.length === 0) return
  await prisma.user.deleteMany({ where: { userId: { in: clerkUserIds } } }).catch(() => {})
}
