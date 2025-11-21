import prisma from '@/lib/prisma';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Handles Clerk webhook events for user login
 * Updates the lastLogin timestamp in the user collection when a session is created
 */
export async function POST(req: Request) {
  try {
    const evt = (await req.json()) as WebhookEvent;

    // Only handle session.created events (login events)
    if (evt.type !== 'session.created') {
      return NextResponse.json(
        { message: 'Event type not handled' },
        { status: 200 }
      );
    }

    const sessionData: any = evt.data;
    const sessionUserId: string | undefined = sessionData?.user_id || sessionData?.userId;

    if (!sessionUserId) {
      return NextResponse.json(
        { error: 'No user ID provided in session data' },
        { status: 400 }
      );
    }

    // Update lastLogin timestamp for the user
    try {
      await prisma.user.update({
        data: ({ lastLogin: new Date() } as any),
        where: { userId: sessionUserId },
      });
    } catch (e) {
      // If user doesn't exist yet, upsert it with lastLogin
      await prisma.user.upsert({
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
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'lastLogin updated successfully',
      userId: sessionUserId
    });
  } catch (error) {
    console.error('Error handling login webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

