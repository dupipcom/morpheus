import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

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

    // Fetch the tasklist to clone
    const taskList = await prisma.taskList.findUnique({
      where: { id: taskListId },
    })

    if (!taskList) {
      return NextResponse.json({ error: 'Task list not found' }, { status: 404 })
    }

    // Check if user has access to this tasklist (must be public, friends-only, or owned by user)
    const isOwner = taskList.owners.includes(user.id)
    const isPublic = taskList.visibility === 'PUBLIC'
    
    if (!isOwner && !isPublic) {
      // For FRIENDS visibility, we'd need to check friendship status
      // For now, we'll allow only public or owned tasklists to be cloned
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get optional custom name from request body
    const body = await request.json().catch(() => ({}))
    const customName = body.name

    // Create a new task list from the cloned tasklist
    const clonedTaskList = await prisma.taskList.create({
      data: {
        name: customName || `${taskList.name || 'Task List'} (Cloned)`,
        visibility: 'PRIVATE', // Cloned lists are private by default
        role: 'custom', // Cloned lists are custom
        owners: [user.id],
        templateId: taskList.templateId,
        templateTasks: taskList.templateTasks as any,
        tasks: taskList.tasks as any,
        ephemeralTasks: { open: [], closed: [] },
        completedTasks: {},
        budget: taskList.budget,
        budgetPercentage: taskList.budgetPercentage,
        dueDate: taskList.dueDate,
      },
    })

    return NextResponse.json({ 
      taskList: clonedTaskList,
      message: 'Task list cloned successfully'
    })
  } catch (error) {
    console.error('Error cloning tasklist:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

