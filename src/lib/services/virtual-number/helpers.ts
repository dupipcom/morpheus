/**
 * Virtual Number pure helpers
 * No side effects, no env/db/server-only imports — safe to unit test.
 */

import type { AvailableVirtualNumber } from './types'

export interface TelnyxPhoneNumber {
  id: string
  phoneNumber: string
  friendlyName: string | null
  status: string
  features: string[]
}

// E.164: leading +, country code 1-9, 7-15 digits total
const E164_PATTERN = /^\+[1-9]\d{6,14}$/

/**
 * Validate an E.164-formatted phone number (e.g. +15105550123)
 */
export function isValidE164(phoneNumber: string): boolean {
  return E164_PATTERN.test(phoneNumber)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/**
 * Map a raw Telnyx v2 phone_numbers record to a minimal DTO.
 * Returns null when required fields are missing (record is skipped).
 */
export function mapTelnyxPhoneNumber(raw: unknown): TelnyxPhoneNumber | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>

  const id = asString(record.id)
  const phoneNumber = asString(record.phone_number)
  if (!id || !phoneNumber) return null

  return {
    id,
    phoneNumber,
    friendlyName: asString(record.nickname),
    status: asString(record.status) ?? '',
    features: asStringArray(record.features)
  }
}

/**
 * A number can carry SMS when its features include `sms` or `mms`
 */
export function isMessagingCapable(number: TelnyxPhoneNumber): boolean {
  return number.features.includes('sms') || number.features.includes('mms')
}

/**
 * Purchased, messaging-capable Telnyx numbers that no Dupip user has claimed
 */
export function filterAvailableNumbers(
  numbers: TelnyxPhoneNumber[],
  assignedPhoneNumbers: Set<string>
): AvailableVirtualNumber[] {
  return numbers
    .filter((number) => number.status === 'purchased' && isMessagingCapable(number))
    .filter((number) => !assignedPhoneNumbers.has(number.phoneNumber))
    .map((number) => ({
      id: number.id,
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName
    }))
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Defensively scan Clerk sessionClaims for the `virtual_number` plan feature.
 * Clerk's plan-claim shape varies by version, so several shapes are checked.
 * Never throws; unknown or malformed claims evaluate to false.
 */
export function claimsAllowVirtualNumber(claims: unknown): boolean {
  if (typeof claims !== 'object' || claims === null) return false
  const record = claims as Record<string, unknown>

  const planFeatures = isStringList(record.planFeatures) && record.planFeatures.includes('virtual_number')

  const plan = record.plan
  const planRecord = typeof plan === 'object' && plan !== null ? (plan as Record<string, unknown>) : null
  const nestedPlanFeatures = planRecord !== null && isStringList(planRecord.features) && planRecord.features.includes('virtual_number')

  const topLevelFeatures = isStringList(record.features) && record.features.includes('virtual_number')

  // Dev aid: surface the real claim shape once so the helper can be pinned to it
  if (!planFeatures && !nestedPlanFeatures && !topLevelFeatures && planRecord !== null) {
    console.info('[virtual-number] unrecognized sessionClaims plan shape:', Object.keys(planRecord))
  }

  return planFeatures || nestedPlanFeatures || topLevelFeatures
}
