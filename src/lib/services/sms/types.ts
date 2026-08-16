/**
 * SMS Service Types
 * Telnyx SMS conversations and messages (premium feature `virtual_number`)
 */

export type SmsDirectionValue = 'INBOUND' | 'OUTBOUND'
export type SmsMessageStatusValue = 'SENT' | 'DELIVERED' | 'FAILED'

export interface SmsMessageSummary {
  id: string
  conversationId: string
  direction: SmsDirectionValue
  fromPhoneNumber: string
  toPhoneNumber: string
  text: string
  status: SmsMessageStatusValue | null
  createdAt: string
}

export interface SmsConversationSummary {
  id: string
  counterpartPhoneNumber: string
  lastMessageAt: string | null
  unreadCount: number
  lastMessagePreview: string | null
}

export type SmsErrorCode =
  | 'CONVERSATION_NOT_FOUND'
  | 'FORBIDDEN'
  | 'MESSAGE_CONTENT_REQUIRED'
  | 'MESSAGE_TOO_LONG'
  | 'NO_VIRTUAL_NUMBER'
  | 'TELNYX_SEND_FAILED'

/**
 * Typed service error; API routes map `code` to an HTTP status.
 */
export class SmsError extends Error {
  constructor(
    public readonly code: SmsErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'SmsError'
  }
}
