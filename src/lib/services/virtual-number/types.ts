/**
 * Virtual Number Service Types
 * Premium Telnyx virtual phone numbers (Clerk feature `virtual_number`)
 */

export interface VirtualNumberAssignment {
  phoneNumber: string
  provider: string
  createdAt: string
  updatedAt: string
}

export interface AvailableVirtualNumber {
  id: string
  phoneNumber: string
  friendlyName: string | null
}

export type VirtualNumberErrorCode =
  | 'E164_INVALID'
  | 'NUMBER_NOT_FOUND'
  | 'NUMBER_TAKEN'
  | 'TELNYX_UNAVAILABLE'

/**
 * Typed service error; API routes map `code` to an HTTP status.
 */
export class VirtualNumberError extends Error {
  constructor(
    public readonly code: VirtualNumberErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'VirtualNumberError'
  }
}
