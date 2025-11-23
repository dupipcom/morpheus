// src/app/api/webhooks/clerk

import prisma from '@/lib/prisma';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

export async function POST(req: Request) {
    try {
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

                // Sync username from webhook data when user is created
                try {
                    const webhookData: any = evt.data;
                    const clerkUsername = webhookData?.username;
                    
                    if (clerkUsername && user) {
                        // Create profile with username from Clerk webhook
                        await prisma.profile.create({
                            data: {
                                userId: user.id,
                                data: {
                                    username: {
                                        value: clerkUsername,
                                        visibility: true
                                    }
                                }
                            }
                        });
                        
                        // Revalidate the public profile page
                        await revalidatePath(`/@${clerkUsername}`);
                    }
                } catch (error) {
                    console.error('Error syncing username from Clerk webhook on user creation:', error);
                }
                break;
            }
            case 'session.created': {
                // When a new session is created (actual login), sync username
                const sessionData: any = evt.data;
                const sessionUserId: string | undefined = sessionData?.user_id || sessionData?.userId || clerkUserId;
                if (sessionUserId) {
                    // Sync username from webhook data on login
                    try {
                        const webhookData: any = evt.data;
                        const clerkUsername = webhookData?.username;
                        
                        if (clerkUsername) {
                            const dbUser = await prisma.user.findUnique({
                                where: { userId: sessionUserId },
                                include: { profiles: true }
                            });

                            if (dbUser) {
                                if (dbUser.profiles && dbUser.profiles.length > 0) {
                                    const existingData = dbUser.profiles[0].data || {}
                                    await prisma.profile.update({
                                        where: { userId: dbUser.id },
                                        data: {
                                            data: {
                                                ...existingData,
                                                username: {
                                                    value: clerkUsername,
                                                    visibility: existingData.username?.visibility ?? false
                                                }
                                            }
                                        }
                                    });
                                } else {
                                    await prisma.profile.create({
                                        data: {
                                            userId: dbUser.id,
                                            data: {
                                                username: {
                                                    value: clerkUsername,
                                                    visibility: false
                                                }
                                            }
                                        }
                                    });
                                }
                                
                                // Revalidate the public profile page
                                await revalidateUserProfile(clerkUsername, new URL(req.url).origin);
                            }
                        }
                    } catch (usernameError) {
                        console.error('Error syncing username from Clerk webhook on login:', usernameError);
                    }
                }
                break;
            }
            case 'user.updated': {
                // Sync username from Clerk webhook data to Prisma database
                try {
                    const webhookData: any = evt.data;
                    const clerkUsername = webhookData?.username;
                    
                    if (clerkUsername) {
                        // Find the user in our database
                        const dbUser = await prisma.user.findUnique({
                            where: { userId: clerkUserId },
                            include: { profiles: true }
                        });

                        if (dbUser) {
                            // Always update or create profile with username from Clerk webhook (overwrites any manual username)
                            if (dbUser.profiles && dbUser.profiles.length > 0) {
                                const existingData = dbUser.profiles[0].data || {}
                                await prisma.profile.update({
                                    where: { userId: dbUser.id },
                                    data: {
                                        data: {
                                            ...existingData,
                                            username: {
                                                value: clerkUsername,
                                                visibility: existingData.username?.visibility ?? false
                                            }
                                        }
                                    }
                                });
                            } else {
                                await prisma.profile.create({
                                    data: {
                                        userId: dbUser.id,
                                        data: {
                                            username: {
                                                value: clerkUsername,
                                                visibility: false
                                            }
                                        }
                                    }
                                });
                            }
                            
                            // Revalidate the public profile page
                            await revalidateUserProfile(clerkUsername, new URL(req.url).origin);
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