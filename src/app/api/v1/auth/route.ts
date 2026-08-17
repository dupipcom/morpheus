// src/app/api/webhooks/clerk

import prisma from '@/lib/prisma';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache'
import { ensureUserAndProfile } from '@/lib/services/user/ensureUserAndProfile'
import { getOrCreateDefaultWallet } from '@/lib/services/wallet'

export async function POST(req: Request) {
    try {
        // Verify the request using the same INTERNAL_FETCH_SECRET that bypasses the Vercel bot firewall.
        // Configure the Clerk webhook in the Clerk Dashboard to send the custom header:
        //   x-internal-fetch-secret: <value of INTERNAL_FETCH_SECRET>
        // This lets Vercel's firewall trust Clerk's server-to-server requests.
        const internalSecret = process.env.INTERNAL_FETCH_SECRET;
        if (internalSecret) {
            const providedSecret = req.headers.get('x-internal-fetch-secret');
            if (providedSecret !== internalSecret) {
                return NextResponse.json(
                    { error: 'Unauthorized' },
                    { status: 401 },
                );
            }
        }

        const evt = (await req.json()) as WebhookEvent;

        const { id: clerkUserId } = evt.data;
        if (!clerkUserId)
            return NextResponse.json(
                { error: 'No user ID provided' },
                { status: 400 },
            );

        let user = null;
        switch (evt.type) {
            case 'user.created': {
                const webhookData: any = evt.data;
                const clerkUsername: string | null = webhookData?.username ?? null;
                const clerkImageUrl: string | null = webhookData?.image_url ?? webhookData?.imageUrl ?? null;

                await ensureUserAndProfile(clerkUserId, {
                    username: clerkUsername,
                    imageUrl: clerkImageUrl,
                });

                user = await prisma.user.findUnique({ where: { userId: clerkUserId } });
                // Phase 6: default wallet at signup (idempotent — Clerk retries
                // webhooks, and getOrCreateDefaultWallet never duplicates)
                if (user) {
                    await getOrCreateDefaultWallet(user.id);
                }
                if (clerkUsername) {
                    revalidatePath(`/@${clerkUsername}`);
                }
                break;
            }
            case 'session.created': {
                const sessionData: any = evt.data;
                const sessionUserId: string | undefined = sessionData?.user_id || sessionData?.userId || clerkUserId;
                if (sessionUserId) {
                    await ensureUserAndProfile(sessionUserId);
                    const sessionUser = await prisma.user.findUnique({ where: { userId: sessionUserId }, select: { id: true } });
                    if (sessionUser) {
                        await getOrCreateDefaultWallet(sessionUser.id);
                    }
                }
                break;
            }
            case 'user.updated': {
                // Sync username from Clerk webhook data to Prisma database
                try {
                    const webhookData: any = evt.data;
                    const clerkUsername: string | null = webhookData?.username ?? null;

                    // Make sure the User + Profile exist before we try to sync the username.
                    await ensureUserAndProfile(clerkUserId, {
                        username: clerkUsername,
                        imageUrl: webhookData?.image_url ?? webhookData?.imageUrl ?? null,
                    });

                    if (clerkUsername) {
                        const dbUser = await prisma.user.findUnique({
                            where: { userId: clerkUserId },
                            include: { profiles: true }
                        });

                        if (dbUser) {
                            // Use upsert to atomically create or update, avoiding race conditions
                            await prisma.profile.upsert({
                                where: { userId: dbUser.id },
                                update: {
                                    username: clerkUsername,
                                    data: {
                                        username: {
                                            value: clerkUsername,
                                            visibility: true
                                        }
                                    }
                                },
                                create: {
                                    userId: dbUser.id,
                                    username: clerkUsername,
                                    data: {
                                        username: {
                                            value: clerkUsername,
                                            visibility: true
                                        }
                                    }
                                }
                            });

                            revalidatePath(`/@${clerkUsername}`);
                        }
                    }
                } catch (error) {
                    console.error('Error syncing username from Clerk webhook:', error);
                }
                break;
            }
            case 'user.deleted': {
                user = await prisma.user.delete({
                    where: {
                        userId: clerkUserId,
                    },
                });
                break;
            }
            default:
                break;
        }

        return NextResponse.json({ user });
    } catch (error) {
        return NextResponse.json({ error }, { status: 500 });
    }
}