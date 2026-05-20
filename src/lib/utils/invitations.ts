import isEmail from 'validator/lib/isEmail'

interface DupipInvitationDraftParams {
  email: string
  invitedByUserId?: string
}

export function isValidEmailIdentifier(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return false
  return isEmail(normalized)
}

export function buildDupipInvitationDraft({
  email,
  invitedByUserId
}: DupipInvitationDraftParams) {
  return {
    email: email.trim().toLowerCase(),
    invitedByUserId: invitedByUserId || null,
    status: 'PENDING_SUPPORT',
    message: 'This email is not registered yet. Invitation sending is not supported yet, but an invitation draft is ready for future integration.'
  }
}
