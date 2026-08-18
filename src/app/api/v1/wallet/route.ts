/**
 * Wallet API Route Handler (Phase 6)
 *
 * GET: The user's wallets with authoritative DB balance/pendingBalance first;
 * on-chain balance only with ?includeOnChain=true (never blocks the response).
 * POST: Create an extra wallet (max 5 USER-kind wallets; Kaleido address is
 * lazy and non-blocking — signup/wallet creation never depends on Kaleido).
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { generateWallet, getBalance } from '@/lib/utils/kaleido'
import { getOrCreateDefaultWallet, countUserWallets, USER_WALLET_CAP } from '@/lib/services/wallet'
import { ApiError, toResponse } from '@/lib/services/errors'

/**
 * GET /api/v1/wallet
 */
export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const includeOnChain = searchParams.get('includeOnChain') === 'true'

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Self-heal: pre-Phase-6 users get their default wallet on first read
    await getOrCreateDefaultWallet(user.id)

    const wallets = await prisma.wallet.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    })

    // On-chain balance is opt-in and never blocks the response
    const walletsWithBalances = includeOnChain
      ? await Promise.all(
          wallets.map(async (wallet) => {
            if (!wallet.address) return { ...wallet, blockchainBalance: 0 }
            try {
              const blockchainBalance = await getBalance(wallet.address)
              return { ...wallet, blockchainBalance }
            } catch (error) {
              console.error(`Error fetching balance for wallet ${wallet.id}:`, error)
              return { ...wallet, blockchainBalance: 0 }
            }
          })
        )
      : wallets

    return NextResponse.json({ wallets: walletsWithBalances })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error fetching wallets:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/wallet
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name : undefined

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userWalletCount = await countUserWallets(user.id)
    if (userWalletCount >= USER_WALLET_CAP) {
      return NextResponse.json(
        { error: 'Maximum wallet limit reached. You can only create up to 5 wallets.' },
        { status: 400 }
      )
    }

    // The DB wallet exists immediately; the Kaleido address is lazy — an
    // outage (or unset env) must never block wallet creation.
    let address: string | null = null
    try {
      address = (await generateWallet()).address
    } catch (error) {
      console.error('Kaleido generateWallet failed (continuing without address):', error)
    }

    const wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        name: name || `Wallet ${new Date().toLocaleDateString()}`,
        address,
        kind: 'USER',
        ownerType: 'USER',
        balance: 0,
        pendingBalance: 0
      }
    })

    return NextResponse.json({ wallet })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error creating wallet:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
