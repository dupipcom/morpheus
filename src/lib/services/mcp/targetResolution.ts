/**
 * Resolution of "who is the person the caller is asking about" (phase 12).
 *
 * Priority:
 *   1. The owner of the called VirtualNumber (telnyx_agent_target) — calling a
 *      friend's number means asking about that friend.
 *   2. A unique match of the free-text descriptor: @username → email → phone →
 *      first name. Ambiguous matches (2+) resolve to null — the assistant must
 *      ask the caller to disambiguate.
 */

import 'server-only'

import prisma from '@/lib/prisma'
import { extractProfileData } from '@/lib/services/visibility'
import { filterProfileFields } from '@/lib/utils/profileUtils'
import type { TargetUserResolution } from './types'

const NO_RELATION = { isOwner: false, isFriend: false, isCloseFriend: false }

export async function resolveTargetUser(
  descriptor: string | null | undefined,
  agentTarget: string | null | undefined
): Promise<TargetUserResolution | null> {
  // 1) The number the caller dialed belongs to a Dupip user → that user
  if (agentTarget) {
    const virtualNumber = await prisma.virtualNumber.findUnique({
      where: { phoneNumber: agentTarget },
      select: { userId: true }
    })
    if (virtualNumber) {
      const resolution = await buildResolution(virtualNumber.userId)
      if (resolution) return resolution
    }
  }

  const value = (descriptor ?? '').trim()
  if (!value) return null

  // 2a) @username / username
  const username = value.replace(/^@/, '')
  if (username) {
    const profile = await prisma.profile.findUnique({
      where: { username },
      select: { userId: true }
    })
    if (profile) {
      const resolution = await buildResolution(profile.userId)
      if (resolution) return resolution
    }
  }

  // 2b) email
  const emailCandidates = await prisma.user.findMany({
    where: { email: value.toLowerCase() },
    select: { id: true },
    take: 2
  })
  if (emailCandidates.length === 1) return buildResolution(emailCandidates[0].id)

  // 2c) phone number (virtual numbers or Clerk-verified)
  const phoneCandidates = await prisma.virtualNumber.findMany({
    where: { phoneNumber: value },
    select: { userId: true },
    take: 2
  })
  if (phoneCandidates.length === 1) return buildResolution(phoneCandidates[0].userId)

  // 2d) first name — must be a unique match (ProfileData is an embedded
  //     composite, so this uses Prisma's composite `is` filter, not JSON path)
  const nameCandidates = await prisma.profile.findMany({
    where: { data: { is: { firstName: { is: { value: { equals: value } } } } } },
    select: { userId: true },
    take: 2
  })
  if (nameCandidates.length === 1) return buildResolution(nameCandidates[0].userId)

  return null
}

async function buildResolution(userId: string): Promise<TargetUserResolution | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return null

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { data: true }
  })
  const profileData = profile
    ? extractProfileData(profile.data as Record<string, unknown>)
    : null
  const publicProfile = profileData ? filterProfileFields(profileData, NO_RELATION) : null

  return {
    userId: user.id,
    name:
      [publicProfile?.firstName, publicProfile?.lastName].filter(Boolean).join(' ') ||
      publicProfile?.userName ||
      undefined,
    username: publicProfile?.userName || undefined
  }
}
