import prisma from "@/lib/prisma";
import { currentUser, auth } from '@clerk/nextjs/server'
import { recalculateUserBudget } from "@/lib/utils/budgetUtils"
import { calculateDatePeriods, parseNumericValue } from "@/lib/services/day"

/**
 * Helper to get or create user
 */
async function getOrCreateUser(clerkUserId: string) {
  let user = await prisma.user.findUnique({
    where: { userId: clerkUserId },
    include: { profiles: true }
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        userId: clerkUserId,
        settings: { currency: null, speed: null }
      },
      include: { profiles: true }
    })
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
  const existingDay = await prisma.day.findFirst({
    where: { userId, date: dateISO }
  })

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

  if (existingDay) {
    await prisma.day.update({
      where: { id: existingDay.id },
      data: updateData
    })
  } else {
    await prisma.day.create({
      data: {
        userId,
        date: dateISO,
        ...updateData
      }
    })
  }
}

export async function GET(req: Request) {
  const { userId } = await auth()

  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  let user = await getOrCreateUser(userId)

  // Ensure user has a profile - create one if missing
  if (user && (!user.profiles || user.profiles.length === 0)) {
    try {
      const clerkUser = await currentUser()
      await prisma.profile.create({
        data: {
          userId: user.id,
          data: {
            username: { value: clerkUser?.username || null, visibility: true },
            firstName: { value: null, visibility: false },
            lastName: { value: null, visibility: false },
            bio: { value: null, visibility: false },
            profilePicture: { value: null, visibility: false }
          }
        }
      })
      user = await getOrCreateUser(userId)

      // Revalidate public profile path
      try {
        const username = clerkUser?.username
        if (username) {
          const origin = new URL(req.url).origin
          await fetch(`${origin}/api/v1/revalidate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ paths: [`/@${username}`] })
          })
        }
      } catch (revalidateError) {
        console.error('Error calling v1 revalidate for profile path:', revalidateError)
      }
    } catch (error) {
      console.error('Error creating profile:', error)
    }
  }

  // Sync username from Clerk
  try {
    const clerkUser = await currentUser()
    if (clerkUser?.username && user?.profiles?.length) {
      const existingData = (user.profiles[0].data || {}) as Record<string, unknown>
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
    }
  } catch (error) {
    console.error('Error syncing username from Clerk:', error)
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
    user = await prisma.user.create({
      data: {
        userId,
        settings: { currency: null, speed: null }
      }
    })
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

  return Response.json(user)
}
