import * as Ably from 'ably'

let client: Ably.Realtime | null = null

export function getAblyRealtimeClient() {
  if (typeof window === 'undefined') return null
  if (client) return client

  try {
    client = new Ably.Realtime({
      authUrl: '/api/v1/chat/token',
      authMethod: 'POST',
    })

    client.connection.on((stateChange) => {
      if (stateChange.current === 'failed') {
        console.warn('Chat realtime connection failed', stateChange.reason)
      }
    })
  } catch (error) {
    console.warn('Unable to initialize Ably realtime client', error)
    client = null
  }

  return client
}
