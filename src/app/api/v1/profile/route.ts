import prisma from "@/lib/prisma";
import { currentUser, auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
// no direct revalidatePath here; we call our v1 endpoint instead

export async function GET(req: NextRequest) {
  const { userId } = await auth()

  // Check if user is authenticated
  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  try {
    let user = await prisma.user.findUnique({
      where: { userId },
      include: {
        profiles: true
      }
    })

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    // Ensure user has a profile - create one if missing
    if (!user.profiles || user.profiles.length === 0) {
      try {
        const clerkUser = await currentUser()
        await prisma.profile.create({
          data: {
            userId: user.id,
            username: clerkUser?.username || null, // Set root level for efficient queries
            data: {
              username: {
                value: clerkUser?.username || null,
                visibility: true
              }
            }
          }
        })
        // Refetch user with new profile
        user = await prisma.user.findUnique({
          where: { userId },
          include: { profiles: true }
        })

        if (!user) {
          return Response.json({ error: 'User not found after profile creation' }, { status: 404 })
        }

        // Revalidate the public profile path for this user via v1 revalidate endpoint
        try {
          const username = clerkUser?.username
          if (username) {
            revalidatePath(`/@${username}`);
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
      if (clerkUser && clerkUser.username && user && user.profiles && user.profiles.length > 0) {
        // Always update profile with Clerk username (overwrites any manual username)
        const existingData = user.profiles[0].data || {}
        await prisma.profile.update({
          where: { userId: user.id },
          data: {
            username: clerkUser.username, // Sync to root level for efficient queries
            data: {
              ...existingData,
              username: {
                value: clerkUser.username,
                visibility: existingData.username?.visibility ?? true
              }
            }
          }
        })
        // Refetch user with updated profile
        user = await prisma.user.findUnique({
          where: { userId },
          include: { profiles: true }
        })
      }
    } catch (error) {
      console.error('Error syncing username from Clerk:', error)
    }

    // Get Clerk user data to sync imageUrl
    const clerkUser = await currentUser()
    if (clerkUser && user && user.profiles && user.profiles.length > 0) {
      // Update profile with Clerk's imageUrl if it's different
      const profile = user.profiles[0]
      const currentImageUrl = profile.data?.profilePicture?.value
      if (clerkUser.imageUrl && currentImageUrl !== clerkUser.imageUrl) {
        const existingData = profile.data || {}
        await prisma.profile.update({
          where: { userId: user.id },
          data: {
            data: {
              ...existingData,
              profilePicture: {
                value: clerkUser.imageUrl,
                visibility: existingData.profilePicture?.visibility ?? false
              }
            }
          }
        })
        // Refetch user with updated profile
        const updatedUser = await prisma.user.findUnique({
          where: { userId },
          include: { profiles: true }
        })
        return Response.json({ user: updatedUser, profile: updatedUser?.profiles?.[0] })
      }
    }

    // Ensure user still exists after any refetches
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    // Also return lists where this user is a collaborator
    const collaboratingTaskLists = await prisma.list.findMany({
      where: { users: { some: { userId: user.id, role: { in: ['COLLABORATOR', 'MANAGER'] } } } },
      select: { id: true, name: true, role: true, budget: true, dueDate: true, createdAt: true, updatedAt: true }
    })

    return Response.json({ user, profile: user.profiles?.[0], collaboratingTaskLists })
  } catch (error) {
    console.error('Error fetching profile:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()

  // Check if user is authenticated
  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  try {
    const data = await req.json()
    
    // Get the user first
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    // Get Clerk user data to ensure username and imageUrl come from Clerk
    const clerkUser = await currentUser()
    const clerkUsername = clerkUser?.username || null
    const clerkImageUrl = clerkUser?.imageUrl || null

    // Helper function to convert boolean/string to visibility (for backward compatibility)
    const toVisibility = (value: boolean | string | undefined, fieldName: string): string => {
      if (typeof value === 'string' && ['PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS', 'PUBLIC', 'AI_ENABLED'].includes(value)) {
        return value
      }
      // Backward compatibility: convert boolean to visibility
      if (typeof value === 'boolean') {
        return value ? 'PUBLIC' : 'PRIVATE'
      }
      // Check for new field name format (e.g., firstNameVisibility)
      const visibilityField = `${fieldName}Visibility`
      if (data[visibilityField] && typeof data[visibilityField] === 'string') {
        return data[visibilityField]
      }
      return 'PRIVATE'
    }

    // Check if profile already exists
    const existingProfile = await prisma.profile.findUnique({
      where: { userId: user.id }
    })

    let profile
    const existingProfileData = existingProfile?.data || {}
    if (existingProfile) {
      // Update existing profile - use Clerk username and imageUrl, ignore manual values
      profile = await prisma.profile.update({
        where: { userId: user.id },
        data: {
          username: clerkUsername, // Sync to root level for efficient queries
          data: {
            ...existingProfileData,
            firstName: {
              value: data.firstName || existingProfileData.firstName?.value,
              visibility: toVisibility(data.firstNameVisible, 'firstName') === 'PUBLIC'
            },
            lastName: {
              value: data.lastName || existingProfileData.lastName?.value,
              visibility: toVisibility(data.lastNameVisible, 'lastName') === 'PUBLIC'
            },
            username: {
              value: clerkUsername, // Always use Clerk's username
              visibility: toVisibility(data.userNameVisible, 'userName') === 'PUBLIC'
            },
            bio: {
              value: data.bio || existingProfileData.bio?.value,
              visibility: toVisibility(data.bioVisible, 'bio') === 'PUBLIC'
            },
            profilePicture: {
              value: clerkImageUrl, // Always use Clerk's imageUrl
              visibility: toVisibility(data.profilePictureVisible, 'profilePicture') === 'PUBLIC'
            },
            charts: existingProfileData.charts || {
              value: data.publicCharts,
              visibility: toVisibility(data.publicChartsVisible, 'publicCharts') === 'PUBLIC'
            }
          }
        }
      })
    } else {
      // Create new profile - use Clerk username and imageUrl, ignore manual values
      profile = await prisma.profile.create({
        data: {
          userId: user.id,
          username: clerkUsername, // Set root level for efficient queries
          data: {
            firstName: {
              value: data.firstName,
              visibility: toVisibility(data.firstNameVisible, 'firstName') === 'PUBLIC'
            },
            lastName: {
              value: data.lastName,
              visibility: toVisibility(data.lastNameVisible, 'lastName') === 'PUBLIC'
            },
            username: {
              value: clerkUsername, // Always use Clerk's username
              visibility: toVisibility(data.userNameVisible, 'userName') === 'PUBLIC'
            },
            bio: {
              value: data.bio,
              visibility: toVisibility(data.bioVisible, 'bio') === 'PUBLIC'
            },
            profilePicture: {
              value: clerkImageUrl, // Always use Clerk's imageUrl
              visibility: toVisibility(data.profilePictureVisible, 'profilePicture') === 'PUBLIC'
            },
            charts: {
              value: data.publicCharts,
              visibility: toVisibility(data.publicChartsVisible, 'publicCharts') === 'PUBLIC'
            }
          }
        }
      })
    }

    // Revalidate the user's public profile page if Clerk username exists
    if (clerkUsername) {
      try {
        const origin = new URL(req.url).origin
        await fetch(`${origin}/api/v1/revalidate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ paths: [`/@${clerkUsername}`] })
        })
      } catch (revalidateError) {
        console.error('Error calling v1 revalidate for profile path:', revalidateError)
      }
    }

    return Response.json({ profile })
  } catch (error) {
    console.error('Error creating/updating profile:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
