import prisma from "@/lib/prisma";
import { currentUser, auth } from '@clerk/nextjs/server'
// Helpers and constants removed - no longer needed for entries
// Entry utils removed - data now stored in Day model
import { recalculateUserBudget } from "@/lib/budgetUtils"

export async function GET(req: Request) {
  const { userId } = await auth()

  // Check if user is authenticated
  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  const getUser = async () => await prisma.user.findUnique({
       where: { userId },
       include: { profiles: true }
    })

  let user = await getUser()

  // If user doesn't exist in database, create them
  if (!user) {
    user = await prisma.user.create({
      data: {
        userId,
        settings: {
          currency: null,
          speed: null
        } as any
      },
      include: { profiles: true }
    })
  }

  // Ensure user has a profile - create one if missing
  if (user && (!user.profiles || user.profiles.length === 0)) {
    try {
      const clerkUser = await currentUser()
      await prisma.profile.create({
        data: {
          userId: user.id,
          data: {
            username: {
              value: clerkUser?.username || null,
              visibility: true
            }
          },
          firstNameVisibility: 'PRIVATE',
          lastNameVisibility: 'PRIVATE',
          userNameVisibility: 'PUBLIC',
          bioVisibility: 'PRIVATE',
          profilePictureVisibility: 'PRIVATE',
          publicChartsVisibility: 'PRIVATE',
        }
      })
      // Refetch user with new profile
      user = await getUser()

      // Revalidate the public profile path for this user via v1 revalidate endpoint
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

  // Always sync username from Clerk if available - Clerk takes precedence
  try {
    const clerkUser = await currentUser()
    if (clerkUser && clerkUser.username && user) {
      if (user.profiles && user.profiles.length > 0) {
        // Always update existing profile with Clerk username (overwrites any manual username)
        const existingData = user.profiles[0].data || {}
        await prisma.profile.update({
          where: { userId: user.id },
          data: {
            data: {
              ...existingData,
              username: {
                value: clerkUser.username,
                visibility: existingData.username?.visibility ?? true
              }
            }
          }
        })
      }
      // Refetch user with updated profile
      user = await getUser()
    }
  } catch (error) {
    console.error('Error syncing username from Clerk:', error)
  }

  // Ensure budget fields are initialized for existing users
  if (user && (user.usedBudget === null || user.usedBudget === undefined)) {
    try {
      // Recalculate budget based on existing task lists
      await recalculateUserBudget(user.id)
      // Refetch user with updated budget fields
      user = await getUser()
    } catch (error) {
      console.error('Error initializing budget fields:', error)
    }
  }

  return Response.json(user)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  const data = await req.json()

  // Check if user is authenticated
  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  const getUser = async () => await prisma.user.findUnique({
       where: { userId }
    })

  let user = await getUser()

  // If user doesn't exist in database, create them
  if (!user) {
    user = await prisma.user.create({
      data: {
        userId,
        settings: {
          currency: null,
          speed: null
        } as any
      }
    })
  }

  // Update lastLogin timestamp if requested
  if (data?.lastLogin === true) {
    await prisma.user.update({
      // Cast to any to tolerate generated client lag before prisma generate
      data: ({
        lastLogin: new Date()
      } as any),
      where: { id: (user as any).id },
    })
    user = await getUser()
  }

  if (data.availableBalance !== undefined && data.availableBalance !== null) {
    const newAvailableBalance = Math.max(0, typeof data.availableBalance === 'string' 
      ? parseFloat(data.availableBalance) 
      : Number(data.availableBalance))
    const currentStash = Math.max(0, typeof user.stash === 'number' 
      ? user.stash 
      : (typeof user.stash === 'string' ? parseFloat(user.stash || '0') : 0))
    const newEquity = Math.max(0, newAvailableBalance - currentStash)
    
    await prisma.user.update({
      data: {
        availableBalance: newAvailableBalance,
        equity: newEquity as number
      },
      where: { id: user.id },
    })
    user = await getUser()
  }


  if (data?.withdrawStash) {
    const currentStash = Math.max(0, typeof user.stash === 'number' 
      ? user.stash 
      : (typeof user.stash === 'string' ? parseFloat(user.stash || '0') : 0))
    const currentTotalEarnings = Math.max(0, typeof user.totalEarnings === 'number' 
      ? user.totalEarnings 
      : (typeof user.totalEarnings === 'string' ? parseFloat(user.totalEarnings || '0') : 0))
    const currentAvailableBalance = Math.max(0, user.availableBalance ?? 0)
    
    // Withdraw: subtract stash from availableBalance and add to totalEarnings
    const newAvailableBalance = Math.max(0, currentAvailableBalance - currentStash)
    const newTotalEarnings = Math.max(0, currentTotalEarnings + currentStash)
    const newEquity = Math.max(0, newAvailableBalance) // Equity = availableBalance since stash is 0
    
    await prisma.user.update({
      data: {
        availableBalance: newAvailableBalance,
        stash: 0 as number,
        totalEarnings: newTotalEarnings as number,
        equity: newEquity as number,
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  if (data?.settings) {
    await prisma.user.update({
      data: {
        settings: {
          set: {
            ...(user.settings || {}),
            ...data.settings
          } as any
        },
      },
      where: { id: user.id },
    })
    user = await getUser()
  }

  // Entries logic removed - data now stored in Day model
  
  return Response.json(user)
}
