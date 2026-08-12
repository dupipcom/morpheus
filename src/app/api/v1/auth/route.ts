// src/app/api/webhooks/clerk

import prisma from '@/lib/prisma';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache'

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

                    const existingProfile = await prisma.profile.findUnique({
                        where: { userId: user.id }
                    });
                    if (!existingProfile) {
                        const createData: any = {
                            userId: user.id,
                            data: {
                                username: {
                                    value: clerkUsername,
                                    visibility: true
                                }
                            }
                        };
                        // Only set root-level username when available — null violates MongoDB unique index
                        if (clerkUsername) {
                            createData.username = clerkUsername;
                        }
                        if (clerkImageUrl) {
                            createData.data.profilePicture = {
                                value: clerkImageUrl,
                                visibility: false
                            };
                        }
                        try {
                            await prisma.profile.create({ data: createData });
                            if (clerkUsername) {
                                revalidatePath(`/@${clerkUsername}`);
                            }
                        } catch (createError: any) {
                            if (createError?.code !== 'P2002') {
                                throw createError;
                            }
                            // P2002: profile was just created by a concurrent handler — that's fine
                        }
                    }
                } catch (error) {
                    console.error('Error creating profile on user creation:', error);
                }
                break;
            }
            case 'session.created': {
                // When a new session is created (actual login), ensure profile exists
                const sessionData: any = evt.data;
                const sessionUserId: string | undefined = sessionData?.user_id || sessionData?.userId || clerkUserId;
                if (sessionUserId) {
                    try {
                        const dbUser = await prisma.user.findUnique({
                            where: { userId: sessionUserId },
                            include: { profiles: true }
                        });

                        if (dbUser && (!dbUser.profiles || dbUser.profiles.length === 0)) {
                            // Profile missing — create if still missing, handle race gracefully
                            const existingProfile = await prisma.profile.findUnique({
                                where: { userId: dbUser.id }
                            });
                            if (!existingProfile) {
                                try {
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
                                } catch (createError: any) {
                                    if (createError?.code !== 'P2002') {
                                        throw createError;
                                    }
                                    // P2002: profile was just created by another handler
                                }
                            }
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