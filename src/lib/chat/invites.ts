export interface ChatInviteStateInput {
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
  usedCount: number
  maxUses?: number | null
  expiresAt?: Date | null
}

export function isChatInviteActive(invite: ChatInviteStateInput, now = new Date()) {
  if (invite.status !== 'ACTIVE') return false
  if (invite.expiresAt && invite.expiresAt.getTime() < now.getTime()) return false
  if (invite.maxUses !== null && invite.maxUses !== undefined && invite.usedCount >= invite.maxUses) return false
  return true
}

export function buildChatInviteUrl(baseUrl: string, locale: string, inviteId: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')
  return `${normalizedBaseUrl}/${locale}/chat/invites/${inviteId}`
}
