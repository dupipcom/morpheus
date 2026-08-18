/**
 * Organization Service Layer (Phase 7)
 * Clerk Organizations mirror + membership sync + public org payload.
 */

export {
  generateOrgUsername,
  upsertOrganization,
  upsertMembership,
  syncOrganization,
  markOrphaned,
  removeMembership,
  createOrganization,
  listOrgsForUser,
  getPublicOrg,
  assertOrgManagerRole
} from './orgService'
