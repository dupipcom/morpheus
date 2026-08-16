import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { generatePublicUrl, temporaryPublicUrl } from '@/lib/services/list/taskListCrudService'
import { resolveListBudget } from '@/lib/services/finance/premiumService'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskListId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { taskListId } = await params

    // Fetch the tasklist to clone (with Task collection records)
    const taskList = await prisma.list.findUnique({
      where: { id: taskListId },
      include: {
        tasks: true,
        budgetSources: { select: { remainingAmount: true } }
      }
    })

    if (!taskList) {
      return NextResponse.json({ error: 'Task list not found' }, { status: 404 })
    }

    // Access: owner, or public list
    const users = taskList.users || []
    const isOwner = users.some((u) => u.userId === user.id && u.role === 'OWNER')
    const isPublic = taskList.visibility === 'PUBLIC'

    if (!isOwner && !isPublic) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get optional custom name from request body
    const body = await request.json().catch(() => ({}))
    const customName = typeof body?.name === 'string' ? sanitizeText(body.name) : null

    // PERCENT budgets reference the original owner's Budget sources, which the
    // cloner has no claim to. Resolve the effective fiat amount so the clone
    // keeps its financial meaning (previously the sources were dropped and a
    // cloned PERCENT list resolved every earning to 0).
    const isPercentBudget = taskList.budgetType === 'PERCENT'
    const cloneBudget = isPercentBudget
      ? resolveListBudget({
          budget: taskList.budget,
          budgetType: taskList.budgetType,
          budgetPercent: taskList.budgetPercent,
          budgetSources: taskList.budgetSources || []
        })
      : (taskList.budget ?? 0)

    // Create the cloned list
    const clonedTaskList = await prisma.list.create({
      data: {
        name: customName || `${taskList.name || 'Task List'} (Cloned)`,
        visibility: 'PRIVATE', // Cloned lists are private by default
        role: 'custom', // Cloned lists are custom
        users: [{ userId: user.id, role: 'OWNER' }],
        budget: cloneBudget,
        budgetType: isPercentBudget ? 'FIAT' : taskList.budgetType,
        budgetPercent: isPercentBudget ? null : taskList.budgetPercent,
        bio: taskList.bio,
        profilePhoto: taskList.profilePhoto,
        links: taskList.links,
        // Placeholder avoids the null-collision on the unique publicUrl index;
        // the real slug is assigned right below.
        publicUrl: temporaryPublicUrl()
      }
    })

    // Assign a unique public slug
    const publicUrl = await generatePublicUrl(clonedTaskList.name, clonedTaskList.id)
    await prisma.list.update({ where: { id: clonedTaskList.id }, data: { publicUrl } })

    // Clone Task collection records (fresh ids, reset to OPEN)
    const originalTasks = taskList.tasks || []
    if (originalTasks.length > 0) {
      const taskCreatePromises = originalTasks.map((task) =>
        prisma.task.create({
          data: {
            name: task.name,
            categories: task.categories,
            area: task.area,
            status: 'OPEN',
            listId: clonedTaskList.id,
            rrule: task.rrule,
            dtstart: task.dtstart,
            times: task.times,
            premium: task.premium,
            premiumType: task.premiumType,
            localeKey: task.localeKey,
            visibility: task.visibility,
            quality: task.quality,
            redacted: task.redacted || false
          }
        })
      )
      await Promise.all(taskCreatePromises)
    }

    return NextResponse.json({
      taskList: clonedTaskList,
      message: 'Task list cloned successfully'
    })
  } catch (error) {
    console.error('Error cloning tasklist:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
