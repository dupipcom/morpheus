/**
 * Caller-ID → Dupip user resolution (phase 12).
 *
 * Lookup order (per product decision):
 *   1. Telnyx VirtualNumber ownership (users who own a Dupip voice/SMS number)
 *   2. Clerk-verified phone numbers (requires phone verification enabled on
 *      the Clerk instance — not yet activated; returns unknown until then)
 *
 * Phone delegations (/app/feel third-party tab) are also collected: the same
 * number may be delegated by several Dupip users, so the grant is chosen PER
 * TARGET downstream (agentTarget fixes the target on a call) — see
 * resolvePhoneDelegationForTarget.
 *
 * Only PUBLIC-visible profile fields are used for the caller's display name —
 * the greeting must never leak private profile data to the person on the line.
 */

import 'server-only'

import prisma from '@/lib/prisma'
import { clerkClient } from '@clerk/nextjs/server'
import { extractProfileData } from '@/lib/services/visibility'
import { filterProfileFields } from '@/lib/utils/profileUtils'
import type { NoteVisibility } from '@/generated/prisma/client'
import type { CallerIdentity } from './types'

export interface PhoneDelegationGrant {
  userId: string
  label: string | null
  scopes: NoteVisibility[]
  scope: NoteVisibility
}

export interface CallerResolution {
  /** Internal Dupip user id of the caller, when known */
  callerUserId: string | null
  identity: CallerIdentity
  /** Grants where some Dupip user delegated THIS caller's number */
  phoneDelegations: PhoneDelegationGrant[]
}

/** Pick the grant matching the call's target user, if any. */
export function resolvePhoneDelegationForTarget(
  grants: PhoneDelegationGrant[],
  targetUserId: string
): PhoneDelegationGrant | null {
  return grants.find((g) => g.userId === targetUserId) ?? null
}

const NO_RELATION = { isOwner: false, isFriend: false, isCloseFriend: false }

export async function resolveCallerByPhone(input: {
  phone: string
  verified: boolean
}): Promise<CallerResolution> {
  const phone = input.phone.trim()

  const unknown = (phoneDelegations: PhoneDelegationGrant[] = []): CallerResolution => ({
    callerUserId: null,
    identity: {
      known: false,
      accessLevel: 'UNKNOWN',
      relationship: 'none',
      verified: input.verified
    },
    phoneDelegations
  })

  if (!phone) return unknown()

  // 0) Phone-delegation grants (collected regardless of the paths below —
  //    a number can be both user-owned and delegated by other users)
  const phoneDelegations = await prisma.phoneDelegation.findMany({
    where: { phoneNumber: phone },
    select: { userId: true, label: true, scopes: true, scope: true }
  })

  // 1) Telnyx virtual number owned by a Dupip user
  const virtualNumber = await prisma.virtualNumber.findUnique({
    where: { phoneNumber: phone },
    select: { userId: true }
  })
  if (virtualNumber) {
    const identity = await buildIdentity(virtualNumber.userId, input.verified)
    if (identity) {
      return { callerUserId: virtualNumber.userId, identity, phoneDelegations }
    }
  }

  // 2) Clerk-verified phone numbers
  try {
    const clerkUsers = await (await clerkClient()).users.getUserList({ phoneNumber: [phone], limit: 1 })
    const clerkUser = clerkUsers.data?.[0]
    const phoneRecord = (clerkUser?.phoneNumbers ?? []).find((p) => p.phoneNumber === phone)
    if (clerkUser && phoneRecord && phoneRecord.verification?.status === 'verified') {
      const user = await prisma.user.findUnique({
        where: { userId: clerkUser.id },
        select: { id: true }
      })
      if (user) {
        const identity = await buildIdentity(user.id, input.verified)
        if (identity) {
          return { callerUserId: user.id, identity, phoneDelegations }
        }
      }
    }
  } catch {
    // Clerk lookups fail on instances without the API — treat as unknown caller
  }

  return unknown(phoneDelegations)
}

async function buildIdentity(
  userId: string,
  verified: boolean
): Promise<CallerIdentity | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { data: true }
  })
  const profileData = profile
    ? extractProfileData(profile.data as Record<string, unknown>)
    : null
  const publicProfile = profileData ? filterProfileFields(profileData, NO_RELATION) : null

  const name =
    [publicProfile?.firstName, publicProfile?.lastName].filter(Boolean).join(' ') ||
    publicProfile?.userName ||
    undefined

  return {
    known: true,
    userId,
    name: name || undefined,
    username: publicProfile?.userName || undefined,
    avatarUrl:
      typeof publicProfile?.profilePicture === 'string' && publicProfile.profilePicture
        ? publicProfile.profilePicture
        : undefined,
    accessLevel: 'UNKNOWN', // relative to the target user — computed by queryUserData
    relationship: 'none',
    verified
  }
}
