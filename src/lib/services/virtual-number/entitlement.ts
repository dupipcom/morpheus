import 'server-only'

import { auth, clerkClient } from '@clerk/nextjs/server'

import {
  claimsAllowVirtualNumber,
  getVirtualNumberQuota,
  MAX_VIRTUAL_NUMBER_QUOTA
} from './helpers'

/**
 * Server-side entitlement check for the `virtual_number` premium feature.
 *
 * Client gating via `useFeatureFlag` is the primary mechanism (parity with
 * `ai_assistant`). This helper is a contained best-effort server gate that
 * mirrors the client logic: sessionClaims plan feature first, then internal
 * org membership (slug `dupip`). It fails closed — any error is logged and
 * the request is denied.
 *
 * Quota comes from the Clerk plan slug (`dupip_pro`/`dupip_ultra`/`dupip_max`
 * → 1/3/5 numbers). Entitled users with an unknown plan slug get quota 0
 * (fail closed); internal org members get the max quota.
 */

const INTERNAL_ORG_SLUG = 'dupip'

export interface VirtualNumberEntitlement {
  entitled: boolean
  quota: number
}

export async function getVirtualNumberEntitlement(
  clerkUserId: string
): Promise<VirtualNumberEntitlement> {
  try {
    const { sessionClaims } = await auth()
    if (claimsAllowVirtualNumber(sessionClaims)) {
      return { entitled: true, quota: getVirtualNumberQuota(sessionClaims) }
    }

    const client = await clerkClient()
    const memberships = await client.users.getOrganizationMembershipList({
      userId: clerkUserId
    })

    if (
      memberships.data.some((membership) => membership.organization.slug === INTERNAL_ORG_SLUG)
    ) {
      return { entitled: true, quota: MAX_VIRTUAL_NUMBER_QUOTA }
    }
    return { entitled: false, quota: 0 }
  } catch (error) {
    console.error('[virtual-number] entitlement check failed; denying:', error)
    return { entitled: false, quota: 0 }
  }
}

export async function hasVirtualNumberEntitlement(clerkUserId: string): Promise<boolean> {
  return (await getVirtualNumberEntitlement(clerkUserId)).entitled
}
