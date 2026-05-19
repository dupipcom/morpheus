import * as Ably from 'ably'
import { logger } from '@/lib/logger'

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
        logger('chat_realtime_warning', stateChange.reason)
      }
    })
  } catch (error) {
    logger('chat_realtime_error', error)
    client = null
  }

  return client
}
