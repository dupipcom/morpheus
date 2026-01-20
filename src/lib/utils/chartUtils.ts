/**
 * Utility functions for safe chart calculations
 */

/**
 * Safely converts a value to a number, returning 0 if invalid
 */
export function safeNumber(value: any): number {
  if (value === null || value === undefined || value === '') {
    return 0
  }
  const num = Number(value)
  return isNaN(num) ? 0 : num
}

/**
 * Safely calculates percentage with bounds checking
 */
export function safePercentage(value: number, total: number, maxPercentage: number = 100): number {
  if (total <= 0 || value <= 0) {
    return 0
  }
  const percentage = (value / total) * 100
  return Math.min(percentage, maxPercentage)
}

/**
 * Safely calculates average with null checks
 */
export function safeAverage(values: any[]): number {
  const validValues = values.filter(val => val !== null && val !== undefined && !isNaN(Number(val)))
  if (validValues.length === 0) {
    return 0
  }
  const sum = validValues.reduce((acc, val) => acc + Number(val), 0)
  return sum / validValues.length
}

/**
 * Safely formats a number to 2 decimal places
 */
export function safeFormat(value: any): string {
  const num = safeNumber(value)
  return num.toFixed(2)
}

/**
 * Validates mood data and returns safe values
 */
export function validateMoodData(mood: any): {
  gratitude: number
  optimism: number
  restedness: number
  tolerance: number
  selfEsteem: number
  trust: number
} {
  return {
    gratitude: safeNumber(mood?.gratitude),
    optimism: safeNumber(mood?.optimism),
    restedness: safeNumber(mood?.restedness),
    tolerance: safeNumber(mood?.tolerance),
    selfEsteem: safeNumber(mood?.selfEsteem),
    trust: safeNumber(mood?.trust),
  }
}

/**
 * Checks if mood data is valid and has non-zero values
 */
export function hasValidMoodData(mood: any): boolean {
  if (!mood || typeof mood !== 'object') {
    return false
  }
  
  const values = Object.values(mood).filter(val => val !== null && val !== undefined && !isNaN(Number(val)))
  return values.length > 0 && values.some(value => Number(value) > 0)
}

/**
 * Safely calculates progress percentage for tasks
 */
export function calculateProgressPercentage(progress: any, maxProgress: number = 20): number {
  const progressNum = safeNumber(progress)
  if (progressNum <= 0 || progressNum > maxProgress) {
    return 0
  }
  return (progressNum * 100) / maxProgress
} 