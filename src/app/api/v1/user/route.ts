import prisma from "@/lib/prisma";
import { currentUser, auth } from '@clerk/nextjs/server'
import { recalculateUserBudget } from "@/lib/utils/budgetUtils"
import { calculateDatePeriods, parseNumericValue } from "@/lib/services/day"
import { WRITABLE_NOTE_VISIBILITIES } from '@/lib/constants/visibility'

/**
 * Helper to get or create user
 */
async function getOrCreateUser(clerkUserId: string) {
  let user = await prisma.user.findUnique({
    where: { userId: clerkUserId },
    include: { profiles: true }
  })

  if (!user) {
    try {
      user = await prisma.user.create({
        data: {
          userId: clerkUserId,
          settings: { currency: null, speed: null }
        },
        include: { profiles: true }
      })
    } catch (error: any) {
      if (error?.code === 'P2002') {
        // User was just created by another concurrent request
        user = await prisma.user.findUnique({
          where: { userId: clerkUserId },
          include: { profiles: true }
        })
      } else {
        throw error
      }
    }
  }

  return user
}

/**
 * Helper to get today's ISO date string
 */
function getTodayISO(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

/**
 * Helper to ensure day entry exists and update balance fields
 */
async function updateDayWithBalance(
  userId: string,
  dateISO: string,
  balance: number,
  stash: number,
  equity: number,
  withdrawn?: number
): Promise<void> {
  const periods = calculateDatePeriods(dateISO)
  const updateData: Record<string, unknown> = {
    balance,
    stash,
    equity,
    ...periods
  }

  if (withdrawn !== undefined) {
    updateData.withdrawn = withdrawn
  }

  await prisma.day.upsert({
    where: { userId_date: { userId, date: dateISO } },
    update: updateData,
    create: {
      userId,
      date: dateISO,
      ...updateData
    }
  })
}

export async function GET(req: Request) {
  const { userId } = await auth()

  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  let user = await getOrCreateUser(userId)

  // Ensure user has a profile - create one if missing
  if (user && (!user.profiles || user.profiles.length === 0)) {
    const clerkUser = await currentUser()
    const existing = await prisma.profile.findUnique({ where: { userId: user.id } })
    if (!existing) {
      try {
        await prisma.profile.create({
          data: {
            userId: user.id,
            // Only set root-level username when available — null violates MongoDB unique index
            ...(clerkUser?.username ? { username: clerkUser.username } : {}),
            data: {
              username: { value: clerkUser?.username || null, visibility: true },
              firstName: { value: null, visibility: false },
              lastName: { value: null, visibility: false },
              bio: { value: null, visibility: false },
              profilePicture: { value: null, visibility: false }
            }
          }
        })
        // Revalidate public profile path
        const username = clerkUser?.username
        if (username) {
          try {
            const origin = new URL(req.url).origin
            await fetch(`${origin}/api/v1/revalidate`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ paths: [`/@${username}`] })
            })
          } catch (revalidateError) {
            console.error('Error calling v1 revalidate for profile path:', revalidateError)
          }
        }
      } catch (error: any) {
        if (error?.code === 'P2002') {
          // Profile was just created by another concurrent request
        } else {
          console.error('Error creating profile:', error)
        }
      }
    }
    user = await getOrCreateUser(userId)
  }

  // Sync username from Clerk
  try {
    const clerkUser = await currentUser()
    if (clerkUser?.username && user?.profiles?.length) {
      const existingData = (user.profiles[0].data || {}) as Record<string, unknown>
      const currentUsername = (existingData.username as Record<string, unknown>)?.value
      if (currentUsername !== clerkUser.username) {
        try {
          await prisma.profile.update({
            where: { userId: user.id },
            data: {
              data: {
                ...existingData,
                username: {
                  value: clerkUser.username,
                  visibility: (existingData.username as Record<string, unknown>)?.visibility ?? true
                }
              }
            }
          })
          user = await getOrCreateUser(userId)
        } catch (updateError: any) {
          // P2034 = write conflict/deadlock: another concurrent request already synced
          if (updateError?.code !== 'P2034') {
            throw updateError
          }
        }
      }
    }
  } catch (error: any) {
    // Clerk API errors are transient; the request already handles missing Clerk data
    if (!error?.clerkError) {
      console.error('Error syncing username from Clerk:', error)
    }
  }

  // Initialize budget fields if needed
  if (user && (user.usedBudget === null || user.usedBudget === undefined)) {
    try {
      await recalculateUserBudget(user.id)
      user = await getOrCreateUser(userId)
    } catch (error) {
      console.error('Error initializing budget fields:', error)
    }
  }

  return Response.json(user)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  const data = await req.json()

  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  let user = await prisma.user.findUnique({ where: { userId } })

  if (!user) {
    try {
      user = await prisma.user.create({
        data: {
          userId,
          settings: { currency: null, speed: null }
        }
      })
    } catch (error: any) {
      if (error?.code === 'P2002') {
        user = await prisma.user.findUnique({ where: { userId } })
      } else {
        throw error
      }
    }
  }

  // Handle availableBalance update
  if (data.availableBalance !== undefined && data.availableBalance !== null) {
    const newAvailableBalance = Math.max(0, parseNumericValue(data.availableBalance))
    const currentStash = Math.max(0, parseNumericValue(user.stash))
    const newEquity = Math.max(0, newAvailableBalance - currentStash)

    await prisma.user.update({
      where: { id: user.id },
      data: { availableBalance: newAvailableBalance, equity: newEquity }
    })
    user = await prisma.user.findUnique({ where: { userId } })

    try {
      await updateDayWithBalance(user!.id, getTodayISO(), newAvailableBalance, currentStash, newEquity)
    } catch (dayError) {
      console.error('Error updating Day entry with balance:', dayError)
    }
  }

  // Handle stash withdrawal
  if (data?.withdrawStash && user) {
    const currentStash = Math.max(0, parseNumericValue(user.stash))
    const currentAvailableBalance = Math.max(0, user.availableBalance ?? 0)
    const currentWithdrawn = Math.max(0, parseNumericValue(user.withdrawn))

    const newAvailableBalance = Math.max(0, currentAvailableBalance - currentStash)
    const newEquity = Math.max(0, newAvailableBalance)
    const newStash = 0
    const newWithdrawn = Math.max(0, currentWithdrawn + currentStash)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        availableBalance: newAvailableBalance,
        stash: newStash,
        equity: newEquity,
        withdrawn: newWithdrawn
      }
    })
    user = await prisma.user.findUnique({ where: { userId } })

    try {
      const dateISO = getTodayISO()
      const existingDay = await prisma.day.findFirst({
        where: { userId: user!.id, date: dateISO }
      })

      const existingWithdrawn = parseNumericValue(existingDay?.withdrawn)
      const dayWithdrawn = existingWithdrawn + currentStash

      await updateDayWithBalance(user!.id, dateISO, newAvailableBalance, newStash, newEquity, dayWithdrawn)
    } catch (dayError) {
      console.error('Error updating Day entry with balance:', dayError)
    }
  }

  // Handle settings update
  if (data?.settings && user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        settings: { set: { ...(user.settings || {}), ...data.settings } }
      }
    })
    user = await prisma.user.findUnique({ where: { userId } })
  }

  // Handle consents update
  if (data?.consents && user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        consents: { set: { ...(user.consents || {}), ...data.consents } }
      }
    })
    user = await prisma.user.findUnique({ where: { userId } })
  }

  // Handle default note visibility preference
  if (typeof data?.defaultNoteVisibility === 'string' && user) {
    if ((WRITABLE_NOTE_VISIBILITIES as readonly string[]).includes(data.defaultNoteVisibility)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { defaultNoteVisibility: data.defaultNoteVisibility }
      })
      user = await prisma.user.findUnique({ where: { userId } })
    }
  }

  // Handle default AI analysis preference
  if (typeof data?.defaultAiEnabled === 'boolean' && user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { defaultAiEnabled: data.defaultAiEnabled }
    })
    user = await prisma.user.findUnique({ where: { userId } })
  }

  return Response.json(user)
}
