import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { generatePublicUrl } from '@/lib/services/tasklist/taskListCrudService'

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
      include: { tasks: true }
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

    // Create the cloned list
    const clonedTaskList = await prisma.list.create({
      data: {
        name: customName || `${taskList.name || 'Task List'} (Cloned)`,
        visibility: 'PRIVATE', // Cloned lists are private by default
        role: 'custom', // Cloned lists are custom
        users: [{ userId: user.id, role: 'OWNER' }],
        budget: taskList.budget,
        budgetType: taskList.budgetType,
        budgetPercent: taskList.budgetPercent,
        bio: taskList.bio,
        profilePhoto: taskList.profilePhoto,
        links: taskList.links
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
