/**
 * Project Service Layer
 * Public container between users/orgs and lists (Phase 5, USER-owned).
 */

export {
  generateProjectUsername,
  createProject,
  updateProject,
  getPublicProject,
  listPublicProjects
} from './projectService'

export type {
  CreateProjectInput,
  UpdateProjectInput,
  PublicProjectCard
} from './types'
