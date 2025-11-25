import prisma from "@/lib/prisma";
import { currentUser, auth } from '@clerk/nextjs/server'
// Helpers and constants removed - no longer needed for entries
// Entry utils removed - data now stored in Day model
import { recalculateUserBudget } from "@/lib/utils/budgetUtils"
import { getWeekNumber } from "@/app/helpers"

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
            },
            firstName: {
              value: null,
              visibility: false
            },
            lastName: {
              value: null,
              visibility: false
            },
            bio: {
              value: null,
              visibility: false
            },
            profilePicture: {
              value: null,
              visibility: false
            }
          }
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
    
    // Update current day entry with new balance, stash, and equity
    try {
      const today = new Date()
      const dateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      
      const existingDay = await prisma.day.findFirst({
        where: {
          userId: user.id,
          date: dateISO
        }
      })
      
      if (existingDay) {
        await prisma.day.update({
          where: { id: existingDay.id },
          data: {
            balance: newAvailableBalance,
            stash: currentStash,
            equity: newEquity
          }
        })
      } else {
        // Create new day entry if it doesn't exist
        const [_, weekNumber] = getWeekNumber(today)
        const month = today.getMonth() + 1
        const quarter = Math.ceil(month / 3)
        const semester = month <= 6 ? 1 : 2
        await prisma.day.create({
          data: {
            userId: user.id,
            date: dateISO,
            balance: newAvailableBalance,
            stash: currentStash,
            equity: newEquity,
            week: typeof weekNumber === 'number' ? weekNumber : Number(weekNumber) || 1,
            month: month,
            quarter: quarter,
            semester: semester
          }
        })
      }
    } catch (dayError) {
      // Log error but don't fail the request if Day update fails
      console.error('Error updating Day entry with balance:', dayError)
    }
  }


  if (data?.withdrawStash) {
    const currentStash = Math.max(0, typeof user.stash === 'number' 
      ? user.stash 
      : (typeof user.stash === 'string' ? parseFloat(user.stash || '0') : 0))
    const currentAvailableBalance = Math.max(0, user.availableBalance ?? 0)
    const currentWithdrawn = Math.max(0, typeof user.withdrawn === 'number' 
      ? user.withdrawn 
      : (typeof user.withdrawn === 'string' ? parseFloat(user.withdrawn || '0') : 0))
    
    // Withdraw: subtract stash from availableBalance and accumulate in withdrawn
    const newAvailableBalance = Math.max(0, currentAvailableBalance - currentStash)
    const newEquity = Math.max(0, newAvailableBalance) // Equity = availableBalance since stash is 0
    const newStash = 0
    const newWithdrawn = Math.max(0, currentWithdrawn + currentStash)
    
    await prisma.user.update({
      data: {
        availableBalance: newAvailableBalance,
        stash: newStash as number,
        equity: newEquity as number,
        withdrawn: newWithdrawn as number,
      },
      where: { id: user.id },
    })
    user = await getUser()
    
    // Update current day entry with new balance, stash, equity, and withdrawn amount
    try {
      const today = new Date()
      const dateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      
      const existingDay = await prisma.day.findFirst({
        where: {
          userId: user.id,
          date: dateISO
        }
      })
      
      // Get existing withdrawn amount or default to 0
      const existingWithdrawn = existingDay 
        ? (typeof existingDay.withdrawn === 'number' ? existingDay.withdrawn : (typeof existingDay.withdrawn === 'string' ? parseFloat(existingDay.withdrawn || '0') : 0))
        : 0
      const newWithdrawn = existingWithdrawn + currentStash
      
      if (existingDay) {
        await prisma.day.update({
          where: { id: existingDay.id },
          data: {
            balance: newAvailableBalance,
            stash: newStash,
            equity: newEquity,
            withdrawn: newWithdrawn
          }
        })
      } else {
        // Create new day entry if it doesn't exist
        const [_, weekNumber] = getWeekNumber(today)
        const month = today.getMonth() + 1
        const quarter = Math.ceil(month / 3)
        const semester = month <= 6 ? 1 : 2
        await prisma.day.create({
          data: {
            userId: user.id,
            date: dateISO,
            balance: newAvailableBalance,
            stash: newStash,
            equity: newEquity,
            withdrawn: newWithdrawn,
            week: typeof weekNumber === 'number' ? weekNumber : Number(weekNumber) || 1,
            month: month,
            quarter: quarter,
            semester: semester
          }
        })
      }
    } catch (dayError) {
      // Log error but don't fail the request if Day update fails
      console.error('Error updating Day entry with balance:', dayError)
    }
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

  if (data?.consents) {
    await prisma.user.update({
      data: {
        consents: {
          set: {
            ...(user.consents || {}),
            ...data.consents
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
