'use client'

import { useState } from 'react'
import { SignInButton, useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Public invite acceptance page for chat org invites.
 * Users must be signed in before accepting, and successful acceptance redirects them into chat.
 */
export default function ChatInviteAcceptPage({ params }: { params: Promise<{ locale: string; inviteId: string }> }) {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const [isAccepting, setIsAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const acceptInvite = async () => {
    setIsAccepting(true)
    setError(null)

    try {
      const { inviteId, locale } = await params
      const response = await fetch(`/api/v1/chat/invites/${inviteId}/accept`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({ error: 'Failed to accept invite' }))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to accept invite')
      }

      router.push(`/${locale}/app/chat`)
      router.refresh()
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Failed to accept invite')
    } finally {
      setIsAccepting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-210px)] w-full max-w-2xl flex-col px-4 py-12 md:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Join org chat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Accept this invite to join the organization chat space and start participating in channels.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {isSignedIn ? (
            <Button onClick={() => void acceptInvite()} disabled={isAccepting}>
              {isAccepting ? 'Accepting…' : 'Accept invite'}
            </Button>
          ) : (
            <SignInButton>
              <Button>Sign in to accept</Button>
            </SignInButton>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
