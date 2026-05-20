export function normalizeDelegationScope(scope: string | null | undefined): string {
  if (!scope) return ''
  return scope.toLowerCase().replace(/_/g, '-')
}
