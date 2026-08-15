/**
 * Virtual Number Service
 * Associates Telnyx phone numbers with a Dupip account.
 * Users can hold several numbers, bounded by their Clerk plan quota
 * (dupip_pro/ultra/max → 1/3/5); a number can be claimed by at most one
 * user (`VirtualNumber.phoneNumber` unique) so that inbound SMS can be
 * routed to the right account later.
 */

import prisma from '@/lib/prisma'

import { filterAvailableNumbers, isMessagingCapable, isWithinQuota, isValidE164 } from './helpers'
import { listPhoneNumbers } from './telnyxClient'
import { VirtualNumberError } from './types'
import type { AvailableVirtualNumber, VirtualNumberAssignment } from './types'

interface VirtualNumberRecord {
  phoneNumber: string
  messagingProfileId: string | null
  provider: string
  createdAt: Date
  updatedAt: Date
}

function toVirtualNumberAssignment(record: VirtualNumberRecord): VirtualNumberAssignment {
  return {
    phoneNumber: record.phoneNumber,
    messagingProfileId: record.messagingProfileId,
    provider: record.provider,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  }
}

/**
 * Get the virtual numbers currently assigned to the user (oldest first)
 */
export async function getAssignedNumbers(userId: string): Promise<VirtualNumberAssignment[]> {
  const assignments = await prisma.virtualNumber.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' }
  })

  return assignments.map(toVirtualNumberAssignment)
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
 * Assign a Telnyx number to the user, or clear all assignments (null).
 * When `quota` is provided, rejects assigns past the plan limit.
 * Throws VirtualNumberError for expected failures.
 */
export async function assignNumber(
  userId: string,
  phoneNumber: string | null,
  options?: { quota?: number }
): Promise<VirtualNumberAssignment | null> {
  if (phoneNumber === null) {
    await prisma.virtualNumber.deleteMany({ where: { userId } })
    return null
  }

  if (!isValidE164(phoneNumber)) {
    throw new VirtualNumberError('E164_INVALID', 'phoneNumber must be a valid E.164 number')
  }

  if (options?.quota !== undefined) {
    const count = await prisma.virtualNumber.count({ where: { userId } })
    if (!isWithinQuota(count, options.quota)) {
      throw new VirtualNumberError('LIMIT_REACHED', 'You have reached your virtual number quota')
    }
  }

  let telnyxNumbers
  try {
    telnyxNumbers = await listPhoneNumbers()
  } catch (error) {
    console.error('[virtual-number] failed to list Telnyx phone numbers:', error)
    throw new VirtualNumberError('TELNYX_UNAVAILABLE', 'Internal server error')
  }

  const match = telnyxNumbers.find((number) => number.phoneNumber === phoneNumber)
  if (!match || !isMessagingCapable(match)) {
    throw new VirtualNumberError('NUMBER_NOT_FOUND', 'Number not found in your Telnyx account')
  }

  try {
    const assignment = await prisma.virtualNumber.create({
      data: { userId, phoneNumber, messagingProfileId: match.messagingProfileId }
    })

    return toVirtualNumberAssignment(assignment)
  } catch (error) {
    // P2002: phoneNumber unique violation — this user already holds it, or
    // another user claimed it concurrently
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new VirtualNumberError('NUMBER_TAKEN', 'This number is already assigned to another user')
    }
    throw error
  }
}

/**
 * Remove one of the user's assigned numbers.
 * Throws NUMBER_NOT_FOUND when the number is not assigned to the user.
 */
export async function unassignNumber(userId: string, phoneNumber: string): Promise<void> {
  const result = await prisma.virtualNumber.deleteMany({ where: { userId, phoneNumber } })
  if (result.count === 0) {
    throw new VirtualNumberError('NUMBER_NOT_FOUND', 'This number is not assigned to you')
  }
}
