import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/services/auth'
import { DELEGATION_SCOPES } from '@/lib/constants/visibility'
import { isRoleKey } from '@/lib/constants/roles'
import type { RoleKey } from '@/lib/constants/roles'
import {
  getDelegationScopes,
  resolveEffectiveDelegationScope
} from '@/lib/utils/delegation'
import {
  buildDupipInvitationDraft,
  isValidEmailIdentifier
} from '@/lib/utils/invitations'

type DelegationScope = typeof DELEGATION_SCOPES[number]

function isDelegationScope(value: string): value is DelegationScope {
  return DELEGATION_SCOPES.includes(value as DelegationScope)
}

// Mood-data access levels for delegations (mirrors the MoodScope enum).
// Privacy-first default: NONE — no mood data unless explicitly granted.
const MOOD_SCOPES = ['ALL_DIMENSIONS', 'AVERAGE_ONLY', 'NONE'] as const
type MoodScopeValue = typeof MOOD_SCOPES[number]

/**
 * Parses body.moodScope. Absent → NONE (privacy-first). Present but invalid
 * → null so the route can reject explicitly (single-select UI, no silent
 * fallback for garbage).
 */
function parseMoodScope(body: unknown): MoodScopeValue | null {
  if (!body || typeof body !== 'object') return 'NONE'
  const raw = (body as Record<string, unknown>).moodScope
  if (raw === undefined || raw === null) return 'NONE'
  const value = String(raw).trim().toUpperCase()
  return MOOD_SCOPES.includes(value as MoodScopeValue) ? (value as MoodScopeValue) : null
}

function parseDelegationScopes(body: unknown): DelegationScope[] {
  // AI_ENABLED is deprecated — new delegations default to DOC_ENABLED.
  if (!body || typeof body !== 'object') {
    return ['DOC_ENABLED']
  }

  const record = body as Record<string, unknown>
  const rawScopes = Array.isArray(record.scopes)
    ? record.scopes
    : record.scope
      ? [record.scope]
      : []

  const scopes = rawScopes
    .map((scope) => String(scope).trim().toUpperCase())
    .filter(isDelegationScope)

  return scopes.length > 0 ? Array.from(new Set(scopes)) : ['DOC_ENABLED']
}

function parseRoleKeys(body: unknown): RoleKey[] {
  if (!body || typeof body !== 'object') {
    return []
  }

  const record = body as Record<string, unknown>
  const rawRoleKeys = Array.isArray(record.roleKeys) ? record.roleKeys : []

  return Array.from(
    new Set(
      rawRoleKeys
        .map((roleKey) => String(roleKey).trim().toUpperCase())
        .filter(isRoleKey)
    )
  )
}

function buildUserSummary(user: {
  id: string
  userId: string | null
  email: string | null
  profiles: Array<{ username: string | null; data: Record<string, { value?: string | null }> | null }>
}) {
  const profile = user.profiles?.[0]
  const data = profile?.data || {}
  const firstName = data.firstName?.value || null
  const lastName = data.lastName?.value || null
  const userName = profile?.username || data.username?.value || null
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  const displayName = fullName || userName || user.email || user.userId || user.id

  return {
    id: user.id,
    userId: user.userId,
    email: user.email,
    userName,
    displayName
  }
}

async function findUserByIdentifier(identifier: string) {
  const normalized = identifier.trim()
  if (!normalized) return null

  const byUser = await prisma.user.findFirst({
    where: {
      OR: [
        { userId: normalized },
        { email: normalized }
      ]
    },
    select: { id: true }
  })

  if (byUser) {
    return prisma.user.findUnique({
      where: { id: byUser.id },
      select: {
        id: true,
        userId: true,
        email: true,
        profiles: {
          select: {
            username: true,
            data: true
          },
          take: 1
        }
      }
    })
  }

  const profileMatch = await prisma.profile.findFirst({
    where: { username: normalized },
    select: { userId: true }
  })

  if (!profileMatch?.userId) return null

  return prisma.user.findUnique({
    where: { id: profileMatch.userId },
    select: {
      id: true,
      userId: true,
      email: true,
      profiles: {
        select: {
          username: true,
          data: true
        },
        take: 1
      }
    }
  })
}

export async function GET() {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const currentUserId = authResult.user!.id

    const [outgoing, incoming] = await Promise.all([
      prisma.delegation.findMany({
        where: { delegatorId: currentUserId },
        orderBy: { createdAt: 'desc' },
        include: {
          delegated: {
            select: {
              id: true,
              userId: true,
              email: true,
              profiles: {
                select: {
                  username: true,
                  data: true
                },
                take: 1
              }
            }
          }
        }
      }),
      prisma.delegation.findMany({
        where: { delegatedId: currentUserId },
        orderBy: { createdAt: 'desc' },
        include: {
          delegator: {
            select: {
              id: true,
              userId: true,
              email: true,
              profiles: {
                select: {
                  username: true,
                  data: true
                },
                take: 1
              }
            }
          }
        }
      })
    ])

    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        friendUsers: {
          select: {
            id: true,
            userId: true,
            email: true,
            profiles: {
              select: {
                username: true,
                data: true
              },
              take: 1
            }
          }
        }
      }
    })

    const friendSuggestions = (currentUser?.friendUsers || []).map((friend) => {
      const summary = buildUserSummary(friend)
      return {
        ...summary,
        identifiers: [summary.userName, summary.email, summary.userId].filter(Boolean)
      }
    })

    // Batch-resolve the Role documents referenced by both delegation sets
    // (|| [] guards: older Mongo docs predate the roleIds field)
    const referencedRoleIds = [...outgoing, ...incoming].flatMap((delegation) => delegation.roleIds || [])
    const roleDocs = referencedRoleIds.length > 0
      ? await prisma.role.findMany({ where: { id: { in: referencedRoleIds } } })
      : []
    const roleKeyById = new Map(roleDocs.map((role) => [role.id, role.key]))

    const resolveRoleKeys = (roleIds: string[] | undefined) =>
      (roleIds || []).map((roleId) => roleKeyById.get(roleId)).filter((key): key is string => Boolean(key))

    return NextResponse.json({
      outgoingDelegations: outgoing.map((delegation) => {
        const scopes = getDelegationScopes(delegation.scopes, delegation.scope)

        return {
          id: delegation.id,
          scope: delegation.scope,
          scopes,
          roles: resolveRoleKeys(delegation.roleIds),
          moodScope: delegation.moodScope,
          createdAt: delegation.createdAt,
          delegatedUser: buildUserSummary(delegation.delegated)
        }
      }),
      incomingDelegations: incoming.map((delegation) => {
        const scopes = getDelegationScopes(delegation.scopes, delegation.scope)

        return {
          id: delegation.id,
          scope: delegation.scope,
          scopes,
          roles: resolveRoleKeys(delegation.roleIds),
          moodScope: delegation.moodScope,
          createdAt: delegation.createdAt,
          delegatorUser: buildUserSummary(delegation.delegator)
        }
      }),
      friendSuggestions
    })
  } catch (error) {
    console.error('Error fetching delegations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const currentUserId = authResult.user!.id
    const body = await request.json()
    const identifier = String(body?.identifier || '').trim()
    const scopes = parseDelegationScopes(body)
    const scope = resolveEffectiveDelegationScope(scopes) || 'AI_ENABLED'
    const roleKeys = parseRoleKeys(body)
    const moodScope = parseMoodScope(body)

    if (!identifier) {
      return NextResponse.json({ error: 'Identifier is required' }, { status: 400 })
    }

    if (!DELEGATION_SCOPES.includes(scope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    }

    if (moodScope === null) {
      return NextResponse.json({ error: 'Invalid moodScope' }, { status: 400 })
    }

    const targetUser = await findUserByIdentifier(identifier)
    if (!targetUser) {
      if (isValidEmailIdentifier(identifier)) {
        const invitation = buildDupipInvitationDraft({
          email: identifier,
          invitedByUserId: authResult.user?.clerkUserId || undefined
        })
        return NextResponse.json(
          {
            invitation,
            delegation: null
          },
          { status: 202 }
        )
      }
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (targetUser.id === currentUserId) {
      return NextResponse.json({ error: 'You cannot delegate to yourself' }, { status: 400 })
    }

    const roleDocs = roleKeys.length > 0
      ? await prisma.role.findMany({ where: { key: { in: roleKeys } } })
      : []
    const roleIds = roleDocs.map((role) => role.id)

    const delegation = await prisma.delegation.upsert({
      where: {
        delegatorId_delegatedId: {
          delegatorId: currentUserId,
          delegatedId: targetUser.id
        }
      },
      update: {
        scope,
        scopes,
        roleIds,
        moodScope
      },
      create: {
        delegatorId: currentUserId,
        delegatedId: targetUser.id,
        scope,
        scopes,
        roleIds,
        moodScope
      }
    })

    return NextResponse.json({
      delegation: {
        id: delegation.id,
        scope: delegation.scope,
        scopes: getDelegationScopes(delegation.scopes, delegation.scope),
        roles: roleDocs.map((role) => role.key),
        moodScope: delegation.moodScope,
        createdAt: delegation.createdAt,
        delegatedUser: buildUserSummary(targetUser)
      }
    })
  } catch (error) {
    console.error('Error creating delegation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const currentUserId = authResult.user!.id
    const body = await request.json()
    const delegationId = body?.delegationId ? String(body.delegationId) : null

    if (!delegationId) {
      return NextResponse.json({ error: 'delegationId is required' }, { status: 400 })
    }

    const result = await prisma.delegation.deleteMany({
      where: {
        delegatorId: currentUserId,
        id: delegationId
      }
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'Delegation not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      deletedCount: result.count
    })
    
  } catch (error) {
    console.error('Error deleting delegation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
