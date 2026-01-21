/**
 * Job Earnings Service
 * Handles financial calculations when jobs are created or validated
 */

import prisma from '@/lib/prisma'
import {
  calculateTaskEarnings,
  getPerCompleterPrize,
  getPerCompleterProfit,
  calculateStashAndProfitDeltas,
  calculateUpdatedUserValues
} from '@/lib/utils/earningsUtils'

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
): Promise<{ totalPrize: number; totalProfit: number; totalEarnings: number }> {
  const jobs = await prisma.job.findMany({
    where: { listId, workerId, occurrenceDate, status: 'ACCEPTED' },
    select: { prize: true, profit: true }
  })

  const totals = jobs.reduce(
    (acc, job) => ({
      prize: acc.prize + safeParseFloat(job.prize),
      profit: acc.profit + safeParseFloat(job.profit)
    }),
    { prize: 0, profit: 0 }
  )

  return {
    totalPrize: totals.prize,
    totalProfit: totals.profit,
    totalEarnings: totals.prize + totals.profit
  }
}

/**
 * Update Day.ticker with total earnings for a list/date
 */
async function updateDayTickerFromJobs(
  workerId: string,
  listId: string,
  occurrenceDate: string
): Promise<void> {
  try {
    const { totalPrize, totalProfit } = await calculateTotalEarningsFromJobs(listId, workerId, occurrenceDate)

    const day = await prisma.day.findFirst({
      where: { userId: workerId, date: occurrenceDate }
    })

    const newTickerEntry = { listId, profit: totalProfit, prize: totalPrize }
    const hasEarnings = totalPrize > 0 || totalProfit > 0

    if (!day) {
      const metadata = getDateMetadata(occurrenceDate)
      await prisma.day.create({
        data: {
          userId: workerId,
          date: occurrenceDate,
          ...metadata,
          ticker: hasEarnings ? [newTickerEntry] as any : [],
          tasks: []
        }
      })
      return
    }

    const existingTickers = Array.isArray(day.ticker) ? day.ticker : []
    const filteredTickers = (existingTickers as any[]).filter((t: any) => t.listId !== listId)
    const updatedTickers = hasEarnings ? [...filteredTickers, newTickerEntry] : filteredTickers

    await prisma.day.update({
      where: { id: day.id },
      data: { ticker: updatedTickers as any }
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
  prize: number
  profit: number
  earnings: number
  updatedUserValues: {
    availableBalance: number
    stash: number
    equity: number
    profit: number
  } | null
}

// Helper to update user financial values and return updated values
async function updateUserFinancials(
  workerId: string,
  stashDelta: number,
  profitDelta: number
): Promise<{ newAvailableBalance: number; newStash: number; newEquity: number; newProfit: number }> {
  const worker = await prisma.user.findUnique({
    where: { id: workerId },
    select: { availableBalance: true, stash: true, equity: true, profit: true }
  })

  if (!worker) throw new Error('Worker not found')

  const updatedValues = await calculateUpdatedUserValues({
    currentStash: safeParseFloat(worker.stash),
    currentProfit: safeParseFloat(worker.profit),
    currentAvailableBalance: safeParseFloat(worker.availableBalance),
    stashDelta,
    profitDelta
  })

  await prisma.user.update({
    where: { id: workerId },
    data: {
      stash: updatedValues.newStash as any,
      profit: updatedValues.newProfit as any,
      equity: updatedValues.newEquity as any
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
    const [list, worker] = await Promise.all([
      prisma.list.findUnique({
        where: { id: listId },
        select: { role: true, budget: true, budgetPercentage: true, tasks: true, templateTasks: true }
      }),
      prisma.user.findUnique({
        where: { id: workerId },
        select: { equity: true }
      })
    ])

    if (!list) throw new Error('List not found')
    if (!worker) throw new Error('Worker not found')

    const tasksCount = (list.tasks || []).length || (list.templateTasks || []).length || 1
    const userEquity = String(worker.equity || '0')

    const earningsCalculation = calculateTaskEarnings({
      listRole: list.role,
      budgetPercentage: list.budgetPercentage as number | undefined,
      listBudget: list.budget,
      userEquity,
      numTasks: tasksCount,
      date: new Date(occurrenceDate)
    })

    const prize = getPerCompleterPrize(earningsCalculation, list.role)
    const profit = getPerCompleterProfit(earningsCalculation, list.role)
    const earnings = prize + profit

    const { stashDelta, profitDelta } = calculateStashAndProfitDeltas(prize, profit, true)
    const updatedValues = await updateUserFinancials(workerId, stashDelta, profitDelta)

    await prisma.job.update({
      where: { id: jobId },
      data: { earnings: earnings as any, prize: prize as any, profit: profit as any }
    })

    await updateDayTickerFromJobs(workerId, listId, occurrenceDate)
    await updateDaySnapshot(workerId, occurrenceDate, updatedValues)

    return {
      prize,
      profit,
      earnings,
      updatedUserValues: {
        availableBalance: updatedValues.newAvailableBalance,
        stash: updatedValues.newStash,
        equity: updatedValues.newEquity,
        profit: updatedValues.newProfit
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
      select: { prize: true, profit: true, listId: true }
    })

    if (!job) throw new Error('Job not found')

    const prize = safeParseFloat(job.prize)
    const profit = safeParseFloat(job.profit)

    if (prize === 0 && profit === 0) return

    const { stashDelta, profitDelta } = calculateStashAndProfitDeltas(-prize, -profit, false)
    const updatedValues = await updateUserFinancials(workerId, stashDelta, profitDelta)

    await updateDayTickerFromJobs(workerId, job.listId, occurrenceDate)
    await updateDaySnapshot(workerId, occurrenceDate, updatedValues)
  } catch (error) {
    console.error('Error reversing job earnings:', error)
    throw error
  }
}
