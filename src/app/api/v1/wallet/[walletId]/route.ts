import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import { getBalance } from '@/lib/utils/kaleido';

/**
 * GET /api/v1/wallet/[walletId]
 * Get a specific wallet by ID
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ walletId: string }> }
) {
  try {
    const { userId } = await auth();
    const { walletId } = await params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
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

    if (!wallet) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      );
    }

    // Get blockchain balance
    let blockchainBalance = 0;
    if (wallet.address) {
      try {
        blockchainBalance = await getBalance(wallet.address);
      } catch (error) {
        console.error('Error fetching balance:', error);
      }
    }

    return NextResponse.json({
      wallet: {
        ...wallet,
        blockchainBalance,
      },
    });
  } catch (error) {
    console.error('Error fetching wallet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/wallet/[walletId]
 * Delete a wallet
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ walletId: string }> }
) {
  try {
    const { userId } = await auth();
    const { walletId } = await params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
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

    if (!wallet) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      );
    }

    // Delete the wallet
    await prisma.wallet.delete({
      where: { id: walletId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting wallet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

