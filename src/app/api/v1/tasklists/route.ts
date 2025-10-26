import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')

    // Find user by userId
    const user = await prisma.user.findUnique({
      where: { userId: userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Build query for TaskLists where the user participates as owner, collaborator, or manager
    const membershipClause = {
      OR: [
        { owners: { has: user.id } },
        { collaborators: { has: user.id } },
        { managers: { has: user.id } }
      ]
    }

    const whereClause: any = role ? { role, ...membershipClause } : membershipClause

    const taskLists = await prisma.taskList?.findMany({
      where: whereClause,
      include: {
        template: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    })

    return NextResponse.json({ taskLists })

  } catch (error) {
    console.error('Error fetching task lists:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { role, tasks, templateId, updateTemplate, name, budget, dueDate, create, collaborators } = body

    // Find user by userId
    const user = await prisma.user.findUnique({
      where: { userId: userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if TaskList with this role already exists for this user
    const existingTaskList = await prisma.taskList?.findFirst({
      where: {
        owners: {
          has: user.id
        },
        role: role
      }
    })

    let taskList

    if (create) {
      // If creating a new default list, demote existing default to custom
      if (role && role.endsWith('.default') && existingTaskList) {
        await prisma.taskList.update({
          where: { id: existingTaskList.id },
          data: { role: 'custom' }
        })
      }
      // Create new TaskList
      taskList = await prisma.taskList.create({
        data: {
          role: role,
          name: name,
          budget: budget,
          dueDate: dueDate,
          visibility: 'PRIVATE',
          owners: [user.id],
          tasks: tasks,
          templateId: templateId,
          collaborators: Array.isArray(collaborators) ? collaborators : [],
          managers: []
        },
        include: { template: true }
      })
    } else if (existingTaskList) {
      // Update existing TaskList
      taskList = await prisma.taskList?.update({
        where: { id: existingTaskList.id },
        data: {
          tasks: tasks,
          templateId: templateId,
          name: name ?? existingTaskList.name,
          budget: budget ?? existingTaskList.budget,
          dueDate: dueDate ?? existingTaskList.dueDate,
          collaborators: Array.isArray(collaborators) ? collaborators : existingTaskList.collaborators,
          updatedAt: new Date()
        },
        include: { template: true }
      })
    } else {
      // Create new TaskList
      taskList = await prisma.taskList.create({
        data: {
          role: role,
          name: name,
          budget: budget,
          dueDate: dueDate,
          visibility: 'PRIVATE',
          owners: [user.id],
          tasks: tasks,
          templateId: templateId,
          collaborators: Array.isArray(collaborators) ? collaborators : [],
          managers: []
        },
        include: { template: true }
      })
    }

    // Optionally update the linked Template with the same tasks
    if (updateTemplate && taskList?.templateId) {
      await prisma.template.update({
        where: { id: taskList.templateId },
        data: {
          tasks: tasks,
          updatedAt: new Date()
        }
      })

      // Re-fetch task list to include refreshed template relation
      taskList = await prisma.taskList.findUnique({
        where: { id: taskList.id },
        include: { template: true }
      })
    }

    return NextResponse.json({ taskList })

  } catch (error) {
    console.error('Error updating task list:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
