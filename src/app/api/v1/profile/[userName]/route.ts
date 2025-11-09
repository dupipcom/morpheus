import prisma from "@/lib/prisma";
import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { generatePublicChartsData, sanitizeUserEntriesForPublic, isFieldVisible, filterProfileFields } from "@/lib/profileUtils"

export async function GET(req: NextRequest, { params }: { params: Promise<{ userName: string }> }) {
  try {
    const { userName } = await params

    const profile = await prisma.profile.findUnique({
      where: { userName },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
        bio: true,
        profilePicture: true,
        publicCharts: true,
        firstNameVisibility: true,
        lastNameVisibility: true,
        userNameVisibility: true,
        bioVisibility: true,
        profilePictureVisibility: true,
        publicChartsVisibility: true,
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

    // Determine viewer and relationship
    const { userId: viewerUserId } = await auth()
    const viewerUser = viewerUserId ? await prisma.user.findUnique({ 
      where: { userId: viewerUserId },
      select: {
        id: true,
        friends: true,
        closeFriends: true
      }
    }) : null
    
    const isOwner = viewerUser && viewerUser.id === profile.user.id
    
    // Check bidirectional friendship - both users must have each other in their lists
    // Convert to strings for comparison (MongoDB ObjectIds)
    const profileUserIdStr = profile.user.id.toString()
    const viewerUserIdStr = viewerUser?.id.toString() || ''
    
    const profileCloseFriends = (profile.user.closeFriends || []).map((id: any) => id.toString())
    const viewerCloseFriends = (viewerUser?.closeFriends || []).map((id: any) => id.toString())
    const profileFriends = (profile.user.friends || []).map((id: any) => id.toString())
    const viewerFriends = (viewerUser?.friends || []).map((id: any) => id.toString())
    
    const isCloseFriend = !isOwner && viewerUser && 
      profileCloseFriends.includes(viewerUserIdStr) &&
      viewerCloseFriends.includes(profileUserIdStr)
    
    const isFriend = !isOwner && !isCloseFriend && viewerUser && 
      profileFriends.includes(viewerUserIdStr) &&
      viewerFriends.includes(profileUserIdStr)


    // Generate public charts data if charts are visible
    let publicChartsData = null
    if (isFieldVisible(profile.publicChartsVisibility || 'PRIVATE') && profile.publicCharts) {
      const chartVisibility = {
        moodCharts: (profile.publicCharts as any)?.moodCharts || false,
        simplifiedMoodChart: (profile.publicCharts as any)?.simplifiedMoodChart || false,
        productivityCharts: (profile.publicCharts as any)?.productivityCharts || false,
        earningsCharts: (profile.publicCharts as any)?.earningsCharts || false,
      }
      
      publicChartsData = generatePublicChartsData(profile.user.entries, chartVisibility)
    }

    // Determine allowed visibility for templates/lists
    const allowedVis = isOwner
      ? ["PRIVATE", "FRIENDS", "CLOSE_FRIENDS", "PUBLIC"]
      : isCloseFriend
      ? ["PUBLIC", "FRIENDS", "CLOSE_FRIENDS"]
      : isFriend
      ? ["PUBLIC", "FRIENDS"]
      : ["PUBLIC"]

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

    // Filter profile fields based on visibility and relationship
    const filteredProfile = filterProfileFields(profile, {
      isOwner,
      isFriend,
      isCloseFriend
    })

    // Return only the public data based on visibility settings
    const publicProfile: any = {
      ...filteredProfile,
      publicCharts: publicChartsData,
      templates: visibleTemplates,
      taskLists: visibleTaskLists
    }
    
    // Debug logging (can be removed in production)
    if (process.env.NODE_ENV === 'development') {
      console.log('Profile visibility check:', {
        profileUserId: profileUserIdStr,
        viewerUserId: viewerUserIdStr,
        profileFriends: profileFriends,
        viewerFriends: viewerFriends,
        profileCloseFriends: profileCloseFriends,
        viewerCloseFriends: viewerCloseFriends,
        isOwner,
        isFriend,
        isCloseFriend,
        filteredProfile
      })
    }

    return Response.json({ profile: publicProfile })
  } catch (error) {
    console.error('Error fetching public profile:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
