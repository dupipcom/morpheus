/**
 * Job Earnings Service
 * Handles financial calculations when jobs are created or validated
 */

import prisma from '@/lib/prisma'
import {
  calculateTaskEarnings,
  getPerCompleterPremium,
  getPerCompleterEarnings,
  calculateStashAndEarningsDeltas,
  calculateUpdatedUserValues,
  applyPremiumFactors,
  PremiumFactorSettings
} from '@/lib/utils/earningsUtils'
import { calculateTaskBudgetFromDistribution } from '@/lib/services/task/taskMigrationService'

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

  const totals = jobs.reduce(
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
      stash: updatedValues.newStash as any,
      profit: updatedValues.newProfit as any,
      equity: updatedValues.newEquity as any,
      totalGains: updatedValues.newTotalGains as any
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
 * Get task financial values for invoice creation
 */
export async function getTaskInvoiceValues(taskId: string, listId: string): Promise<{
  earnings: number | null
  premium: number | null
  totalGains: number | null
}> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { earnings: true, premium: true, totalGains: true, budget: true }
  })

  if (!task) {
    return { earnings: null, premium: null, totalGains: null }
  }

  // earnings field or budget as fallback for backwards compatibility
  const earnings = task.earnings ?? task.budget ?? null
  const premium = task.premium ?? null
  const totalGains = task.totalGains ?? (earnings != null && premium != null ? earnings + premium : null)

  return { earnings, premium, totalGains }
}

/**
 * Update job invoice with latest task values
 * Called when job transitions to IN_PROGRESS (job initiation)
 */
export async function initializeJobInvoice(
  jobId: string,
  taskId: string,
  listId: string
): Promise<void> {
  // Try to calculate allocation from list budget distribution first,
  // falling back to stored task values when distribution is not configured.
  const [list, task, job] = await Promise.all([
    prisma.list.findUnique({
      where: { id: listId },
      select: { budget: true, budgetDistribution: true, premiumPercentage: true, remainingBudget: true, tasks: true }
    }),
    prisma.task.findUnique({ where: { id: taskId } }),
    prisma.job.findUnique({ where: { id: jobId }, select: { workerId: true } })
  ])

  console.log('Initializing job invoice:', { jobId, taskId, listId })

  // Fallback to simple task values if list or task missing
  if (!task) {
    const { earnings, premium, totalGains } = await getTaskInvoiceValues(taskId, listId)
    await prisma.job.update({
      where: { id: jobId },
      data: {
        invoice: {
          quote: earnings,
          premium: premium,
          exposure: totalGains
        }
      }
    })
    return
  }

  let alloc: { budget: number | null; premium: number | null; totalGains: number | null } | null = null

  if (list && list.budgetDistribution) {
    // Try to obtain worker equity if possible (safety scaling)
    let worker: any = null
    if (job?.workerId) {
      worker = await prisma.user.findUnique({ where: { id: job.workerId }, select: { equity: true } })
    }
    const remainingBudget = list.remainingBudget ? parseFloat(list.remainingBudget) : list.budget

    alloc = calculateTaskBudgetFromDistribution({
      task: task as any,
      list: {
        budget: list.budget,
        budgetDistribution: list.budgetDistribution as any,
        premiumPercentage: list.premiumPercentage,
        tasks: list.tasks as any
      },
      userEquity: worker?.equity,
      remainingBudget
    })

    console.log('Calculated allocation from distribution:', alloc)
  }

  // Build invoice fields using allocation or fallback to stored task values
  const quote = alloc?.budget ?? (task as any).earnings ?? (task as any).budget ?? null
  const premium = alloc?.premium ?? (task as any).premium ?? null
  const exposure = alloc?.totalGains ?? ((quote != null && premium != null) ? (quote + premium) : null)

  await prisma.job.update({
    where: { id: jobId },
    data: {
      invoice: {
        quote: quote as any,
        premium: premium as any,
        exposure: exposure as any
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
  
  // Use budget distribution (if available) to compute current task values,
  // otherwise fall back to stored task values.
  const [list, task, worker] = await Promise.all([
    prisma.list.findUnique({ where: { id: listId }, select: { role: true, budget: true, budgetDistribution: true, premiumPercentage: true, remainingBudget: true, tasks: true } }),
    prisma.task.findUnique({ where: { id: taskId } }),
    prisma.user.findUnique({ where: { id: job.workerId }, select: { settings: true } })
  ])

  if (!task) return

  let alloc: { budget: number | null; premium: number | null; totalGains: number | null } | null = null
  if (list && list.budgetDistribution) {
    const remainingBudget = list.remainingBudget ? parseFloat(list.remainingBudget) : list.budget
    alloc = calculateTaskBudgetFromDistribution({
      task: task as any,
      list: {
        budget: list.budget,
        budgetDistribution: list.budgetDistribution as any,
        premiumPercentage: list.premiumPercentage,
        tasks: list.tasks as any
      },
      userEquity: null,
      remainingBudget
    })
  }

  const earnings = alloc?.budget ?? (task as any).earnings ?? (task as any).budget ?? 0
  const rawPremium = alloc?.premium ?? (task as any).premium ?? 0
  
  // Apply premium factors based on list role and worker's settings
  const premiumFactorSettings: PremiumFactorSettings | null = worker?.settings as PremiumFactorSettings | null
  const premium = applyPremiumFactors(rawPremium, list?.role, premiumFactorSettings)
  const totalGains = premium + earnings

  await prisma.job.update({
    where: { id: jobId },
    data: {
      earnings: earnings as any,
      premium: premium as any,
      totalGains: totalGains as any
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
          role: true, 
          budget: true, 
          premiumPercentage: true, 
          budgetDistribution: true,
          remainingBudget: true,
          tasks: true
          // templateTasks is deprecated - using Task collection only
        }
      }),
      prisma.task.findUnique({
        where: { id: taskId },
        select: { 
          id: true,
          name: true,
          area: true,
          categories: true,
          budget: true,
          earnings: true,
          premium: true,
          totalGains: true
        }
      }),
      prisma.user.findUnique({
        where: { id: workerId },
        select: {
          equity: true,
          settings: true
        }
      })
    ])

    if (!list) throw new Error('List not found')
    if (!task) throw new Error('Task not found')
    if (!worker) throw new Error('Worker not found')

    // Parse remainingBudget (it's stored as String in DB)
    const remainingBudget = list.remainingBudget ? parseFloat(list.remainingBudget) : list.budget

    // Use budget distribution to calculate task-specific earnings with all safety checks
    // templateTasks is deprecated - using Task collection only
    const taskBudgetAllocation = calculateTaskBudgetFromDistribution({
      task,
      list: {
        budget: list.budget,
        budgetDistribution: list.budgetDistribution,
        premiumPercentage: list.premiumPercentage,
        tasks: list.tasks
      },
      userEquity: worker.equity,
      remainingBudget
    })

    // Use the calculated budget and premium from distribution, falling back to task values
    // These are already capped by task.totalGains in calculateTaskBudgetFromDistribution
    const earnings = taskBudgetAllocation.budget ?? task.earnings ?? task.budget ?? 0
    const rawPremium = taskBudgetAllocation.premium ?? task.premium ?? 0
    
    // Apply premium factors based on list role and user settings
    // NOTE: Premium is calculated based on factors and is NOT limited by list budget or task.totalGains.
    // The list budget only represents the amount available for earnings, not a hard limit for premium.
    const premiumFactorSettings: PremiumFactorSettings | null = worker.settings as PremiumFactorSettings | null
    const premium = applyPremiumFactors(rawPremium, list.role, premiumFactorSettings)
    const totalGains = premium + earnings

    // Log if factored premium results in totalGains exceeding stored task.totalGains (informational only)
    if (task.totalGains != null && task.totalGains > 0 && totalGains > task.totalGains) {
      console.log(`Job ${jobId}: Factored totalGains ${totalGains} exceeds stored task.totalGains ${task.totalGains}. This is expected when premium factors apply.`, {
        earnings,
        rawPremium,
        factoredPremium: premium,
        storedTaskTotalGains: task.totalGains
      })
    }

    // Save the exact factored premium to the Job collection
    const { stashDelta, profitDelta } = calculateStashAndEarningsDeltas(premium, earnings, true)
    const updatedValues = await updateUserFinancials(workerId, stashDelta, profitDelta)

    await prisma.job.update({
      where: { id: jobId },
      data: { totalGains: totalGains as any, premium: premium as any, earnings: earnings as any }
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
