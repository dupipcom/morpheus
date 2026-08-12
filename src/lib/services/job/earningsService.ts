/**
 * Job Earnings Service
 * Handles financial calculations when jobs are created or validated
 */

import prisma from '@/lib/prisma'
import {
  calculateStashAndEarningsDeltas,
  calculateUpdatedUserValues,
  PremiumFactorSettings
} from '@/lib/utils/earningsUtils'
import { resolveListBudget, resolveTaskFinancials } from '@/lib/services/finance/premiumService'

// Helper to safely parse a number
function safeParseFloat(value: unknown): number {
  return parseFloat(String(value || 0))
}

// Calculate ISO week number (ISO 8601)
function getWeekNumber(date: Date): number {
  const tempDate = new Date(date.valueOf())
  const dayNum = (date.getDay() + 6) % 7
  tempDate.setDate(tempDate.getDate() - dayNum + 3)
  const firstThursday = tempDate.valueOf()
  tempDate.setMonth(0, 1)
  if (tempDate.getDay() !== 4) {
    tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7)
  }
  return 1 + Math.ceil((firstThursday - tempDate.valueOf()) / 604800000)
}

// Calculate date metadata for Day record creation
function getDateMetadata(dateStr: string): { week: number; month: number; quarter: number; semester: number } {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  return {
    week: getWeekNumber(date),
    month,
    quarter: Math.ceil(month / 3),
    semester: month <= 6 ? 1 : 2
  }
}

/**
 * Calculate total earnings from all ACCEPTED jobs for a list/date/worker
 */
async function calculateTotalEarningsFromJobs(
  listId: string,
  workerId: string,
  occurrenceDate: string
): Promise<{ totalPremium: number; totalEarnings: number; totalGains: number }> {
  const jobs = await prisma.job.findMany({
    where: { listId, workerId, occurrenceDate, status: 'ACCEPTED' },
    select: { premium: true, earnings: true }
  })

  const totals = jobs.reduce<{ premium: number; earnings: number }>(
    (acc, job) => ({
      premium: acc.premium + safeParseFloat(job.premium),
      earnings: acc.earnings + safeParseFloat(job.earnings)
    }),
    { premium: 0, earnings: 0 }
  )

  return {
    totalPremium: totals.premium,
    totalEarnings: totals.earnings,
    totalGains: totals.premium + totals.earnings
  }
}

/**
 * Update Day.ticker with total earnings for a list/date
 * Also updates user balance fields on the Day record
 */
async function updateDayTickerFromJobs(
  workerId: string,
  listId: string,
  taskId: string,
  occurrenceDate: string,
  userValues: { balance: number; stash: number; equity: number }
): Promise<void> {
  try {
    const { totalPremium, totalEarnings } = await calculateTotalEarningsFromJobs(listId, workerId, occurrenceDate)
    const metadata = getDateMetadata(occurrenceDate)

    const day = await prisma.day.findFirst({
      where: { userId: workerId, date: occurrenceDate }
    })

    // Include taskId in the ticker entry for consistency with updateDayTicker
    const newTickerEntry = { listId, taskId, earnings: totalEarnings, premium: totalPremium }
    const hasEarnings = totalPremium > 0 || totalEarnings > 0

    if (!day) {
      await prisma.day.create({
        data: {
          userId: workerId,
          date: occurrenceDate,
          ...metadata,
          ticker: hasEarnings ? [newTickerEntry] as any : [],
          tasks: [],
          balance: userValues.balance,
          stash: userValues.stash,
          equity: userValues.equity
        }
      })
      return
    }

    const existingTickers = Array.isArray(day.ticker) ? day.ticker : []
    // Filter out existing ticker entries for this specific task in this list
    const filteredTickers = (existingTickers as any[]).filter((t: any) => !(t.listId === listId && t.taskId === taskId))
    const updatedTickers = hasEarnings ? [...filteredTickers, newTickerEntry] : filteredTickers

    await prisma.day.update({
      where: { id: day.id },
      data: {
        ticker: updatedTickers as any,
        balance: userValues.balance,
        stash: userValues.stash,
        equity: userValues.equity,
        ...metadata
      }
    })
  } catch (error) {
    console.error('Error updating Day ticker from jobs:', error)
  }
}

interface CalculateJobEarningsParams {
  jobId: string
  taskId: string
  listId: string
  workerId: string
  occurrenceDate: string
}

interface JobEarningsResult {
  premium: number
  earnings: number
  totalGains: number
  updatedUserValues: {
    availableBalance: number
    stash: number
    equity: number
    profit: number
    totalGains: number
  } | null
}

// Helper to update user financial values and return updated values
async function updateUserFinancials(
  workerId: string,
  stashDelta: number,
  earningsDelta: number
): Promise<{ newAvailableBalance: number; newStash: number; newEquity: number; newProfit: number; newTotalGains: number }> {
  const worker = await prisma.user.findUnique({
    where: { id: workerId },
    select: { availableBalance: true, stash: true, equity: true, profit: true, totalGains: true }
  })

  if (!worker) throw new Error('Worker not found')

  const updatedValues = await calculateUpdatedUserValues({
    currentStash: safeParseFloat(worker.stash),
    currentProfit: safeParseFloat(worker.profit),
    currentAvailableBalance: safeParseFloat(worker.availableBalance),
    currentTotalGains: safeParseFloat(worker.totalGains),
    stashDelta,
    profitDelta: earningsDelta
  })

  await prisma.user.update({
    where: { id: workerId },
    data: {
      stash: updatedValues.newStash,
      profit: updatedValues.newProfit,
      equity: updatedValues.newEquity,
      totalGains: updatedValues.newTotalGains
    }
  })

  return updatedValues
}

// Helper to update Day snapshot with latest user financial values
async function updateDaySnapshot(
  workerId: string,
  occurrenceDate: string,
  values: { newAvailableBalance: number; newStash: number; newEquity: number }
): Promise<void> {
  const day = await prisma.day.findFirst({
    where: { userId: workerId, date: occurrenceDate }
  })

  if (day) {
    await prisma.day.update({
      where: { id: day.id },
      data: {
        balance: values.newAvailableBalance,
        stash: values.newStash,
        equity: values.newEquity
      }
    })
  }
}

/**
 * Fetch the data needed to resolve a task's financials for a job:
 * the list budget (with sources), the task premium, and the worker's settings
 */
async function fetchJobFinancialContext(
  taskId: string,
  listId: string,
  workerId: string
): Promise<{ financials: { earnings: number; premium: number; totalGains: number } | null }> {
  const [list, task, worker] = await Promise.all([
    prisma.list.findUnique({
      where: { id: listId },
      select: {
        budget: true,
        budgetType: true,
        budgetPercent: true,
        budgetSources: { select: { remainingAmount: true } },
        _count: { select: { tasks: true } }
      }
    }),
    prisma.task.findUnique({
      where: { id: taskId },
      select: { premium: true, premiumType: true, rrule: true }
    }),
    prisma.user.findUnique({
      where: { id: workerId },
      select: { settings: true }
    })
  ])

  if (!list || !task) {
    return { financials: null }
  }

  const listBudget = resolveListBudget(list)
  const premiumFactorSettings: PremiumFactorSettings | null = worker?.settings as PremiumFactorSettings | null
  const financials = resolveTaskFinancials(
    task,
    listBudget,
    list._count.tasks,
    premiumFactorSettings
  )

  return { financials }
}

/**
 * Update job invoice with the task's financial values
 * Called when job transitions to IN_PROGRESS (job initiation)
 */
export async function initializeJobInvoice(
  jobId: string,
  taskId: string,
  listId: string
): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { workerId: true }
  })

  if (!job) return

  const { financials } = await fetchJobFinancialContext(taskId, listId, job.workerId)
  if (!financials) return

  await prisma.job.update({
    where: { id: jobId },
    data: {
      invoice: {
        quote: financials.earnings,
        premium: financials.premium,
        exposure: financials.totalGains
      }
    }
  })
}

/**
 * Update job with latest task financial values
 * Called on each job update to keep invoice in sync
 * NOTE: Premium values are factored based on worker's settings
 */
export async function updateJobWithTaskValues(
  jobId: string,
  taskId: string,
  listId: string
): Promise<void> {
  // Fetch job to get workerId for premium factor settings
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { workerId: true }
  })

  if (!job) return

  const { financials } = await fetchJobFinancialContext(taskId, listId, job.workerId)
  if (!financials) return

  await prisma.job.update({
    where: { id: jobId },
    data: {
      earnings: financials.earnings,
      premium: financials.premium,
      totalGains: financials.totalGains
    }
  })
}

/**
 * Calculate and apply earnings for a completed job
 * Updates user's stash, profit, equity and Day.ticker
 */
export async function calculateAndApplyJobEarnings({
  jobId,
  taskId,
  listId,
  workerId,
  occurrenceDate
}: CalculateJobEarningsParams): Promise<JobEarningsResult> {
  try {
    const [list, task, worker] = await Promise.all([
      prisma.list.findUnique({
        where: { id: listId },
        select: {
          budget: true,
          budgetType: true,
          budgetPercent: true,
          budgetSources: { select: { remainingAmount: true } },
          _count: { select: { tasks: true } }
        }
      }),
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          name: true,
          area: true,
          categories: true,
          premium: true,
          premiumType: true,
          rrule: true
        }
      }),
      prisma.user.findUnique({
        where: { id: workerId },
        select: {
          settings: true
        }
      })
    ])

    if (!list) throw new Error('List not found')
    if (!task) throw new Error('Task not found')
    if (!worker) throw new Error('Worker not found')

    // Resolve simplified financials: premium (fiat or % of list budget, factored
    // by worker settings) + equal share of the list budget as earnings
    const listBudget = resolveListBudget(list)
    const premiumFactorSettings: PremiumFactorSettings | null = worker.settings as PremiumFactorSettings | null
    const financials = resolveTaskFinancials(task, listBudget, list._count.tasks, premiumFactorSettings)
    const earnings = financials.earnings
    const premium = financials.premium
    const totalGains = financials.totalGains

    // Save the exact factored premium to the Job collection
    const { stashDelta, profitDelta } = calculateStashAndEarningsDeltas(premium, earnings, true)
    const updatedValues = await updateUserFinancials(workerId, stashDelta, profitDelta)

    await prisma.job.update({
      where: { id: jobId },
      data: { totalGains, premium, earnings }
    })

    await updateDayTickerFromJobs(workerId, listId, taskId, occurrenceDate, {
      balance: updatedValues.newAvailableBalance,
      stash: updatedValues.newStash,
      equity: updatedValues.newEquity
    })
    await updateDaySnapshot(workerId, occurrenceDate, updatedValues)

    return {
      premium,
      earnings,
      totalGains,
      updatedUserValues: {
        availableBalance: updatedValues.newAvailableBalance,
        stash: updatedValues.newStash,
        equity: updatedValues.newEquity,
        profit: updatedValues.newProfit,
        totalGains: updatedValues.newTotalGains
      }
    }
  } catch (error) {
    console.error('Error calculating job earnings:', error)
    throw error
  }
}

/**
 * Reverse earnings for an uncompleted job
 * Subtracts from user's stash and profit
 */
export async function reverseJobEarnings({
  jobId,
  workerId,
  occurrenceDate
}: {
  jobId: string
  workerId: string
  occurrenceDate: string
}): Promise<void> {
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { premium: true, earnings: true, listId: true, taskId: true }
    })

    if (!job) throw new Error('Job not found')

    const premium = safeParseFloat(job.premium)
    const earnings = safeParseFloat(job.earnings)

    if (premium === 0 && earnings === 0) return

    const { stashDelta, profitDelta } = calculateStashAndEarningsDeltas(-premium, -earnings, false)
    const updatedValues = await updateUserFinancials(workerId, stashDelta, profitDelta)

    await updateDayTickerFromJobs(workerId, job.listId, job.taskId, occurrenceDate, {
      balance: updatedValues.newAvailableBalance,
      stash: updatedValues.newStash,
      equity: updatedValues.newEquity
    })
    await updateDaySnapshot(workerId, occurrenceDate, updatedValues)
  } catch (error) {
    console.error('Error reversing job earnings:', error)
    throw error
  }
}
