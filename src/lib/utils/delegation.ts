import { DELEGATION_SCOPES } from '@/lib/constants/visibility'

type DelegationScope = typeof DELEGATION_SCOPES[number]

function isDelegationScope(value: string): value is DelegationScope {
  return DELEGATION_SCOPES.includes(value as DelegationScope)
}

export function normalizeDelegationScope(scope: string | null | undefined): string {
  if (!scope) return ''
  return scope.toLowerCase().replace(/_/g, '-')
}

export function getDelegationScopes(
  scopes: string[] | null | undefined,
  fallbackScope?: string | null
): DelegationScope[] {
  const normalizedScopes = (scopes || [])
    .map((scope) => String(scope).trim().toUpperCase())
    .filter(isDelegationScope)

  if (normalizedScopes.length > 0) {
    return Array.from(new Set(normalizedScopes))
  }

  const normalizedFallback = String(fallbackScope || '').trim().toUpperCase()
  return isDelegationScope(normalizedFallback) ? [normalizedFallback] : []
}

export function resolveEffectiveDelegationScope(
  scopes: string[] | null | undefined,
  fallbackScope?: string | null
): DelegationScope | null {
  const normalizedScopes = getDelegationScopes(scopes, fallbackScope)

  if (normalizedScopes.includes('PRIVATE')) return 'PRIVATE'
  if (normalizedScopes.includes('AI_ENABLED')) return 'AI_ENABLED'
  if (normalizedScopes.includes('FRIENDS')) return 'FRIENDS'
  if (normalizedScopes.includes('CLOSE_FRIENDS')) return 'CLOSE_FRIENDS'
  if (normalizedScopes.includes('PUBLIC')) return 'PUBLIC'
  // Narrowest grant: doc notes only (no days — see getAllowedDayVisibilities)
  if (normalizedScopes.includes('DOC_ENABLED')) return 'DOC_ENABLED'

  return null
}

export function normalizeDelegationScopes(
  scopes: string[] | null | undefined,
  fallbackScope?: string | null
): string {
  return getDelegationScopes(scopes, fallbackScope)
    .map((scope) => normalizeDelegationScope(scope))
    .join(', ')
}
