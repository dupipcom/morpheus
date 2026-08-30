import 'server-only'

import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { getDelegationScopes, resolveEffectiveDelegationScope } from '@/lib/utils/delegation'
import { isValidE164 } from '@/lib/services/virtual-number/helpers'
import { ApiError } from '@/lib/services/errors'
import type { NoteVisibility } from '@/generated/prisma/client'
import type { PhoneDelegationDTO, UpsertPhoneDelegationInput } from './types'

const MAX_LABEL_LENGTH = 80

/** Strip common phone separators before validation/storage. */
export function normalizePhoneNumber(input: string): string {
  return input.replace(/[\s().-]/g, '')
}

export async function listPhoneDelegations(userId: string): Promise<PhoneDelegationDTO[]> {
  const rows = await prisma.phoneDelegation.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, phoneNumber: true, label: true, scopes: true, createdAt: true }
  })

  return rows.map((row) => ({
    id: row.id,
    phoneNumber: row.phoneNumber,
    label: row.label,
    scopes: row.scopes as NoteVisibility[],
    createdAt: row.createdAt.toISOString()
  }))
}

export async function upsertPhoneDelegation(
  userId: string,
  input: UpsertPhoneDelegationInput
): Promise<PhoneDelegationDTO> {
  const phoneNumber = normalizePhoneNumber((input.phoneNumber ?? '').trim())
  if (!isValidE164(phoneNumber)) {
    throw new ApiError(400, 'PHONE_INVALID', 'phoneNumber must be a valid E.164 number')
  }

  const scopes = getDelegationScopes(input.scopes, input.scopes?.[0])
  const effectiveScope = resolveEffectiveDelegationScope(scopes)
  if (!effectiveScope) {
    throw new ApiError(400, 'SCOPE_INVALID', 'Provide at least one valid delegation scope')
  }

  const rawLabel = (input.label ?? '').trim()
  const label = rawLabel ? sanitizeText(rawLabel).slice(0, MAX_LABEL_LENGTH) : null

  const row = await prisma.phoneDelegation.upsert({
    where: { userId_phoneNumber: { userId, phoneNumber } },
    update: { label, scopes, scope: effectiveScope },
    create: { userId, phoneNumber, label, scopes, scope: effectiveScope }
  })

  return {
    id: row.id,
    phoneNumber: row.phoneNumber,
    label: row.label,
    scopes: row.scopes as NoteVisibility[],
    createdAt: row.createdAt.toISOString()
  }
}

/** Owner-only delete. Returns false when the row did not exist. */
export async function deletePhoneDelegation(userId: string, id: string): Promise<boolean> {
  const result = await prisma.phoneDelegation.deleteMany({
    where: { id, userId }
  })
  return result.count > 0
}
