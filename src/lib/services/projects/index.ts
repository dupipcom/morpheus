/**
 * Project Service Layer
 * Public container between users/orgs and lists (Phase 5, USER-owned).
 */

export {
  generateProjectUsername,
  isUsernameAvailable,
  createProject,
  updateProject,
  getPublicProject,
  listPublicProjects,
  listProjectsForUser,
  assertProjectCollaborator
} from './projectService'

export type {
  CreateProjectInput,
  UpdateProjectInput,
  PublicProjectCard
} from './types'
