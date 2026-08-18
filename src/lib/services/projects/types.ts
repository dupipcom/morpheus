/**
 * Project Service Types
 * Phase 5: USER-owned public container between users/orgs and lists.
 * Phase 7 adds ownerType/orgId (ORG ownership) — see docs/plans/phase-07-organizations.md.
 */

export interface CreateProjectInput {
  userInternalId: string
  name: string
  bio?: string | null
  photoDocumentId?: string | null
  coverDocumentId?: string | null
  links?: unknown
  supportUrl?: string | null
  collaborators?: string[]
  // Phase 7: org-owned projects (ownerType ORG + orgId)
  ownerType?: string
  orgId?: string | null
}

export interface UpdateProjectInput {
  projectId: string
  name?: string
  bio?: string | null
  photoDocumentId?: string | null
  coverDocumentId?: string | null
  links?: unknown
  supportUrl?: string | null
  spotlight?: boolean
  publicVisible?: boolean
  collaborators?: string[]
}

/** Public card shape used by the discovery feed. */
export interface PublicProjectCard {
  id: string
  name: string
  username: string
  bio: string | null
  photo: string | null
  cover: string | null
  spotlight: boolean
  memberCount: number
  likeCount?: number
}
