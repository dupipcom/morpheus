/**
 * Wallet statement API Route Handler (Phase 6)
 *
 * GET: Paginated ledger entries for an owned wallet (newest first) with
 * running balance (balanceAfter on each entry).
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getStatement } from '@/lib/services/ledger'
import { ApiError, toResponse } from '@/lib/services/errors'

/**
 * GET /api/v1/wallet/[walletId]/statement
 */
export async function GET(
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

    // Ownership check
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId: user.id },
      select: { id: true, balance: true, pendingBalance: true }
    })
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const cursor = searchParams.get('cursor')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const statement = await getStatement(walletId, {
      cursor,
      limit: Number.isNaN(limit) ? 50 : limit
    })

    return NextResponse.json({
      wallet: { id: wallet.id, balance: wallet.balance, pendingBalance: wallet.pendingBalance },
      ...statement
    })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/wallet/[walletId]/statement:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
