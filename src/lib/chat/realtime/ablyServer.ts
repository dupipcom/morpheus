import * as Ably from 'ably'

let client: Ably.Rest | null = null

export function getAblyServerClient() {
  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return null

  if (!client) {
    client = new Ably.Rest({ key: apiKey })
  }

  return client
}

export async function createAblyTokenRequest(
  clientId: string,
  capability: Record<string, string[]>,
) {
  const ably = getAblyServerClient()
  if (!ably) {
    throw new Error('Ably is not configured')
  }

  return ably.auth.createTokenRequest({
    clientId,
    capability: JSON.stringify(capability),
  })
}

export async function publishAblyEvent(channelName: string, eventName: string, data: unknown) {
  const ably = getAblyServerClient()
  if (!ably) return
  await ably.channels.get(channelName).publish(eventName, data)
}
