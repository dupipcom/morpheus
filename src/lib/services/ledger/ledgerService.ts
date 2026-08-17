/**
 * Ledger Service (Phase 6)
 *
 * DPIP is a spendable, auditable platform balance: `Wallet.balance` +
 * double-entry `LedgerEntry` rows behind every `Transaction` are the source of
 * truth. Kaleido is an optional mirror, never on the critical path.
 *
 * DUAL-MODE ATOMICITY (deliberate deviation from the phase doc, user decision):
 * - When the database is a replica set (production), every movement runs in a
 *   single interactive `prisma.$transaction` — debit, credit, both entries and
 *   status commit or abort together. This is the correct path and the one the
 *   reconciliation invariants assume.
 * - When it is not (local dev on a standalone Mongo), we fall back to
 *   sequential idempotent steps with a compensating reversal on failure, so
 *   development is never blocked on a replica set. `LEDGER_REQUIRE_TRANSACTIONS=true`
 *   makes the boot assertion strict for environments that must have the
 *   transactional path (production).
 *
 * The conditional `updateMany { balance: { gte } }` compare-and-set expresses
 * the debit in BOTH modes — it is atomic per document even without
 * transactions, so concurrent transfers can never both pass the balance check.
 */

import { randomUUID } from 'crypto'
import prisma from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma'
import { ApiError } from '@/lib/services/errors'

export type LedgerKind =
  | 'TRANSFER'
  | 'TICKET_PURCHASE'
  | 'TICKET_RESERVATION'
  | 'TICKET_BALANCE'
  | 'REFUND'
  | 'ALLOWANCE_GRANT'
  | 'PAYOUT'
  | 'ADJUSTMENT'

export type TransferKind = 'TRANSFER' | 'PAYOUT'

interface TransferParams {
  fromWalletId: string
  toWalletId: string
  amountMinor: number
  kind?: TransferKind
  reference?: string
  metadata?: Record<string, unknown>
  actorUserId: string
}

interface HoldParams {
  walletId: string
  amountMinor: number
  reference: string
  metadata?: Record<string, unknown>
  actorUserId: string
}

interface CreditParams {
  walletId: string
  amountMinor: number
  kind: LedgerKind
  reference?: string
  metadata?: Record<string, unknown>
  actorUserId: string
}

let transactionSupport: boolean | null = null

/**
 * Detect whether the MongoDB deployment supports multi-document transactions
 * (a replica set). Cached after the first probe.
 */
export async function supportsTransactions(): Promise<boolean> {
  if (transactionSupport !== null) return transactionSupport
  try {
    const hello = (await prisma.$runCommandRaw({ hello: 1 })) as { setName?: string }
    transactionSupport = typeof hello.setName === 'string' && hello.setName.length > 0
  } catch {
    transactionSupport = false
  }
  return transactionSupport
}

/**
 * Boot-time assertion. Warns on standalone Mongo (dev); fails loudly when
 * `LEDGER_REQUIRE_TRANSACTIONS=true` (production readiness gate).
 */
export async function assertTransactionalDatabase(): Promise<void> {
  const supported = await supportsTransactions()
  if (!supported) {
    const message =
      'DATABASE_URL is not a replica set: the ledger falls back to sequential ' +
      'idempotent steps (development mode). Set LEDGER_REQUIRE_TRANSACTIONS=true ' +
      'to require the transactional path in environments where it must hold.'
    if (process.env.LEDGER_REQUIRE_TRANSACTIONS === 'true') {
      throw new Error(message)
    }
    console.warn(`[ledger] ${message}`)
  }
}

/**
 * New idempotency reference for server-generated keys.
 */
export function newReference(prefix = 'tx'): string {
  return `${prefix}_${randomUUID()}`
}

/**
 * Move DPIP between two wallets (USER/ORG/EVENT/ESCROW wallets).
 * Idempotent on `reference`: replaying a settled reference returns the
 * original transaction without moving value again.
 */
export async function transfer(params: TransferParams) {
  const {
    fromWalletId, toWalletId, amountMinor, kind = 'TRANSFER',
    reference = newReference(), metadata, actorUserId
  } = params

  if (!actorUserId) {
    throw new ApiError(400, 'VALIDATION', 'actorUserId required')
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new ApiError(400, 'VALIDATION', 'Amount must be a positive integer number of minor units')
  }
  if (fromWalletId === toWalletId) {
    throw new ApiError(400, 'VALIDATION', 'Cannot transfer to the same wallet')
  }

  // Idempotent replay
  const existing = await prisma.transaction.findUnique({ where: { reference } })
  if (existing) {
    if (existing.status === 'SETTLED') return existing
    if (existing.status === 'PENDING') return existing // in-flight (or abandoned — reconcile sweeps)
    throw new ApiError(409, 'REFERENCE_REUSED', 'Reference already used')
  }

  const [fromWallet, toWallet] = await Promise.all([
    prisma.wallet.findUnique({ where: { id: fromWalletId }, select: { id: true, frozen: true, kind: true, balance: true } }),
    prisma.wallet.findUnique({ where: { id: toWalletId }, select: { id: true, frozen: true, kind: true } })
  ])
  if (!fromWallet || !toWallet) {
    throw new ApiError(404, 'NOT_FOUND', 'Wallet not found')
  }
  if (fromWallet.frozen || toWallet.frozen) {
    throw new ApiError(400, 'FROZEN', 'Wallet is frozen')
  }

  if (await supportsTransactions()) {
    return transferTransactional({ fromWalletId, toWalletId, amountMinor, kind, reference, metadata, actorUserId })
  }
  return transferSequential({ fromWalletId, toWalletId, amountMinor, kind, reference, metadata, actorUserId })
}

/**
 * Production path: one interactive transaction — debit, credit, both entries
 * and SETTLED commit or abort together. Insufficient funds throws inside the
 * transaction, so no PENDING residue survives.
 */
async function transferTransactional(params: Omit<TransferParams, 'kind' | 'reference'> & { kind: TransferKind; reference: string }) {
  const { fromWalletId, toWalletId, amountMinor, kind, reference, metadata, actorUserId } = params

  return prisma.$transaction(async (tx) => {
    // P2002 here means a concurrent replay of the same reference
    const transaction = await tx.transaction.create({
      data: {
        reference,
        kind,
        status: 'PENDING',
        amountMinor,
        fromWalletId,
        toWalletId,
        metadata: (metadata ?? null) as Prisma.InputJsonValue | null,
        userId: actorUserId,
        fromAddress: '',
        toAddress: '',
        amount: amountMinor / 100
      }
    })

    // Compare-and-set debit: two concurrent transfers can never both pass
    const debited = await tx.wallet.updateMany({
      where: { id: fromWalletId, frozen: false, balance: { gte: amountMinor } },
      data: { balance: { decrement: amountMinor } }
    })
    if (debited.count !== 1) {
      throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Insufficient funds')
    }

    await tx.wallet.update({
      where: { id: toWalletId },
      data: { balance: { increment: amountMinor } }
    })

    const fromAfter = await tx.wallet.findUnique({ where: { id: fromWalletId }, select: { balance: true } })
    const toAfter = await tx.wallet.findUnique({ where: { id: toWalletId }, select: { balance: true } })

    await tx.ledgerEntry.createMany({
      data: [
        { transactionId: transaction.id, walletId: fromWalletId, direction: 'DEBIT', amount: amountMinor, balanceAfter: fromAfter?.balance ?? 0 },
        { transactionId: transaction.id, walletId: toWalletId, direction: 'CREDIT', amount: amountMinor, balanceAfter: toAfter?.balance ?? 0 }
      ]
    })

    return tx.transaction.update({
      where: { id: transaction.id },
      data: { status: 'SETTLED', settledAt: new Date() }
    })
  }, { maxWait: 5000, timeout: 15000 })
}

/**
 * Development path (standalone Mongo): sequential idempotent steps with a
 * compensating reversal on failure. The compare-and-set debit still prevents
 * overspending; a crash mid-way leaves a PENDING row the reconcile sweep
 * alarms on (one-entry corruption alarm) — acceptable in dev only.
 */
async function transferSequential(params: Omit<TransferParams, 'kind' | 'reference'> & { kind: TransferKind; reference: string }) {
  const { fromWalletId, toWalletId, amountMinor, kind, reference, metadata, actorUserId } = params

  let transaction = await prisma.transaction.create({
    data: {
      reference,
      kind,
      status: 'PENDING',
      amountMinor,
      fromWalletId,
      toWalletId,
      metadata: (metadata ?? null) as Prisma.InputJsonValue | null,
      userId: actorUserId,
      fromAddress: '',
      toAddress: '',
      amount: amountMinor / 100
    }
  })

  try {
    const debited = await prisma.wallet.updateMany({
      where: { id: fromWalletId, frozen: false, balance: { gte: amountMinor } },
      data: { balance: { decrement: amountMinor } }
    })
    if (debited.count !== 1) {
      throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Insufficient funds')
    }

    await prisma.wallet.update({
      where: { id: toWalletId },
      data: { balance: { increment: amountMinor } }
    })

    const [fromAfter, toAfter] = await Promise.all([
      prisma.wallet.findUnique({ where: { id: fromWalletId }, select: { balance: true } }),
      prisma.wallet.findUnique({ where: { id: toWalletId }, select: { balance: true } })
    ])

    await prisma.ledgerEntry.createMany({
      data: [
        { transactionId: transaction.id, walletId: fromWalletId, direction: 'DEBIT', amount: amountMinor, balanceAfter: fromAfter?.balance ?? 0 },
        { transactionId: transaction.id, walletId: toWalletId, direction: 'CREDIT', amount: amountMinor, balanceAfter: toAfter?.balance ?? 0 }
      ]
    })

    transaction = await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'SETTLED', settledAt: new Date() }
    })
    return transaction
  } catch (error) {
    // Compensate any partial movement so dev balances stay invariant
    try {
      await prisma.wallet.update({ where: { id: toWalletId }, data: { balance: { decrement: amountMinor } } })
      await prisma.wallet.update({ where: { id: fromWalletId }, data: { balance: { increment: amountMinor } } })
    } catch (compensationError) {
      console.error('[ledger] compensation failed during sequential transfer:', compensationError)
    }
    const message = error instanceof Error ? error.message : 'Transfer failed'
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED', failureReason: message }
    }).catch(() => {})
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'LEDGER', message)
  }
}

/**
 * Hold funds (balance → pendingBalance) for a reservation (Phase 9 ticketing).
 * Same dual-mode engine, idempotent on `reference`.
 */
export async function hold(params: HoldParams) {
  const { walletId, amountMinor, reference, metadata, actorUserId } = params
  if (!actorUserId) {
    throw new ApiError(400, 'VALIDATION', 'actorUserId required')
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new ApiError(400, 'VALIDATION', 'Amount must be a positive integer number of minor units')
  }

  const existing = await prisma.transaction.findUnique({ where: { reference } })
  if (existing) {
    if (existing.status === 'SETTLED') return existing
    if (existing.status === 'PENDING') return existing
    throw new ApiError(409, 'REFERENCE_REUSED', 'Reference already used')
  }

  const wallet = await prisma.wallet.findUnique({ where: { id: walletId }, select: { id: true, frozen: true } })
  if (!wallet) throw new ApiError(404, 'NOT_FOUND', 'Wallet not found')
  if (wallet.frozen) throw new ApiError(400, 'FROZEN', 'Wallet is frozen')

  if (await supportsTransactions()) {
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          reference, kind: 'TICKET_RESERVATION', status: 'PENDING', amountMinor,
          fromWalletId: walletId, metadata: (metadata ?? null) as Prisma.InputJsonValue | null,
          userId: actorUserId, fromAddress: '', toAddress: '', amount: amountMinor / 100
        }
      })
      const held = await tx.wallet.updateMany({
        where: { id: walletId, frozen: false, balance: { gte: amountMinor } },
        data: { balance: { decrement: amountMinor }, pendingBalance: { increment: amountMinor } }
      })
      if (held.count !== 1) throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Insufficient funds')
      return tx.transaction.update({
        where: { id: transaction.id },
        data: { status: 'SETTLED', settledAt: new Date() }
      })
    }, { maxWait: 5000, timeout: 15000 })
  }

  // Sequential fallback
  const transaction = await prisma.transaction.create({
    data: {
      reference, kind: 'TICKET_RESERVATION', status: 'PENDING', amountMinor,
      fromWalletId: walletId, metadata: (metadata ?? null) as Prisma.InputJsonValue | null,
      userId: actorUserId, fromAddress: '', toAddress: '', amount: amountMinor / 100
    }
  })
  try {
    const held = await prisma.wallet.updateMany({
      where: { id: walletId, frozen: false, balance: { gte: amountMinor } },
      data: { balance: { decrement: amountMinor }, pendingBalance: { increment: amountMinor } }
    })
    if (held.count !== 1) throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Insufficient funds')
    return prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'SETTLED', settledAt: new Date() }
    })
  } catch (error) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED', failureReason: error instanceof Error ? error.message : 'Hold failed' }
    }).catch(() => {})
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'LEDGER', 'Hold failed')
  }
}

/**
 * Release held funds back to balance (reservation expiry/cancel). Idempotent.
 */
export async function release(reference: string, actorUserId?: string) {
  const existing = await prisma.transaction.findUnique({ where: { reference } })
  if (!existing || existing.status !== 'SETTLED') {
    throw new ApiError(404, 'NOT_FOUND', 'Hold not found')
  }
  if (existing.kind !== 'TICKET_RESERVATION') {
    throw new ApiError(400, 'VALIDATION', 'Reference is not a hold')
  }
  if (!existing.fromWalletId || !existing.amountMinor) {
    throw new ApiError(400, 'VALIDATION', 'Hold has no wallet')
  }
  const fromWalletId = existing.fromWalletId
  const amountMinor = existing.amountMinor

  if (await supportsTransactions()) {
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { id: fromWalletId }, select: { pendingBalance: true } })
      const releasable = Math.min(amountMinor, wallet?.pendingBalance ?? 0)
      await tx.wallet.update({
        where: { id: fromWalletId },
        data: { pendingBalance: { decrement: releasable }, balance: { increment: releasable } }
      })
      return tx.transaction.update({
        where: { id: existing.id },
        data: { status: 'REVERSED', settledAt: new Date(), metadata: { ...(existing.metadata as Record<string, unknown> ?? {}), releasedBy: actorUserId ?? 'SYSTEM' } as Prisma.InputJsonValue }
      })
    }, { maxWait: 5000, timeout: 15000 })
  }

  const wallet = await prisma.wallet.findUnique({ where: { id: fromWalletId }, select: { pendingBalance: true } })
  const releasable = Math.min(amountMinor, wallet?.pendingBalance ?? 0)
  await prisma.wallet.update({
    where: { id: fromWalletId },
    data: { pendingBalance: { decrement: releasable }, balance: { increment: releasable } }
  })
  return prisma.transaction.update({
    where: { id: existing.id },
    data: { status: 'REVERSED', settledAt: new Date() }
  })
}

/**
 * System-issued credit (allowance grants). Treasury may go negative — its
 * negative balance is exactly the amount of DPIP in circulation.
 */
export async function credit(params: CreditParams) {
  const { walletId, amountMinor, kind, reference = newReference('grant'), metadata, actorUserId } = params
  if (!actorUserId) {
    throw new ApiError(400, 'VALIDATION', 'actorUserId required')
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new ApiError(400, 'VALIDATION', 'Amount must be a positive integer number of minor units')
  }

  const existing = await prisma.transaction.findUnique({ where: { reference } })
  if (existing) {
    if (existing.status === 'SETTLED') return existing
    throw new ApiError(409, 'REFERENCE_REUSED', 'Reference already used')
  }

  const treasury = await prisma.wallet.findFirst({
    where: { kind: 'SYSTEM', name: 'SYSTEM:treasury' },
    select: { id: true }
  })
  if (!treasury) {
    throw new ApiError(500, 'LEDGER', 'Treasury wallet missing — run migration 0023')
  }

  if (await supportsTransactions()) {
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          reference, kind, status: 'PENDING', amountMinor,
          fromWalletId: treasury.id, toWalletId: walletId, metadata: (metadata ?? null) as Prisma.InputJsonValue | null,
          userId: actorUserId, fromAddress: '', toAddress: '', amount: amountMinor / 100
        }
      })
      // Treasury skips the balance guard (issuer, may go negative)
      await tx.wallet.update({ where: { id: treasury.id }, data: { balance: { decrement: amountMinor } } })
      await tx.wallet.update({ where: { id: walletId }, data: { balance: { increment: amountMinor } } })
      const [fromAfter, toAfter] = await Promise.all([
        tx.wallet.findUnique({ where: { id: treasury.id }, select: { balance: true } }),
        tx.wallet.findUnique({ where: { id: walletId }, select: { balance: true } })
      ])
      await tx.ledgerEntry.createMany({
        data: [
          { transactionId: transaction.id, walletId: treasury.id, direction: 'DEBIT', amount: amountMinor, balanceAfter: fromAfter?.balance ?? 0 },
          { transactionId: transaction.id, walletId, direction: 'CREDIT', amount: amountMinor, balanceAfter: toAfter?.balance ?? 0 }
        ]
      })
      return tx.transaction.update({
        where: { id: transaction.id },
        data: { status: 'SETTLED', settledAt: new Date() }
      })
    }, { maxWait: 5000, timeout: 15000 })
  }

  const transaction = await prisma.transaction.create({
    data: {
      reference, kind, status: 'PENDING', amountMinor,
      fromWalletId: treasury.id, toWalletId: walletId, metadata: (metadata ?? null) as Prisma.InputJsonValue | null,
      userId: actorUserId, fromAddress: '', toAddress: '', amount: amountMinor / 100
    }
  })
  try {
    await prisma.wallet.update({ where: { id: treasury.id }, data: { balance: { decrement: amountMinor } } })
    await prisma.wallet.update({ where: { id: walletId }, data: { balance: { increment: amountMinor } } })
    const [fromAfter, toAfter] = await Promise.all([
      prisma.wallet.findUnique({ where: { id: treasury.id }, select: { balance: true } }),
      prisma.wallet.findUnique({ where: { id: walletId }, select: { balance: true } })
    ])
    await prisma.ledgerEntry.createMany({
      data: [
        { transactionId: transaction.id, walletId: treasury.id, direction: 'DEBIT', amount: amountMinor, balanceAfter: fromAfter?.balance ?? 0 },
        { transactionId: transaction.id, walletId, direction: 'CREDIT', amount: amountMinor, balanceAfter: toAfter?.balance ?? 0 }
      ]
    })
    return prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'SETTLED', settledAt: new Date() }
    })
  } catch (error) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED', failureReason: error instanceof Error ? error.message : 'Credit failed' }
    }).catch(() => {})
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'LEDGER', 'Credit failed')
  }
}

/**
 * Wallet balance in minor units (0 for a missing wallet).
 */
export async function getBalance(walletId: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { balance: true }
  })
  return wallet?.balance ?? 0
}

/**
 * Paginated ledger statement for a wallet, newest first.
 */
export async function getStatement(walletId: string, params: { cursor?: string | null; limit?: number }) {
  const { cursor, limit = 50 } = params
  const take = Math.min(limit, 100)

  const entries = await prisma.ledgerEntry.findMany({
    where: { walletId },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  })

  const hasMore = entries.length > take
  const items = hasMore ? entries.slice(0, take) : entries

  return {
    entries: items,
    nextCursor: hasMore ? items[items.length - 1].id : null
  }
}

/**
 * Reconciliation sweep (hourly cron): abandoned PENDING rows → FAILED (zero
 * entries only; exactly-one-entry rows are alarmed as corruption), then the
 * ledger invariants are checked and reported — never silently rewritten.
 */
export async function reconcile(): Promise<{
  failed: number
  alarmed: number
  invariant: { debitSum: number; creditSum: number; balanced: boolean }
  balanceMismatches: string[]
}> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000)

  // Abandoned PENDING transactions
  const abandoned = await prisma.transaction.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    include: { entries: true }
  })

  let failed = 0
  let alarmed = 0
  for (const transaction of abandoned) {
    if (transaction.entries.length === 0) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', failureReason: 'abandoned' }
      })
      failed++
    } else {
      // One-entry rows are impossible under the transactional design — corruption
      console.error(`[ledger] corruption alarm: transaction ${transaction.id} has ${transaction.entries.length} entries but is PENDING`)
      alarmed++
    }
  }

  // Invariant: Σ DEBIT − Σ CREDIT = 0
  const grouped = await prisma.ledgerEntry.groupBy({
    by: ['direction'],
    _sum: { amount: true }
  })
  const debitSum = grouped.find((g) => g.direction === 'DEBIT')?._sum.amount ?? 0
  const creditSum = grouped.find((g) => g.direction === 'CREDIT')?._sum.amount ?? 0

  // Invariant: each wallet's balance equals the balanceAfter of its newest entry
  const balanceMismatches: string[] = []
  const walletsWithEntries = await prisma.ledgerEntry.groupBy({ by: ['walletId'] })
  for (const group of walletsWithEntries) {
    const [wallet, latestEntry] = await Promise.all([
      prisma.wallet.findUnique({ where: { id: group.walletId }, select: { balance: true, pendingBalance: true } }),
      prisma.ledgerEntry.findFirst({
        where: { walletId: group.walletId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true }
      })
    ])
    if (wallet && latestEntry && wallet.balance !== latestEntry.balanceAfter) {
      console.error(`[ledger] divergence: wallet ${group.walletId} balance ${wallet.balance} != latest balanceAfter ${latestEntry.balanceAfter}`)
      balanceMismatches.push(group.walletId)
    }
  }

  return {
    failed,
    alarmed,
    invariant: { debitSum, creditSum, balanced: debitSum === creditSum },
    balanceMismatches
  }
}
