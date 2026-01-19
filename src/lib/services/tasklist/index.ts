/**
 * TaskList Service Layer
 * Centralized exports for all tasklist-related services
 */

// Types
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
  sanitizeTask,
  formatDateForCompletedOn,
  getTodayISO,
  getYearFromISO,
  getLocalizedListName,
  loadTranslationsForLocale,
  isCompletedStatus,
  isTaskDone,
  shouldExcludeFromDayTasks,
  buildTaskForDay,
  createTaskMatcher,
  getListRoleType
} from './helpers'

// Productivity utilities
export {
  calculateListProductivity,
  calculateOverallProgress,
  updateProductivityForList,
  calculateCompletionRate
} from './productivityUtils'

// Earnings service
export {
  aggregateCompleterEarningsFromTaskList,
  calculateStashAndProfitDeltasForTaskList,
  updateUserStashAndProfit
} from './earningsService'

// Day service
export {
  calculateDateComponents,
  findOrCreateDay,
  updateDayTicker,
  removeUncompletedTasksFromDay,
  updateDayWithTasks
} from './dayService'

// Completion service
export {
  parseCompletedTasksBucket,
  buildCompleters,
  separateTasksByStatus,
  recordCompletions
} from './completionService'

// Task status service
export {
  findTaskInList,
  updateTaskStatus,
  updateTaskRedacted
} from './taskStatusService'

// Ephemeral task service
export {
  generateEphemeralTaskId,
  processEphemeralTasks
} from './ephemeralTaskService'

// CRUD service
export {
  getTaskListsForUser,
  calculateCollaboratorEarnings,
  ensureDefaultTaskLists,
  deleteTaskList,
  createTaskList,
  updateTaskList,
  updateTemplateWithTasks,
  getTaskListWithTemplate
} from './taskListCrudService'
