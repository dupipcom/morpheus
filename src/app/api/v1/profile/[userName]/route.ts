import prisma from "@/lib/prisma";
import { NextRequest } from 'next/server'
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
            entries: true
          }
        }
      }
    })

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 })
    }

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

    // Return only the public data based on visibility settings
    const publicProfile = {
      firstName: profile.firstNameVisible ? profile.firstName : null,
      lastName: profile.lastNameVisible ? profile.lastName : null,
      userName: profile.userNameVisible ? profile.userName : null,
      bio: profile.bioVisible ? profile.bio : null,
      profilePicture: profile.profilePictureVisible ? profile.profilePicture : null,
      publicCharts: publicChartsData,
    }

    return Response.json({ profile: publicProfile })
  } catch (error) {
    console.error('Error fetching public profile:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
