interface DupipInvitationDraftParams {
  email: string
  invitedByUserId?: string
}

export function isValidEmailIdentifier(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

export function buildDupipInvitationDraft({
  email,
  invitedByUserId
}: DupipInvitationDraftParams) {
  return {
    email: email.trim().toLowerCase(),
    invitedByUserId: invitedByUserId || null,
    status: 'not_supported_yet',
    message: 'This email is not registered yet. Invitation sending is not supported yet, but an invitation draft is ready for future integration.'
  }
}
