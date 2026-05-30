import { useAuth } from '@clerk/clerk-react'
import { useMemo } from 'react'

/**
 * Hook for checking feature flags based on user authentication and permissions
 */
export function useFeatureFlag() {
  const auth = useAuth()
  const { isLoaded, isSignedIn, has } = auth

  const isAgentChatEnabled = useMemo(() => {
    // Wait for auth to load
    if (!isLoaded) return false

    // Check if user is signed in
    if (!isSignedIn) return false

    // Check if user has the specific subscription plan
    return has({ feature: 'ai_assistant' })
  }, [isLoaded, isSignedIn, has])

  return {
    isAgentChatEnabled,
    isLoaded,
    isSignedIn
  }
}
