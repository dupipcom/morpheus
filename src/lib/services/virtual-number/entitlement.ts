import 'server-only'

import { auth, clerkClient } from '@clerk/nextjs/server'

import { claimsAllowVirtualNumber } from './helpers'

/**
 * Server-side entitlement check for the `virtual_number` premium feature.
 *
 * Client gating via `useFeatureFlag` is the primary mechanism (parity with
 * `ai_assistant`). This helper is a contained best-effort server gate that
 * mirrors the client logic: sessionClaims plan feature first, then internal
 * org membership (slug `dupip`). It fails closed — any error is logged and
 * the request is denied.
 */

const INTERNAL_ORG_SLUG = 'dupip'

export async function hasVirtualNumberEntitlement(clerkUserId: string): Promise<boolean> {
  try {
    const { sessionClaims } = await auth()
    if (claimsAllowVirtualNumber(sessionClaims)) return true

    const client = await clerkClient()
    const memberships = await client.users.getOrganizationMembershipList({
      userId: clerkUserId
    })

    return memberships.data.some(
      (membership) => membership.organization.slug === INTERNAL_ORG_SLUG
    )
  } catch (error) {
    console.error('[virtual-number] entitlement check failed; denying:', error)
    return false
  }
}
