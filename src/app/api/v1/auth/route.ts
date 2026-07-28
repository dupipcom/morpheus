// src/app/api/webhooks/clerk

import prisma from '@/lib/prisma';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache'
import { Webhook } from 'svix'

export const runtime = 'nodejs'

export async function POST(req: Request) {
    try {
        // Verify the Clerk webhook signature using Svix
        const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
        if (webhookSecret) {
            const svix_id = req.headers.get('svix-id');
            const svix_timestamp = req.headers.get('svix-timestamp');
            const svix_signature = req.headers.get('svix-signature');

            if (!svix_id || !svix_timestamp || !svix_signature) {
                return NextResponse.json(
                    { error: 'Missing Svix headers' },
                    { status: 400 },
                );
            }

            const body = await req.text();
            const wh = new Webhook(webhookSecret);
            try {
                wh.verify(body, {
                    'svix-id': svix_id,
                    'svix-timestamp': svix_timestamp,
                    'svix-signature': svix_signature,
                });
            } catch (err) {
                console.error('Clerk webhook signature verification failed:', err);
                return NextResponse.json(
                    { error: 'Invalid webhook signature' },
                    { status: 401 },
                );
            }

            const evt = JSON.parse(body) as WebhookEvent;
            return handleWebhookEvent(evt);
        }

        // Fallback: no secret configured, parse body directly (development only)
        const evt = (await req.json()) as WebhookEvent;
        return handleWebhookEvent(evt);
    } catch (error) {
        return NextResponse.json({ error }, { status: 500 });
    }
}

async function handleWebhookEvent(evt: WebhookEvent): Promise<NextResponse> {
    const { id: clerkUserId } = evt.data;
    if (!clerkUserId)
        return NextResponse.json(
            { error: 'No user ID provided' },
            { status: 400 },
        );

    let user = null;
    switch (evt.type) {
        case 'user.created': {
            user = await prisma.user.upsert({
                where: {
                    userId: clerkUserId,
                },
                update: {
                    userId: clerkUserId,
                    settings: {
                        set: {
                            currency: null,
                            speed: null
                        } as any
                    }
                },
                create: {
                    userId: clerkUserId,
                    settings: {
                        currency: null,
                        speed: null
                    } as any
                },
            });

            // Always create a public profile for every new user
            try {
                const webhookData: any = evt.data;
                const clerkUsername: string | null = webhookData?.username ?? null;
                const clerkImageUrl: string | null = webhookData?.image_url ?? webhookData?.imageUrl ?? null;

                // Check if a profile already exists (upsert may have found existing user)
                const existingProfile = await prisma.profile.findUnique({
                    where: { userId: user.id }
                });

                if (!existingProfile) {
                    await prisma.profile.create({
                        data: {
                            userId: user.id,
                            username: clerkUsername,
                            data: {
                                username: {
                                    value: clerkUsername,
                                    visibility: true
                                },
                                profilePicture: clerkImageUrl ? {
                                    value: clerkImageUrl,
                                    visibility: false
                                } : undefined
                            }
                        }
                    });

                    if (clerkUsername) {
                        revalidatePath(`/@${clerkUsername}`);
                    }
                }
            } catch (error) {
                console.error('Error creating profile on user creation:', error);
            }
            break;
        }
        case 'session.created': {
            // When a new session is created (actual login), ensure profile exists and sync username
            const sessionData: any = evt.data;
            const sessionUserId: string | undefined = sessionData?.user_id || sessionData?.userId || clerkUserId;
            if (sessionUserId) {
                try {
                    const dbUser = await prisma.user.findUnique({
                        where: { userId: sessionUserId },
                        include: { profiles: true }
                    });

                    if (dbUser && (!dbUser.profiles || dbUser.profiles.length === 0)) {
                        // Profile missing — create a basic one so the user is never profileless
                        await prisma.profile.create({
                            data: {
                                userId: dbUser.id,
                                data: {
                                    username: {
                                        value: null,
                                        visibility: true
                                    }
                                }
                            }
                        });
                    }
                } catch (usernameError) {
                    console.error('Error ensuring profile on session creation:', usernameError);
                }
            }
            break;
        }
        case 'user.updated': {
            // Sync username from Clerk webhook data to Prisma database
            try {
                const webhookData: any = evt.data;
                const clerkUsername: string | null = webhookData?.username ?? null;

                if (clerkUsername) {
                    const dbUser = await prisma.user.findUnique({
                        where: { userId: clerkUserId },
                        include: { profiles: true }
                    });

                    if (dbUser) {
                        if (dbUser.profiles && dbUser.profiles.length > 0) {
                            const existingData = dbUser.profiles[0].data || {}
                            await prisma.profile.update({
                                where: { userId: dbUser.id },
                                data: {
                                    username: clerkUsername,
                                    data: {
                                        ...existingData,
                                        username: {
                                            value: clerkUsername,
                                            visibility: existingData.username?.visibility ?? true
                                        }
                                    }
                                }
                            });
                        } else {
                            await prisma.profile.create({
                                data: {
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
                        }

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
}