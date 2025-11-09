// src/app/api/webhooks/clerk

import prisma from '@/lib/prisma';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { WEEKLY_ACTIONS, DAILY_ACTIONS } from "@/app/constants"
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
                            dailyTemplate: DAILY_ACTIONS,
                            weeklyTemplate: WEEKLY_ACTIONS
                        }
                    },
                    create: {
                        userId: clerkUserId,
                        settings: {
                            dailyTemplate: DAILY_ACTIONS,
                            weeklyTemplate: WEEKLY_ACTIONS
                        }
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
                                userName: clerkUsername,
                                firstNameVisibility: 'PRIVATE',
                                lastNameVisibility: 'PRIVATE',
                                userNameVisibility: 'PUBLIC',
                                bioVisibility: 'PRIVATE',
                                profilePictureVisibility: 'PRIVATE',
                                publicChartsVisibility: 'PRIVATE',
                            }
                        });
                        console.log(`Username synced from Clerk webhook on user creation: ${clerkUsername} for user ${clerkUserId}`);
                        
                        // Revalidate the public profile page
                        await revalidatePath(`/@${clerkUsername}`);
                    }
                } catch (error) {
                    console.error('Error syncing username from Clerk webhook on user creation:', error);
                }
                break;
            }
            case 'session.created': {
                // When a new session is created (actual login), update lastLogin and sync username
                const sessionData: any = evt.data;
                const sessionUserId: string | undefined = sessionData?.user_id || sessionData?.userId || clerkUserId;
                if (sessionUserId) {
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
                                    dailyTemplate: DAILY_ACTIONS,
                                    weeklyTemplate: WEEKLY_ACTIONS
                                },
                                // cast to any to tolerate client lag
                                ...( { lastLogin: new Date() } as any )
                            }
                        })
                    }

                    // Sync username from webhook data on login
                    try {
                        const webhookData: any = evt.data;
                        const clerkUsername = webhookData?.username;
                        
                        if (clerkUsername) {
                            const dbUser = await prisma.user.findUnique({
                                where: { userId: sessionUserId },
                                include: { profile: true }
                            });

                            if (dbUser) {
                                if (dbUser.profile) {
                                    await prisma.profile.update({
                                        where: { userId: dbUser.id },
                                        data: { userName: clerkUsername }
                                    });
                                } else {
                                    await prisma.profile.create({
                                        data: {
                                            userId: dbUser.id,
                                            userName: clerkUsername,
                                            firstNameVisible: false,
                                            lastNameVisible: false,
                                            userNameVisible: false,
                                            bioVisible: false,
                                            profilePictureVisible: false,
                                            publicChartsVisible: false,
                                        }
                                    });
                                }
                                console.log(`Username synced from Clerk webhook on login: ${clerkUsername} for user ${sessionUserId}`);
                                
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
                            include: { profile: true }
                        });

                        if (dbUser) {
                            // Always update or create profile with username from Clerk webhook (overwrites any manual username)
                            if (dbUser.profile) {
                                await prisma.profile.update({
                                    where: { userId: dbUser.id },
                                    data: { userName: clerkUsername }
                                });
                            } else {
                                await prisma.profile.create({
                                    data: {
                                        userId: dbUser.id,
                                        userName: clerkUsername,
                                        firstNameVisible: false,
                                        lastNameVisible: false,
                                        userNameVisible: false,
                                        bioVisible: false,
                                        profilePictureVisible: false,
                                        publicChartsVisible: false,
                                    }
                                });
                            }
                            console.log(`Username synced from Clerk webhook: ${clerkUsername} for user ${clerkUserId}`);
                            
                            // Revalidate the public profile page
                            await revalidateUserProfile(clerkUsername, new URL(req.url).origin);
                        }
                    } else {
                        console.log('No username found in Clerk webhook data');
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