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

    // Build query for TaskLists
    const whereClause: any = {
      owners: {
        has: user.id
      }
    }

    if (role) {
      whereClause.role = role
    }

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
    const { role, tasks, templateId } = body

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

    if (existingTaskList) {
      // Update existing TaskList
      const updatedTaskList = await prisma.taskList?.update({
        where: { id: existingTaskList.id },
        data: {
          tasks: tasks,
          templateId: templateId,
          updatedAt: new Date()
        },
        include: {
          template: true
        }
      })

      return NextResponse.json({ taskList: updatedTaskList })
    } else {
      // Create new TaskList
      const newTaskList = await prisma.taskList.create({
        data: {
          role: role,
          visibility: 'PRIVATE',
          owners: [user.id],
          tasks: tasks,
          templateId: templateId,
          collaborators: [],
          managers: []
        },
        include: {
          template: true
        }
      })

      return NextResponse.json({ taskList: newTaskList })
    }

  } catch (error) {
    console.error('Error updating task list:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
