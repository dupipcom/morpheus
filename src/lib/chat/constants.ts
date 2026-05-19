export const CHAT_POLL_INTERVAL_MS = 30_000
export const CHAT_DELETED_MESSAGE_MARKER = '__CHAT_MESSAGE_DELETED__'

export function getChatAppBaseUrl() {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_APP_URL || window.location.origin
  }

  return process.env.NEXT_PUBLIC_APP_URL || ''
}
