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

/**
 * Calculate total earnings from all ACCEPTED jobs for a list/date/worker
 */
async function calculateTotalEarningsFromJobs(
  listId: string,
  workerId: string,
  occurrenceDate: string
): Promise<{ totalPrize: number; totalProfit: number; totalEarnings: number }> {
  const jobs = await prisma.job.findMany({
    where: {
      listId,
      workerId,
      occurrenceDate,
      status: 'ACCEPTED'
    },
    select: {
      earnings: true,
      prize: true,
      profit: true
    }
  })

  let totalPrize = 0
  let totalProfit = 0

  jobs.forEach(job => {
    totalPrize += parseFloat(String(job.prize || 0))
    totalProfit += parseFloat(String(job.profit || 0))
  })

  return {
    totalPrize,
    totalProfit,
    totalEarnings: totalPrize + totalProfit
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
    // Calculate totals from all jobs
    const { totalPrize, totalProfit } = await calculateTotalEarningsFromJobs(
      listId,
      workerId,
      occurrenceDate
    )

    // Get or create Day record
    const day = await prisma.day.findFirst({
      where: {
        userId: workerId,
        date: occurrenceDate
      }
    })

    if (!day) {
      // Create day if it doesn't exist
      const date = new Date(occurrenceDate)
      const dateObj = new Date(occurrenceDate)
      const dayNum = (dateObj.getDay() + 6) % 7
      const tempDate = new Date(dateObj.valueOf())
      tempDate.setDate(tempDate.getDate() - dayNum + 3)
      const firstThursday = tempDate.valueOf()
      tempDate.setMonth(0, 1)
      if (tempDate.getDay() !== 4) {
        tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7)
      }
      const week = 1 + Math.ceil((firstThursday - tempDate.valueOf()) / 604800000)

      await prisma.day.create({
        data: {
          userId: workerId,
          date: occurrenceDate,
          week,
          month: date.getMonth() + 1,
          quarter: Math.ceil((date.getMonth() + 1) / 3),
          semester: date.getMonth() + 1 <= 6 ? 1 : 2,
          ticker: [{
            listId,
            profit: totalProfit,
            prize: totalPrize
          }] as any,
          tasks: []
        }
      })
      return
    }

    // Update existing day's ticker
    const existingTickers = Array.isArray(day.ticker) ? day.ticker : []

    // Remove old ticker entry for this list
    const filteredTickers = (existingTickers as any[]).filter(
      (t: any) => t.listId !== listId
    )

    // Add new ticker entry with totals (only if there are earnings)
    const updatedTickers = totalPrize > 0 || totalProfit > 0
      ? [...filteredTickers, {
          listId,
          profit: totalProfit,
          prize: totalPrize
        }]
      : filteredTickers

    await prisma.day.update({
      where: { id: day.id },
      data: {
        ticker: updatedTickers as any
      }
    })
  } catch (error) {
    console.error('Error updating Day ticker from jobs:', error)
    // Don't throw - we don't want to fail the job operation if ticker update fails
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
    // Fetch list details
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: {
        id: true,
        role: true,
        budget: true,
        budgetPercentage: true,
        tasks: true,
        templateTasks: true
      }
    })

    if (!list) {
      throw new Error('List not found')
    }

    // Fetch worker (user) details
    const worker = await prisma.user.findUnique({
      where: { id: workerId },
      select: {
        id: true,
        availableBalance: true,
        stash: true,
        equity: true,
        profit: true
      }
    })

    if (!worker) {
      throw new Error('Worker not found')
    }

    // Count total tasks in the list
    const tasksCount = (list.tasks || []).length || (list.templateTasks || []).length || 1

    // Get user equity - ensure it's a string for the calculation
    const userEquity = String(worker.equity || '0')

    // Calculate earnings for this task completion
    const earningsCalculation = calculateTaskEarnings({
      listRole: list.role,
      budgetPercentage: list.budgetPercentage as number | undefined,
      listBudget: list.budget,
      userEquity,
      numTasks: tasksCount,
      date: new Date(occurrenceDate)
    })

    // Get per-completer prize and profit based on list cadence
    const prize = getPerCompleterPrize(earningsCalculation, list.role)
    const profit = getPerCompleterProfit(earningsCalculation, list.role)
    const earnings = prize + profit

    // Calculate deltas for stash and profit
    const { stashDelta, profitDelta } = calculateStashAndProfitDeltas(
      prize,
      profit,
      true // isAddition
    )

    // Update user's financial values
    const currentStash = parseFloat(String(worker.stash || 0))
    const currentProfit = parseFloat(String((worker as any).profit || 0))
    const currentAvailableBalance = parseFloat(String(worker.availableBalance || 0))

    const updatedValues = await calculateUpdatedUserValues({
      currentStash,
      currentProfit,
      currentAvailableBalance,
      stashDelta,
      profitDelta
    })

    // Update user in database
    await prisma.user.update({
      where: { id: workerId },
      data: {
        stash: updatedValues.newStash as any,
        profit: updatedValues.newProfit as any,
        equity: updatedValues.newEquity as any
      }
    })

    // Store earnings in the job record for reference
    await prisma.job.update({
      where: { id: jobId },
      data: {
        earnings: earnings as any,
        prize: prize as any,
        profit: profit as any
      }
    })

    // Update Day.ticker with TOTAL earnings from ALL jobs for this list/date
    await updateDayTickerFromJobs(workerId, listId, occurrenceDate)

    // Also update Day balance/stash/equity
    const day = await prisma.day.findFirst({
      where: {
        userId: workerId,
        date: occurrenceDate
      }
    })

    if (day) {
      await prisma.day.update({
        where: { id: day.id },
        data: {
          balance: updatedValues.newAvailableBalance,
          stash: updatedValues.newStash,
          equity: updatedValues.newEquity
        }
      })
    }

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
    // Fetch job to get earnings
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        earnings: true,
        prize: true,
        profit: true,
        taskId: true,
        listId: true
      }
    })

    if (!job) {
      throw new Error('Job not found')
    }

    const prize = parseFloat(String(job.prize || 0))
    const profit = parseFloat(String(job.profit || 0))

    if (prize === 0 && profit === 0) {
      // No earnings to reverse
      return
    }

    // Fetch worker (user) details
    const worker = await prisma.user.findUnique({
      where: { id: workerId },
      select: {
        id: true,
        availableBalance: true,
        stash: true,
        equity: true,
        profit: true
      }
    })

    if (!worker) {
      throw new Error('Worker not found')
    }

    // Calculate deltas for reversal (negative)
    const { stashDelta, profitDelta } = calculateStashAndProfitDeltas(
      -prize,
      -profit,
      false // isAddition = false (this is a reversal)
    )

    // Update user's financial values
    const currentStash = parseFloat(String(worker.stash || 0))
    const currentProfit = parseFloat(String((worker as any).profit || 0))
    const currentAvailableBalance = parseFloat(String(worker.availableBalance || 0))

    const updatedValues = await calculateUpdatedUserValues({
      currentStash,
      currentProfit,
      currentAvailableBalance,
      stashDelta,
      profitDelta
    })

    // Update user in database
    await prisma.user.update({
      where: { id: workerId },
      data: {
        stash: updatedValues.newStash as any,
        profit: updatedValues.newProfit as any,
        equity: updatedValues.newEquity as any
      }
    })

    // Recalculate Day.ticker with TOTAL earnings from remaining jobs
    await updateDayTickerFromJobs(workerId, job.listId, occurrenceDate)

    // Update Day balance/stash/equity
    const day = await prisma.day.findFirst({
      where: {
        userId: workerId,
        date: occurrenceDate
      }
    })

    if (day) {
      await prisma.day.update({
        where: { id: day.id },
        data: {
          balance: updatedValues.newAvailableBalance,
          stash: updatedValues.newStash,
          equity: updatedValues.newEquity
        }
      })
    }
  } catch (error) {
    console.error('Error reversing job earnings:', error)
    throw error
  }
}
