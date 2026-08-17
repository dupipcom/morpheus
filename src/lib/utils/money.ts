/**
 * Money kit (Phase 6)
 *
 * Every persisted DPIP amount and every arithmetic operation is in INTEGER
 * MINOR UNITS (1 DPIP = 100 units). Prisma-on-Mongo has no Decimal, and Float
 * balances drift under $inc and break { gte: amount } comparisons, so no
 * monetary value is ever stored as a float. Conversion happens only at the
 * API/UI boundary. `Int` tops out at ~21.4 M DPIP per row; move to BigInt if
 * that ever matters (deliberate decision, see docs/plans/phase-06).
 */

/** DPIP (decimal) → integer minor units, rounded (boundary parsing only). */
export function toMinor(dpip: number): number {
  return Math.round(dpip * 100)
}

/** Integer minor units → DPIP (decimal). */
export function fromMinor(minor: number): number {
  return minor / 100
}

/** Locale-aware DPIP display string from minor units. */
export function formatDpip(minor: number, locale?: string): string {
  const amount = fromMinor(minor)
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

/** Throws unless the amount is a positive integer number of minor units. */
export function assertPositiveMinor(minor: number): void {
  if (!Number.isInteger(minor) || minor <= 0) {
    throw new Error('Amount must be a positive integer number of minor units')
  }
}

/** Validate and clamp a raw API amount (number) into minor units. */
export function parseMinor(amount: unknown): number {
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number')
  }
  const minor = toMinor(amount)
  if (minor < 1) {
    throw new Error('Amount is too small (minimum 0.01 DPIP)')
  }
  return minor
}
