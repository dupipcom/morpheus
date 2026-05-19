import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentChatUser } from '@/lib/chat/auth'
import { jsonError } from '@/lib/chat/api'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() || ''
    const candidateIds = [...new Set([...user.friends, ...user.closeFriends])]
    if (candidateIds.length === 0) {
      return NextResponse.json({ candidates: [] })
    }

    const [users, profiles] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true, userId: true },
      }),
      prisma.profile.findMany({
        where: { userId: { in: candidateIds } },
        select: { userId: true, data: true },
      }),
    ])

    type StoredProfileData = {
  username?: { value?: string | null }
  firstName?: { value?: string | null }
  lastName?: { value?: string | null }
  profilePicture?: { value?: string | null }
}

    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile.data as StoredProfileData | null]))
    const candidates = users.map((candidate) => {
      const profile = profileByUserId.get(candidate.id)
      const username = profile?.username?.value ?? null
      const firstName = profile?.firstName?.value ?? null
      const lastName = profile?.lastName?.value ?? null
      const displayName = [firstName, lastName].filter(Boolean).join(' ') || (username ? `@${username}` : 'Anonymous')

      return {
        id: candidate.id,
        clerkUserId: candidate.userId,
        username,
        displayName,
        imageUrl: profile?.profilePicture?.value ?? null,
      }
    }).filter((candidate) => {
      if (!q) return true
      return [candidate.displayName, candidate.username || ''].some((value) => value.toLowerCase().includes(q))
    })

    return NextResponse.json({ candidates })
  } catch (error) {
    console.error('Error listing dm candidates:', error)
    return jsonError('Internal server error', 500)
  }
}
