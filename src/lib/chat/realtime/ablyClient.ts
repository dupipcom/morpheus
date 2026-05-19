import * as Ably from 'ably'

let client: Ably.Realtime | null = null

export function getAblyRealtimeClient() {
  if (typeof window === 'undefined') return null
  if (client) return client

  client = new Ably.Realtime({
    authUrl: '/api/v1/chat/token',
    authMethod: 'POST',
  })

  return client
}
