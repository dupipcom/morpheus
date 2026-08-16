/**
 * SMS pure helpers
 * No side effects, no env/db/server-only imports — safe to unit test.
 */

import type { SmsMessageStatusValue } from './types'

// Max concatenated SMS text length (Telnyx splits long messages automatically)
export const SMS_MAX_TEXT_LENGTH = 1600

export interface InboundSmsInput {
  telnyxMessageId: string
  fromPhoneNumber: string
  toPhoneNumber: string
  text: string
  type: string
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

/**
 * Map a Telnyx `message.received` payload to a store input.
 * Returns null when required fields are missing (event is skipped).
 * Media-only MMS has `text: null` — stored as empty string.
 */
export function mapInboundSmsPayload(raw: unknown): InboundSmsInput | null {
  const record = asRecord(raw)
  if (!record) return null

  const telnyxMessageId = asString(record.id)
  if (!telnyxMessageId) return null

  const from = asRecord(record.from)
  const fromPhoneNumber = from && asString(from.phone_number)
  if (!fromPhoneNumber) return null

  const toEntries = Array.isArray(record.to) ? record.to : null
  const firstTo = toEntries && toEntries.length > 0 ? asRecord(toEntries[0]) : null
  const toPhoneNumber = firstTo && asString(firstTo.phone_number)
  if (!toPhoneNumber) return null

  return {
    telnyxMessageId,
    fromPhoneNumber,
    toPhoneNumber,
    text: asString(record.text) ?? '',
    type: asString(record.type) ?? 'SMS'
  }
}

const SENT_STATUSES = new Set(['queued', 'sending', 'sent', 'delivery_unconfirmed'])
const FAILED_STATUSES = new Set(['sending_failed', 'delivery_failed', 'expired'])

/**
 * Collapse a Telnyx outbound `to[].status` value into the stored enum.
 * Unknown statuses map to null (no update applied).
 */
export function mapOutboundSmsStatus(rawStatus: unknown): SmsMessageStatusValue | null {
  if (typeof rawStatus !== 'string') return null
  if (rawStatus === 'delivered') return 'DELIVERED'
  if (SENT_STATUSES.has(rawStatus)) return 'SENT'
  if (FAILED_STATUSES.has(rawStatus)) return 'FAILED'
  return null
}

/**
 * Terminal guard for outbound delivery status: DELIVERED and FAILED are
 * final — out-of-order webhooks (e.g. message.sent after message.finalized)
 * must never regress them.
 */
export function shouldApplyOutboundStatus(
  current: SmsMessageStatusValue | null,
  incoming: SmsMessageStatusValue
): boolean {
  if (current === 'DELIVERED' || current === 'FAILED') return false
  if (incoming === 'DELIVERED' || incoming === 'FAILED') return true
  return current !== incoming
}
