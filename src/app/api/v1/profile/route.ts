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
        profile: true
      }
    })

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    // Ensure user has a profile - create one if missing
    if (!user.profile) {
      try {
        const clerkUser = await currentUser()
        await prisma.profile.create({
          data: {
            userId: user.id,
            userName: clerkUser?.username || null, // Use Clerk username if available
            firstNameVisible: false,
            lastNameVisible: false,
            userNameVisible: false,
            bioVisible: false,
            profilePictureVisible: false,
            publicChartsVisible: false,
          }
        })
        // Refetch user with new profile
        user = await prisma.user.findUnique({
          where: { userId },
          include: { profile: true }
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
      if (clerkUser && clerkUser.username && user && user.profile) {
        // Always update profile with Clerk username (overwrites any manual username)
        await prisma.profile.update({
          where: { userId: user.id },
          data: { userName: clerkUser.username }
        })
        // Refetch user with updated profile
        user = await prisma.user.findUnique({
          where: { userId },
          include: { profile: true }
        })
      }
    } catch (error) {
      console.error('Error syncing username from Clerk:', error)
    }

    // Get Clerk user data to sync imageUrl
    const clerkUser = await currentUser()
    if (clerkUser && user && user.profile) {
      // Update profile with Clerk's imageUrl if it's different
      if (clerkUser.imageUrl && user.profile.profilePicture !== clerkUser.imageUrl) {
        await prisma.profile.update({
          where: { userId: user.id },
          data: { profilePicture: clerkUser.imageUrl }
        })
        // Refetch user with updated profile
        const updatedUser = await prisma.user.findUnique({
          where: { userId },
          include: { profile: true }
        })
        return Response.json({ user: updatedUser, profile: updatedUser?.profile })
      }
    }

    // Ensure user still exists after any refetches
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    // Also return lists where this user is a collaborator
    const collaboratingTaskLists = await prisma.taskList.findMany({
      where: { collaborators: { has: user.id } },
      select: { id: true, name: true, role: true, budget: true, dueDate: true, createdAt: true, updatedAt: true }
    })

    return Response.json({ user, profile: user.profile, collaboratingTaskLists })
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

    // Check if profile already exists
    const existingProfile = await prisma.profile.findUnique({
      where: { userId: user.id }
    })

    let profile
    if (existingProfile) {
      // Update existing profile - use Clerk username and imageUrl, ignore manual values
      profile = await prisma.profile.update({
        where: { userId: user.id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          userName: clerkUsername, // Always use Clerk's username
          bio: data.bio,
          profilePicture: clerkImageUrl, // Always use Clerk's imageUrl
          publicCharts: data.publicCharts,
          firstNameVisible: data.firstNameVisible ?? false,
          lastNameVisible: data.lastNameVisible ?? false,
          userNameVisible: data.userNameVisible ?? false,
          bioVisible: data.bioVisible ?? false,
          profilePictureVisible: data.profilePictureVisible ?? false,
          publicChartsVisible: data.publicChartsVisible ?? false,
        }
      })
    } else {
      // Create new profile - use Clerk username and imageUrl, ignore manual values
      profile = await prisma.profile.create({
        data: {
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          userName: clerkUsername, // Always use Clerk's username
          bio: data.bio,
          profilePicture: clerkImageUrl, // Always use Clerk's imageUrl
          publicCharts: data.publicCharts,
          firstNameVisible: data.firstNameVisible ?? false,
          lastNameVisible: data.lastNameVisible ?? false,
          userNameVisible: data.userNameVisible ?? false,
          bioVisible: data.bioVisible ?? false,
          profilePictureVisible: data.profilePictureVisible ?? false,
          publicChartsVisible: data.publicChartsVisible ?? false,
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
