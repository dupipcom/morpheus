export function formatDelegationScope(scope: string | null | undefined): string {
  if (!scope) return ''
  return scope.toLowerCase().replace('_', '-')
}
