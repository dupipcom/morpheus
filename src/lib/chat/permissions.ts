export type ChatRoleValue = 'SUPERUSER' | 'ADMIN' | 'MODERATOR' | 'USER'

export const CHAT_ROLE_ORDER: Record<ChatRoleValue, number> = {
  USER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  SUPERUSER: 3,
}

export function canManageChannels(role: ChatRoleValue | null | undefined) {
  return role === 'ADMIN' || role === 'SUPERUSER'
}

export function canManageInvites(role: ChatRoleValue | null | undefined) {
  return canManageChannels(role)
}

export function canAssignRoles(role: ChatRoleValue | null | undefined) {
  return canManageChannels(role)
}

export function canModerateMessages(role: ChatRoleValue | null | undefined) {
  return role === 'MODERATOR' || role === 'ADMIN' || role === 'SUPERUSER'
}

export function canDeleteMessage(
  role: ChatRoleValue | null | undefined,
  authorUserId: string,
  currentUserId: string,
) {
  if (authorUserId === currentUserId) return true
  return canModerateMessages(role)
}
