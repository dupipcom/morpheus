// src/app/api/webhooks/clerk

import prisma from '@/lib/prisma';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { WEEKLY_ACTIONS, DAILY_ACTIONS } from "@/app/constants"


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
                break;
            }
            case 'session.created': {
                // When a new session is created (actual login), update lastLogin
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