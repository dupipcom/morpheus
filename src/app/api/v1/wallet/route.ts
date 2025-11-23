import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import { generateWallet, getBalance } from '@/lib/kaleido';

/**
 * GET /api/v1/wallet
 * Get all wallets for the authenticated user
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

    const user = await prisma.user.findUnique({
      where: { userId },
      include: { wallets: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Fetch blockchain balances for all wallets and update database
    const walletsWithBalances = await Promise.all(
      user.wallets.map(async (wallet) => {
        if (!wallet.address) {
          return { ...wallet, blockchainBalance: '0' };
        }
        
        try {
          const blockchainBalance = await getBalance(wallet.address);
          const balanceFloat = parseFloat(blockchainBalance) || 0;

          console.log({ blockchainBalance, balanceFloat })
          
          // Update balance in database
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: balanceFloat },
          });
          
          return {
            ...wallet,
            balance: balanceFloat,
            blockchainBalance,
          };
        } catch (error) {
          console.error(`Error fetching balance for wallet ${wallet.id}:`, error);
          return {
            ...wallet,
            blockchainBalance: '0',
          };
        }
      })
    );

    return NextResponse.json({ wallets: walletsWithBalances });
  } catch (error) {
    console.error('Error fetching wallets:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/wallet
 * Create a new wallet for the authenticated user
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
    const { name } = body;

    const user = await prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Generate a new wallet
    const { address } = await generateWallet();

    // Store the wallet in the database
    const wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        name: name || `Wallet ${new Date().toLocaleDateString()}`,
        address: address
      },
    });

    // Get the blockchain balance and update database
    let blockchainBalance = '0';
    let balanceFloat = 0;
    try {
      blockchainBalance = await getBalance(address);
      balanceFloat = parseFloat(blockchainBalance) || 0;
      
      // Update balance in database
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceFloat },
      });
    } catch (error) {
      console.error('Error fetching initial balance:', error);
    }

    console.log({ blockchainBalance, balanceFloat })

    return NextResponse.json({
      wallet: {
        ...wallet,
        balance: balanceFloat,
        blockchainBalance,
      },
    });
  } catch (error) {
    console.error('Error creating wallet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

