import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
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

    const { templateId } = await params

    // Fetch the template to clone
    const template = await prisma.template.findUnique({
      where: { id: templateId },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Check if user has access to this template (must be public, friends-only, or owned by user)
    const users = (template.users as any[]) || []
    const isOwner = users.some((u: any) => u.userId === user.id && u.role === 'OWNER')
    const isPublic = template.visibility === 'PUBLIC'
    
    if (!isOwner && !isPublic) {
      // For FRIENDS visibility, we'd need to check friendship status
      // For now, we'll allow only public or owned templates to be cloned
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get optional custom name from request body
    const body = await request.json().catch(() => ({}))
    const customName = body.name

    // Create a new task list from the template
    const taskList = await prisma.list.create({
      data: {
        name: customName || `${template.name || 'Template'} (Cloned)`,
        visibility: 'PRIVATE', // Cloned lists are private by default
        role: 'custom', // Cloned lists are custom
        users: [{ userId: user.id, role: 'OWNER' }],
        templateId: template.id,
        templateTasks: template.tasks as any,
        tasks: template.tasks as any,
        ephemeralTasks: { open: [], closed: [] },
        completedTasks: {},
      },
    })

    // Update the template to track who cloned it
    await prisma.template.update({
      where: { id: templateId },
      data: {
        clonedBy: {
          push: user.id,
        },
      },
    })

    return NextResponse.json({ 
      taskList,
      message: 'Template cloned successfully'
    })
  } catch (error) {
    console.error('Error cloning template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

