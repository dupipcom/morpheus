import prisma from '@/lib/prisma'
import { clerkClient } from '@clerk/nextjs/server'

type ClerkUserLike = {
  username?: string | null
  imageUrl?: string | null
} | null

/**
 * Idempotently ensures a `User` row exists for the given Clerk user id and that
 * a public `Profile` row exists for it. Safe to call on every authenticated
 * request — cheap when both already exist (two indexed lookups).
 *
 * When creating a `Profile` for the first time, pulls `username` and
 * `imageUrl` from Clerk so `/@username` lookups work immediately after signup.
 *
 * All errors are swallowed and logged; this helper never throws so it can be
 * safely awaited from middleware-adjacent code paths without breaking requests.
 */
export async function ensureUserAndProfile(
  clerkUserId: string,
  clerkUserOverride?: ClerkUserLike,
): Promise<void> {
  if (!clerkUserId) return

  try {
    let user = await prisma.user.findUnique({
      where: { userId: clerkUserId },
      include: { profiles: true },
    })

    if (!user) {
      // NB: no `include` on the create. Prisma runs a create-with-nested-read
      // inside a transaction, which standalone MongoDB rejects (P2031) — that
      // would break local dev and CI on a non-replica-set deployment. Create
      // plainly, then re-read with the relation.
      try {
        await prisma.user.create({
          data: {
            userId: clerkUserId,
            settings: { currency: null, speed: null } as any,
          },
        })
      } catch (error: any) {
        // P2002: created by a concurrent request — the re-read below picks it up.
        if (error?.code !== 'P2002') throw error
      }

      user = await prisma.user.findUnique({
        where: { userId: clerkUserId },
        include: { profiles: true },
      })
    }

    if (!user) return

    if (user.profiles && user.profiles.length > 0) return

    const existingProfile = await prisma.profile.findUnique({
      where: { userId: user.id },
    })
    if (existingProfile) return

    // Resolve Clerk user data lazily so this helper works from webhook,
    // middleware-adjacent, and route contexts.
    let clerkUser: ClerkUserLike = clerkUserOverride ?? null
    if (!clerkUser) {
      try {
        const client = await clerkClient()
        const fetched = await client.users.getUser(clerkUserId)
        clerkUser = {
          username: fetched?.username ?? null,
          imageUrl: fetched?.imageUrl ?? null,
        }
      } catch {
        clerkUser = null
      }
    }

    const clerkUsername = clerkUser?.username ?? null
    const clerkImageUrl = clerkUser?.imageUrl ?? null

    const createData: any = {
      userId: user.id,
      data: {
        username: { value: clerkUsername, visibility: true },
      },
    }
    if (clerkUsername) {
      createData.username = clerkUsername
    }
    if (clerkImageUrl) {
      createData.data.profilePicture = {
        value: clerkImageUrl,
        visibility: false,
      }
    }

    try {
      await prisma.profile.create({ data: createData })
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error
      // P2002: profile was just created by a concurrent request — fine.
    }
  } catch (error) {
    console.error('[ensureUserAndProfile] failed:', error)
  }
}
