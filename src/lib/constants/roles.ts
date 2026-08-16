/**
 * Predefined delegation relationship roles.
 * Each key maps to a seeded Role document (see src/migrations/0017-seed-roles.js)
 * and to a translation under `roles.<KEY>` in src/locales/*.json.
 */
export const ROLE_KEYS = [
  'DOCTOR',
  'TUTOR',
  'MENTOR',
  'TEACHER',
  'GUIDE',
  'ASSISTANT',
  'FRIEND',
  'CLOSE_FRIEND',
  'LAWYER',
  'SOLICITOR',
  'FAMILY',
  'HOUSEHOLD',
  'THERAPIST'
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value)
}
