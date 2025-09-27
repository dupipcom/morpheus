import prisma from "@/lib/prisma";
import { currentUser, auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const { userId } = await auth()

  // Check if user is authenticated
  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        profile: true
      }
    })

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    return Response.json({ user, profile: user.profile })
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

    // Check if profile already exists
    const existingProfile = await prisma.profile.findUnique({
      where: { userId: user.id }
    })

    let profile
    if (existingProfile) {
      // Update existing profile
      profile = await prisma.profile.update({
        where: { userId: user.id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          userName: data.userName,
          bio: data.bio,
          profilePicture: data.profilePicture,
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
      // Create new profile
      profile = await prisma.profile.create({
        data: {
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          userName: data.userName,
          bio: data.bio,
          profilePicture: data.profilePicture,
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

    return Response.json({ profile })
  } catch (error) {
    console.error('Error creating/updating profile:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
