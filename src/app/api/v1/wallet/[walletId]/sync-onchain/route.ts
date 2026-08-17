/**
 * Wallet sync-onchain API Route Handler (Phase 6)
 *
 * POST: Explicit, opt-in Kaleido mirror for an owned wallet. Never on the
 * transfer critical path — called manually (or by the reconcile cron) to
 * refresh address/balance. A missing Kaleido env or outage returns 503
 * without touching the off-chain ledger.
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { generateWallet, getBalance } from '@/lib/utils/kaleido'
import { ApiError, toResponse } from '@/lib/services/errors'

/**
 * POST /api/v1/wallet/[walletId]/sync-onchain
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ walletId: string }> }
) {
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

    const { walletId } = await params

    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId: user.id },
      select: { id: true, address: true }
    })
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    try {
      let address = wallet.address
      if (!address) {
        address = (await generateWallet()).address
      }
      const blockchainBalance = await getBalance(address)

      const updated = await prisma.wallet.update({
        where: { id: wallet.id },
        data: { address, onChainSyncedAt: new Date() }
      })

      return NextResponse.json({ wallet: updated, blockchainBalance })
    } catch (error) {
      console.error('Kaleido sync failed:', error)
      return NextResponse.json(
        { error: 'On-chain sync unavailable (Kaleido not configured or unreachable)' },
        { status: 503 }
      )
    }
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/wallet/[walletId]/sync-onchain:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
