export interface ChatInviteStateInput {
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
  usedCount: number
  maxUses?: number | null
  expiresAt?: Date | null
}

/**
 * Determine whether a chat invite is still usable by checking status, expiration, and max-use limits.
 *
 * @param invite The invite record fields needed to validate activity.
 * @param now Optional timestamp used for expiration comparisons.
 */
export function isChatInviteActive(invite: ChatInviteStateInput, now = new Date()) {
  if (invite.status !== 'ACTIVE') return false
  if (invite.expiresAt && invite.expiresAt < now) return false
  if (invite.maxUses !== null && invite.maxUses !== undefined && invite.usedCount >= invite.maxUses) return false
  return true
}

/**
 * Build the localized public invite acceptance URL for a chat invite token.
 * Trailing slashes in the provided base URL are removed before composing the final link.
 *
 * @param baseUrl Application base URL used for the absolute invite link.
 * @param locale Locale segment to include in the public invite path.
 * @param inviteToken Token embedded in the invite acceptance URL.
 */
export function buildChatInviteUrl(baseUrl: string, locale: string, inviteToken: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')
  return `${normalizedBaseUrl}/${locale}/chat/invites/${inviteToken}`
}
