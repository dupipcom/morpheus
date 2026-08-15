/**
 * Virtual Number Service
 * Associates a Telnyx phone number with a Dupip account.
 * One number per user (`VirtualNumber.userId` unique); a number can be
 * claimed by at most one user (`VirtualNumber.phoneNumber` unique) so that
 * inbound SMS can be routed to the right account later.
 */

import prisma from '@/lib/prisma'

import { filterAvailableNumbers, isMessagingCapable, isValidE164 } from './helpers'
import { listPhoneNumbers } from './telnyxClient'
import { VirtualNumberError } from './types'
import type { AvailableVirtualNumber, VirtualNumberAssignment } from './types'

/**
 * Get the virtual number currently assigned to the user (null if none)
 */
export async function getAssignedNumber(userId: string): Promise<VirtualNumberAssignment | null> {
  const assignment = await prisma.virtualNumber.findUnique({ where: { userId } })
  if (!assignment) return null

  return {
    phoneNumber: assignment.phoneNumber,
    messagingProfileId: assignment.messagingProfileId,
    provider: assignment.provider,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString()
  }
}

/**
 * Telnyx numbers available for assignment: purchased, messaging-capable,
 * and not claimed by any Dupip user.
 */
export async function getAvailableNumbers(): Promise<AvailableVirtualNumber[]> {
  const [telnyxNumbers, assigned] = await Promise.all([
    listPhoneNumbers(),
    prisma.virtualNumber.findMany({ select: { phoneNumber: true } })
  ])

  return filterAvailableNumbers(
    telnyxNumbers,
    new Set(assigned.map((entry) => entry.phoneNumber))
  )
}

/**
 * Assign a Telnyx number to the user, or clear the assignment (null).
 * Throws VirtualNumberError for expected failures.
 */
export async function assignNumber(
  userId: string,
  phoneNumber: string | null
): Promise<VirtualNumberAssignment | null> {
  if (phoneNumber === null) {
    await prisma.virtualNumber.deleteMany({ where: { userId } })
    return null
  }

  if (!isValidE164(phoneNumber)) {
    throw new VirtualNumberError('E164_INVALID', 'Invalid phone number format')
  }

  let telnyxNumbers
  try {
    telnyxNumbers = await listPhoneNumbers()
  } catch (error) {
    console.error('[virtual-number] failed to list Telnyx phone numbers:', error)
    throw new VirtualNumberError('TELNYX_UNAVAILABLE', 'Telnyx is unavailable')
  }

  const match = telnyxNumbers.find((number) => number.phoneNumber === phoneNumber)
  if (!match || !isMessagingCapable(match)) {
    throw new VirtualNumberError('NUMBER_NOT_FOUND', 'Number not found in Telnyx account')
  }

  try {
    const assignment = await prisma.virtualNumber.upsert({
      where: { userId },
      create: { userId, phoneNumber, messagingProfileId: match.messagingProfileId },
      update: { phoneNumber, messagingProfileId: match.messagingProfileId }
    })

    return {
      phoneNumber: assignment.phoneNumber,
      messagingProfileId: assignment.messagingProfileId,
      provider: assignment.provider,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString()
    }
  } catch (error) {
    // P2002: phoneNumber unique violation — another user claimed it concurrently
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new VirtualNumberError('NUMBER_TAKEN', 'Number already assigned to another user')
    }
    throw error
  }
}
