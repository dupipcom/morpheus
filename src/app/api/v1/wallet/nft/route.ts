import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import { generateNFT } from '@/lib/kaleido';

/**
 * POST /api/v1/wallet/nft
 * Generate (mint) an NFT to a wallet
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { walletId } = body;

    if (!walletId) {
      return NextResponse.json(
        { error: 'Missing required field: walletId' },
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

    // Generate NFT (tokenURI is automatically generated)
    const txHash = await generateNFT(
      wallet.address
    );

    return NextResponse.json({
      success: true,
      transactionHash: txHash,
      walletId: wallet.id,
    });
  } catch (error) {
    console.error('Error generating NFT:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

