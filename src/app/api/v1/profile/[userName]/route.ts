import prisma from "@/lib/prisma";
import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { generatePublicChartsData, sanitizeUserEntriesForPublic } from "@/lib/profileUtils"

export async function GET(req: NextRequest, { params }: { params: Promise<{ userName: string }> }) {
  try {
    const { userName } = await params

    const profile = await prisma.profile.findUnique({
      where: { userName },
      include: {
        user: {
          select: {
            id: true,
            entries: true,
            friends: true,
            closeFriends: true
          }
        }
      }
    })

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Determine viewer and visibility
    const { userId: viewerUserId } = await auth()
    const viewerUser = viewerUserId ? await prisma.user.findUnique({ where: { userId: viewerUserId } }) : null
    const isOwner = viewerUser && viewerUser.id === profile.user.id
    const isCloseFriend = !isOwner && viewerUser && Array.isArray(profile.user.closeFriends) && profile.user.closeFriends.includes(viewerUser.id)
    const isFriend = !isOwner && !isCloseFriend && viewerUser && Array.isArray(profile.user.friends) && profile.user.friends.includes(viewerUser.id)

    const allowedVis = isOwner
      ? ["PRIVATE", "FRIENDS", "CLOSE_FRIENDS", "PUBLIC"]
      : isCloseFriend
      ? ["PUBLIC", "FRIENDS", "CLOSE_FRIENDS"]
      : isFriend
      ? ["PUBLIC", "FRIENDS"]
      : ["PUBLIC"]

    // Generate public charts data if charts are visible
    let publicChartsData = null
    if (profile.publicChartsVisible && profile.publicCharts) {
      const chartVisibility = {
        moodCharts: (profile.publicCharts as any)?.moodCharts || false,
        simplifiedMoodChart: (profile.publicCharts as any)?.simplifiedMoodChart || false,
        productivityCharts: (profile.publicCharts as any)?.productivityCharts || false,
        earningsCharts: (profile.publicCharts as any)?.earningsCharts || false,
      }
      
      publicChartsData = generatePublicChartsData(profile.user.entries, chartVisibility)
    }

    // Fetch visible templates and lists owned by the profile user
    let visibleTemplates: any[] = []
    let visibleTaskLists: any[] = []
    try {
      visibleTemplates = await prisma.template.findMany({
        where: {
          owners: { has: profile.user.id },
          visibility: { in: allowedVis as any }
        },
        select: { id: true, name: true, role: true, visibility: true, updatedAt: true, createdAt: true }
      })
    } catch (_) {}
    try {
      visibleTaskLists = await prisma.taskList.findMany({
        where: {
          owners: { has: profile.user.id },
          visibility: { in: allowedVis as any }
        },
        select: { id: true, name: true, role: true, visibility: true, budget: true, dueDate: true, updatedAt: true, createdAt: true }
      })
    } catch (_) {}

    // Return only the public data based on visibility settings
    const publicProfile = {
      firstName: profile.firstNameVisible ? profile.firstName : null,
      lastName: profile.lastNameVisible ? profile.lastName : null,
      userName: profile.userNameVisible ? profile.userName : null,
      bio: profile.bioVisible ? profile.bio : null,
      profilePicture: profile.profilePictureVisible ? profile.profilePicture : null,
      publicCharts: publicChartsData,
      templates: visibleTemplates,
      taskLists: visibleTaskLists
    }

    return Response.json({ profile: publicProfile })
  } catch (error) {
    console.error('Error fetching public profile:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
