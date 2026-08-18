/**
 * Wallet transfer API Route Handler (Phase 6)
 *
 * POST: Move DPIP off-chain over the ledger. Body:
 *   { fromWalletId, toWalletId | toAddress | toUsername, amount, note?, reference? }
 * `amount` is decimal DPIP at the boundary (parsed to integer minor units via
 * money.parseMinor). Idempotent on `reference` (server-generated when absent).
 * Kaleido is NOT on the transfer path — transfers settle on the off-chain
 * ledger; on-chain mirroring is opt-in via /sync-onchain.
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { transfer, newReference } from '@/lib/services/ledger'
import { resolveRecipient } from '@/lib/services/wallet'
import { parseMinor, fromMinor } from '@/lib/utils/money'
import { ApiError, toResponse } from '@/lib/services/errors'

/**
 * POST /api/v1/wallet/transfer
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { fromWalletId, toWalletId, toAddress, toUsername, amount, note, reference } =
      body as Record<string, unknown>

    if (typeof fromWalletId !== 'string' || !fromWalletId) {
      return NextResponse.json({ error: 'fromWalletId is required' }, { status: 400 })
    }

    // Ownership: only the user's own wallet may send
    const fromWallet = await prisma.wallet.findFirst({
      where: { id: fromWalletId, userId: user.id },
      select: { id: true, balance: true }
    })
    if (!fromWallet) {
      return NextResponse.json({ error: 'Source wallet not found' }, { status: 404 })
    }

    // Resolve the recipient across the shared /@ namespace
    const target = [toWalletId, toAddress, toUsername].find(
      (v): v is string => typeof v === 'string' && v.length > 0
    )
    if (!target) {
      return NextResponse.json(
        { error: 'Recipient required: toWalletId, toAddress or toUsername' },
        { status: 400 }
      )
    }

    let amountMinor: number
    try {
      amountMinor = parseMinor(amount)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid amount' },
        { status: 400 }
      )
    }

    const recipient = await resolveRecipient(target)

    const transaction = await transfer({
      fromWalletId: fromWallet.id,
      toWalletId: recipient.walletId,
      amountMinor,
      kind: 'TRANSFER',
      reference: typeof reference === 'string' && reference.trim() ? reference.trim() : newReference(),
      metadata: note ? { note } : undefined,
      actorUserId: user.id
    })

    const newBalance = await prisma.wallet.findUnique({
      where: { id: fromWallet.id },
      select: { balance: true, pendingBalance: true }
    })

    return NextResponse.json({
      success: true,
      transaction,
      recipient: { walletId: recipient.walletId, displayName: recipient.displayName },
      balance: newBalance
        ? { balance: fromMinor(newBalance.balance), pendingBalance: fromMinor(newBalance.pendingBalance) }
        : null
    })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/wallet/transfer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
