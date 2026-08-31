/**
 * Public professional summary for a user (phase 12.5).
 *
 * GET /api/v1/profile/[userName]/summary
 *
 * Public — the summary is built from strictly PUBLIC material (public profile
 * fields, links, PUBLIC notes) and cached for 30 days (PublicProfileSummary).
 * Consumed by the query_user_public_profile MCP tool for anonymous callers of
 * the Telnyx assistant, and usable by any web client.
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { getPublicProfileSummary } from '@/lib/services/public-profile'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userName: string }> }
) {
  try {
    const { userName } = await params

    const profile = await prisma.profile.findUnique({
      where: { username: userName },
      select: { userId: true }
    })

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 })
    }

    const result = await getPublicProfileSummary(profile.userId)

    return Response.json({ summary: result })
  } catch (error) {
    console.error('Error fetching public profile summary:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
