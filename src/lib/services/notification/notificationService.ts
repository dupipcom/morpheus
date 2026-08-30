/**
 * Notification service
 * Creates and lists in-app notifications (job requests, approvals, list invites).
 * Notifications are best-effort side effects: callers fire-and-forget them and
 * must never fail a write path when notification creation fails.
 */

import prisma from '@/lib/prisma'
import type { Notification } from '@/generated/prisma/client'

/** Notification type strings used across the app */
export const NOTIFICATION_TYPES = {
  JOB_REQUESTED: 'JOB_REQUESTED',
  JOB_ACCEPTED: 'JOB_ACCEPTED',
  JOB_REJECTED: 'JOB_REJECTED',
  LIST_INVITE: 'LIST_INVITE',
  VOICEMAIL: 'VOICEMAIL',
} as const

/** Shape of a notification as returned by listNotifications */
export interface NotificationListItem {
  id: string
  type: string
  actorId: string | null
  actorName: string | null
  resourceId: string | null
  message: string | null
  readAt: Date | null
  createdAt: Date
}

/**
 * Create a notification for a recipient.
 * Skips (returns null) when the actor is the recipient themselves —
 * no self-notifications.
 */
export async function notifyUser(params: {
  userId: string          // internal User id of the recipient
  type: string            // JOB_REQUESTED | JOB_ACCEPTED | JOB_REJECTED | LIST_INVITE
  actorId?: string | null // internal User id of the triggerer
  resourceId?: string | null
  message?: string | null
}): Promise<Notification | null> {
  const { userId, type, actorId = null, resourceId = null, message = null } = params

  if (actorId && actorId === userId) {
    return null
  }

  return prisma.notification.create({
    data: {
      userId,
      type,
      actorId,
      resourceId,
      message,
    },
  })
}

/**
 * List a user's notifications, newest first. Enriches the actor username in a
 * single query (Profile.username is the public name). `take` is capped at 50.
 */
export async function listNotifications(params: {
  userId: string
  take?: number
}): Promise<{ notifications: NotificationListItem[]; unreadCount: number }> {
  const { userId, take = 30 } = params
  const limit = Math.min(Math.max(take, 1), 50)

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ])

  // Enrich actor usernames (one query for all distinct actors)
  const actorIds = Array.from(
    new Set(notifications.map((n) => n.actorId).filter((id): id is string => !!id))
  )
  const profiles =
    actorIds.length > 0
      ? await prisma.profile.findMany({
          where: { userId: { in: actorIds } },
          select: { userId: true, username: true },
        })
      : []
  const actorNameById = new Map(profiles.map((p) => [p.userId, p.username]))

  return {
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      actorId: n.actorId,
      actorName: n.actorId ? actorNameById.get(n.actorId) || null : null,
      resourceId: n.resourceId,
      message: n.message,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    unreadCount,
  }
}

/**
 * Mark notifications as read. With `ids` provided, marks only those
 * (validated by the caller); without, marks all of the user's unread ones.
 * Returns the number of notifications newly marked read.
 */
export async function markNotificationsRead(params: {
  userId: string
  ids?: string[]
}): Promise<number> {
  const { userId, ids } = params

  const result = await prisma.notification.updateMany({
    where:
      ids && ids.length > 0
        ? { userId, id: { in: ids }, readAt: null }
        : { userId, readAt: null },
    data: { readAt: new Date() },
  })

  return result.count
}

/** Number of unread notifications for a user */
export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } })
}
