import prisma from '@/lib/prisma';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateWallet } from '@/lib/kaleido';

/**
 * Handles Clerk webhook events for user login and direct requests to extend session
 * Updates the lastLogin timestamp in the user collection
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Check if this is a webhook event or a direct request
    const isWebhook = body.type && typeof body.type === 'string';
    
    let sessionUserId: string | undefined;
    
    if (isWebhook) {
      // Handle Clerk webhook event
      const evt = body as WebhookEvent;
      
      // Only handle session.created events (login events)
      if (evt.type !== 'session.created') {
        return NextResponse.json(
          { message: 'Event type not handled' },
          { status: 200 }
        );
      }

      const sessionData: any = evt.data;
      sessionUserId = sessionData?.user_id || sessionData?.userId;

      if (!sessionUserId) {
        return NextResponse.json(
          { error: 'No user ID provided in session data' },
          { status: 400 }
        );
      }
    } else {
      // Handle direct request (extend session)
      const { userId } = await auth();
      
      if (!userId) {
        return NextResponse.json(
          { error: 'User not authenticated' },
          { status: 401 }
        );
      }
      
      sessionUserId = userId;
    }

    // Update lastLogin timestamp for the user
    let user;
    try {
      user = await prisma.user.update({
        data: ({ lastLogin: new Date() } as any),
        where: { userId: sessionUserId },
        include: { wallets: true },
      });
    } catch (e) {
      // If user doesn't exist yet, upsert it with lastLogin
      user = await prisma.user.upsert({
        where: { userId: sessionUserId },
        update: ({ lastLogin: new Date() } as any),
        create: {
          userId: sessionUserId,
          settings: {
            currency: null,
            speed: null
          } as any,
          // cast to any to tolerate client lag
          ...({ lastLogin: new Date() } as any)
        },
        include: { wallets: true },
      });
    }

    // Create a default wallet if user doesn't have one
    if (user && (!user.wallets || user.wallets.length === 0)) {
      try {
        const { address } = await generateWallet();
        await prisma.wallet.create({
          data: {
            userId: user.id,
            name: 'Default Wallet',
            address: address,
          },
        });
      } catch (walletError) {
        console.error('Error creating default wallet:', walletError);
        // Don't fail the login if wallet creation fails
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'lastLogin updated successfully',
      userId: sessionUserId
    });
  } catch (error) {
    console.error('Error handling login request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

