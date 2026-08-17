/**
 * Wallet Service (Phase 6)
 *
 * Wallet lifecycle around the off-chain ledger: default wallet at signup,
 * self-healing getOrCreateDefaultWallet for pre-existing users, and recipient
 * resolution across the shared /@ namespace (users today; orgs in Phase 7;
 * projects with the post-Phase-6 donate follow-up).
 *
 * Kaleido address provisioning is lazy and non-blocking: the DB wallet exists
 * immediately with `address: null`; an address is provisioned on demand by the
 * first on-chain-facing action or the reconcile cron. A Kaleido outage can
 * never block signup or a transfer.
 */

import prisma from '@/lib/prisma'
import { ApiError } from '@/lib/services/errors'

/** User-created extra wallets still count against the 5-wallet cap; system kinds don't. */
const USER_WALLET_CAP = 5

/**
 * The user's default wallet — created on first call (self-heal for users who
 * signed up before Phase 6). Idempotent: Clerk webhook retries can call this
 * repeatedly and only ever get one default.
 */
export async function getOrCreateDefaultWallet(userInternalId: string) {
  const existing = await prisma.wallet.findFirst({
    where: { userId: userInternalId, isDefault: true }
  })
  if (existing) return existing

  // Mark the oldest wallet as default when one already exists but wasn't marked
  const oldest = await prisma.wallet.findFirst({
    where: { userId: userInternalId },
    orderBy: { createdAt: 'asc' }
  })
  if (oldest) {
    return prisma.wallet.update({
      where: { id: oldest.id },
      data: { isDefault: true }
    })
  }

  return prisma.wallet.create({
    data: {
      userId: userInternalId,
      name: 'Default',
      kind: 'USER',
      isDefault: true,
      ownerType: 'USER',
      balance: 0,
      pendingBalance: 0,
      address: null
    }
  })
}

/**
 * Count of user-created (USER-kind) wallets — system kinds don't count
 * against the cap.
 */
export async function countUserWallets(userInternalId: string): Promise<number> {
  return prisma.wallet.count({
    where: { userId: userInternalId, kind: 'USER' }
  })
}

export { USER_WALLET_CAP }

/**
 * Resolve a recipient for the transfer UI across the shared /@ namespace.
 * `target` may be a wallet id, an address, or a username handle. Users resolve
 * today; orgs arrive in Phase 7; projects 404 until the donate follow-up.
 */
export async function resolveRecipient(target: string): Promise<{
  walletId: string
  displayName: string
}> {
  const trimmed = target.trim()

  // Direct wallet id
  const byId = await prisma.wallet.findUnique({
    where: { id: trimmed },
    select: { id: true, userId: true }
  })
  if (byId) {
    const owner = await prisma.user.findUnique({
      where: { id: byId.userId },
      select: { profiles: { select: { data: true } } }
    })
    const username = (owner?.profiles?.[0]?.data as { username?: { value?: string } } | undefined)?.username?.value
    return { walletId: byId.id, displayName: username ? `@${username}` : trimmed }
  }

  // Wallet address
  const byAddress = await prisma.wallet.findFirst({
    where: { address: trimmed },
    select: { id: true }
  })
  if (byAddress) {
    return { walletId: byAddress.id, displayName: trimmed }
  }

  // Username handle (shared /@ namespace; projects resolve with the donate
  // follow-up after Phase 6)
  const handle = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  const profile = await prisma.profile.findUnique({
    where: { username: handle },
    select: { userId: true }
  })
  if (profile) {
    const defaultWallet = await getOrCreateDefaultWallet(profile.userId)
    return { walletId: defaultWallet.id, displayName: `@${handle}` }
  }

  // Phase 7: org handles resolve to the org's default wallet (kind ORG)
  const organization = await prisma.organization.findUnique({
    where: { username: handle },
    select: { id: true, name: true }
  })
  if (organization) {
    const orgWallet = await prisma.wallet.findFirst({
      where: { kind: 'ORG', ownerType: 'ORG', orgId: organization.id },
      select: { id: true }
    })
    if (orgWallet) {
      return { walletId: orgWallet.id, displayName: `@${handle} (${organization.name})` }
    }
  }

  throw new ApiError(404, 'NOT_FOUND', 'Recipient not found')
}
