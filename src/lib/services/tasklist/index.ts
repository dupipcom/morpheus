/**
 * TaskList Service Layer
 * Centralized exports for all tasklist-related services
 */

// Types (legacy frontend types remain exported until the Do view rebuild lands)
export type {
  Task,
  TaskList,
  TaskListUser,
  MinimalUser,
  TaskListMembership,
  TaskCompleter,
  EphemeralTasks,
  DateBucket,
  YearBucket,
  CompletedTasks,
  Template,
  Day,
  TickerEntry,
  TaskListPostBody,
  EphemeralTasksOps,
  EphemeralCloseOp,
  EphemeralUpdateOp,
  EphemeralReopenOp,
  AggregatedEarnings,
  StashProfitDeltas,
  ProductivityUpdateResult,
  UserBalanceValues,
  Productivity,
  ListProductivity
} from './types'

export { TASK_ALLOWED_KEYS } from './types'

// Helper functions
export {
  generateObjectId,
  ensureUniqueTaskIds,
  getUserLocale,
  translateTemplateTasks,
  getTaskKey,
  parseNumericValue,
  parseBudget,
  getUserBalanceValues,
  getTodayISO,
  getYearFromISO,
  getLocalizedListName,
  loadTranslationsForLocale
} from './helpers'

// CRUD service
export {
  getTaskListsForUser,
  ensureDefaultTaskLists,
  deleteTaskList,
  createTaskList,
  updateTaskList,
  getTaskListWithTasks
} from './taskListCrudService'
export type { NewTaskInput } from './taskListCrudService'

// List completion service (Job-based)
export {
  calculateListCompletionFromJobs,
  calculateYearCompletionFromJobs,
  getListCompletionData
} from './listCompletionService'
