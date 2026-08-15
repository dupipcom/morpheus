import { useAuth, useOrganizationList } from '@clerk/clerk-react'
import { useMemo } from 'react'

/**
 * Members of the internal Clerk organization (slug `dupip`) always get
 * premium features, regardless of their subscription plan.
 *
 * Every premium feature flag below should short-circuit on `isPremium`
 * before checking the Clerk subscription feature, e.g.:
 *   const isFooEnabled = isPremium || has({ feature: 'foo' })
 */
const INTERNAL_ORG_SLUG = 'dupip'

/**
 * Hook for checking feature flags based on user authentication and permissions
 */
export function useFeatureFlag() {
  const auth = useAuth()
  const { isLoaded, isSignedIn, has } = auth
  const { isLoaded: isMembershipsLoaded, userMemberships } = useOrganizationList({
    userMemberships: true
  })

  const isPremium = useMemo(() => {
    if (!isLoaded || !isSignedIn || !isMembershipsLoaded) return false

    // Membership check, not active-org: works even when the user is using the
    // app with another (or no) organization active.
    return (
      userMemberships?.data.some(
        (membership) => membership.organization.slug === INTERNAL_ORG_SLUG
      ) ?? false
    )
  }, [isLoaded, isSignedIn, isMembershipsLoaded, userMemberships])

  const isAgentChatEnabled = useMemo(() => {
    // Wait for auth to load
    if (!isLoaded) return false

    // Check if user is signed in
    if (!isSignedIn) return false

    // Internal org members are always premium; otherwise require the
    // `ai_assistant` feature from the user's Clerk subscription plan.
    return isPremium || has({ feature: 'ai_assistant' })
  }, [isLoaded, isSignedIn, has, isPremium])

  const isVirtualNumberEnabled = useMemo(() => {
    // Wait for auth to load
    if (!isLoaded) return false

    // Check if user is signed in
    if (!isSignedIn) return false

    // Internal org members are always premium; otherwise require the
    // `virtual_number` feature from the user's Clerk subscription plan.
    return isPremium || has({ feature: 'virtual_number' })
  }, [isLoaded, isSignedIn, has, isPremium])

  return {
    isAgentChatEnabled,
    isVirtualNumberEnabled,
    isPremium,
    isLoaded,
    isSignedIn
  }
}
