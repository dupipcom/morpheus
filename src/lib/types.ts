// Type definitions for productivity tracking

export interface ListProductivity {
  totalTasks: number
  completedTasks: number
  percentage: number
}

export type Productivity = Record<string, ListProductivity>

