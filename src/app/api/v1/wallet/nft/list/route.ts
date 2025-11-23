import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import { getNFTs } from '@/lib/kaleido';

/**
 * GET /api/v1/wallet/nft/list
 * Get NFTs for a wallet
 * Query params: walletId (required)
 */
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const walletId = searchParams.get('walletId');

    if (!walletId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: walletId' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const wallet = await prisma.wallet.findFirst({
      where: {
        id: walletId,
        userId: user.id,
      },
    });

    if (!wallet || !wallet.address) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      );
    }

    // Get NFTs for the wallet address
    const nfts = await getNFTs(wallet.address);

    return NextResponse.json({
      success: true,
      walletId: wallet.id,
      address: wallet.address,
      nfts: nfts,
      count: nfts.length,
    });
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

