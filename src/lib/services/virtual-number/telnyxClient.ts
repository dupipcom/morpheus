import 'server-only'

import { mapTelnyxPhoneNumber } from './helpers'
import type { TelnyxPhoneNumber } from './helpers'

/**
 * Telnyx API client (server-only)
 * Lists the phone numbers owned by the Telnyx account.
 */

const TELNYX_API_BASE = 'https://api.telnyx.com/v2'
const PAGE_SIZE = 250
const MAX_PAGES = 5

const getTelnyxApiKey = (): string => {
  const apiKey = process.env.TELNYX_API_KEY
  if (!apiKey) {
    throw new Error('TELNYX_API_KEY environment variable is required')
  }
  return apiKey
}

/**
 * List all phone numbers owned by the Telnyx account (JSON:API pagination).
 * Truncation is never silent: when the account holds more numbers than
 * MAX_PAGES can carry, a warning is logged.
 */
export async function listPhoneNumbers(): Promise<TelnyxPhoneNumber[]> {
  const apiKey = getTelnyxApiKey()
  const numbers: TelnyxPhoneNumber[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${TELNYX_API_BASE}/phone_numbers?page%5Bnumber%5D=${page}&page%5Bsize%5D=${PAGE_SIZE}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Telnyx list phone numbers failed: ${response.status} ${errorText}`)
    }

    const payload: {
      data?: unknown
      meta?: { page_number?: unknown; total_pages?: unknown }
    } = await response.json()

    if (!Array.isArray(payload.data)) break

    for (const raw of payload.data) {
      const mapped = mapTelnyxPhoneNumber(raw)
      if (mapped) numbers.push(mapped)
    }

    const totalPages =
      typeof payload.meta?.total_pages === 'number' ? payload.meta.total_pages : page
    if (totalPages > MAX_PAGES) {
      console.warn(`[telnyx] phone number list truncated at ${MAX_PAGES} of ${totalPages} pages`)
    }
    if (page >= totalPages) break
  }

  return numbers
}
