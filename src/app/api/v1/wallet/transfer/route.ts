import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import { sendTokens } from '@/lib/utils/kaleido';

/**
 * POST /api/v1/wallet/transfer
 * Transfer tokens between wallets
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
    const { fromWalletId, toAddress, amount } = body;

    if (!fromWalletId || !toAddress || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: fromWalletId, toAddress, amount' },
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

    const fromWallet = await prisma.wallet.findFirst({
      where: {
        id: fromWalletId,
        userId: user.id,
      },
    });

    if (!fromWallet || !fromWallet.address) {
      return NextResponse.json(
        { error: 'Source wallet not found' },
        { status: 404 }
      );
    }

    // Send tokens using the wallet address
    const txHash = await sendTokens(
      fromWallet.address,
      toAddress,
      amount.toString()
    );


    // Create a transaction record
    await prisma.transaction.create({
      data: {
        userId: user.id,
        walletId: fromWallet.id,
        toAddress: toAddress,
        fromAddress: fromWallet.address,
        amount: parseFloat(amount),
        type: 'transfer',
        status: 'pending',
      },
    });

    return NextResponse.json({
      success: true,
      transactionHash: txHash,
    });
  } catch (error) {
    console.error('Error transferring tokens:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

