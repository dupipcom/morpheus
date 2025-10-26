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

    // Ensure default daily/weekly lists exist for the owner
    const ownerUser = await prisma.user.findUnique({ where: { userId } })
    if (ownerUser) {
      const ensureDefault = async (r: string) => {
        const existing = await prisma.taskList.findFirst({ where: { owners: { has: ownerUser.id }, role: r } })
        if (!existing) {
          const tpl = await prisma.template.findFirst({ where: { role: r } })
          await prisma.taskList.create({
            data: {
              role: r,
              name: r === 'daily.default' ? 'Daily' : r === 'weekly.default' ? 'Weekly' : 'Default',
              visibility: 'PRIVATE',
              owners: [ownerUser.id],
              templateId: tpl?.id || null,
              templateTasks: (tpl?.tasks as any) || [],
              tasks: (tpl?.tasks as any) || [],
              ephemeralTasks: { open: [], closed: [] },
              completedTasks: {}
            } as any
          })
        }
      }
      await ensureDefault('daily.default')
      await ensureDefault('weekly.default')
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
    const { role, tasks, templateId, updateTemplate, name, budget, dueDate, create, collaborators } = body

    // Find user by userId
    const user = await prisma.user.findUnique({
      where: { userId: userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Delete a specific TaskList by ID
    if (body.deleteTaskList && body.taskListId) {
      const existing = await prisma.taskList.findUnique({ where: { id: body.taskListId } })
      if (!existing) return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })
      await prisma.taskList.delete({ where: { id: body.taskListId } })
      return NextResponse.json({ ok: true })
    }

    // Lightweight path: record completions into completedTasks and Task.completers
    if (body.recordCompletions && body.taskListId && (body.dayActions?.length || body.weekActions?.length)) {
      const taskList = await prisma.taskList.findUnique({ where: { id: body.taskListId } })
      if (!taskList) {
        return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })
      }

      const incomingTasks: any[] = (body.dayActions?.length ? body.dayActions : body.weekActions) || []
      const blueprintTasks: any[] = Array.isArray((taskList as any).templateTasks) ? ((taskList as any).templateTasks as any[]) : (Array.isArray(taskList.tasks) ? (taskList.tasks as any[]) : [])

      const listBudget = parseFloat(taskList.budget || '0')
      const totalTasks = blueprintTasks.length || incomingTasks.length || 1
      const perTaskEarnings = totalTasks > 0 ? (listBudget / totalTasks) : 0

      const allowedKeys = new Set([
        'id', 'name', 'categories', 'area', 'status', 'cadence', 'times', 'count', 'localeKey', 'contacts', 'things', 'favorite', 'isEphemeral', 'createdAt', 'completers'
      ])

      const sanitizeTask = (task: any) => {
        const out: any = {}
        for (const k in task) {
          if (allowedKeys.has(k)) out[k] = task[k]
        }
        return out
      }

      // Build completedTasks map
      const dateISO = (body.date || new Date().toISOString().split('T')[0]) as string
      const year = Number(dateISO.split('-')[0])
      const priorCompleted = (taskList as any).completedTasks || {}
      const yearBucket = priorCompleted[year] || {}
      const dayArr: any[] = Array.isArray(yearBucket[dateISO]) ? yearBucket[dateISO] : []

      // Helpers to match tasks reliably even with localized names
      const getKey = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')) as string
      const byKey: Record<string, any> = {}
      dayArr.forEach((t: any) => {
        const key = getKey(t)
        byKey[key] = t
      })

      // For each incoming (localized) task, merge into completed map
      const justCompletedNames: string[] = Array.isArray(body.justCompletedNames) ? body.justCompletedNames : []
      const nameSet = new Set(justCompletedNames.map((s) => typeof s === 'string' ? s.toLowerCase() : s))

      for (const incoming of incomingTasks) {
        // Skip tasks that did not just transition to done in this interaction, if a filter is provided
        if (nameSet.size > 0) {
          const nm = typeof incoming?.name === 'string' ? incoming.name.toLowerCase() : ''
          if (!nameSet.has(nm)) continue
        }
        const key = getKey(incoming)
        if (!key) continue
        const existing = byKey[key]
        const prevCompletersLen = Array.isArray(existing?.completers) ? existing.completers.length : 0
        const newCount = nameSet.size > 0 ? prevCompletersLen + 1 : Number(incoming?.count || (incoming.status === 'Done' ? 1 : 0))
        const delta = Math.max(0, newCount - prevCompletersLen)
        if (delta <= 0) {
          // still ensure we copy the latest snapshot of the task if it wasn't present
          if (!existing && newCount > 0) {
            byKey[key] = sanitizeTask({ ...incoming, status: 'Done', completers: [] })
          }
          continue
        }

        const baseCompleters = Array.isArray(existing?.completers) ? existing.completers : []
        const appended: any[] = []
        for (let i = 0; i < delta; i++) {
          appended.push({ id: user.id, earnings: perTaskEarnings.toString(), time: prevCompletersLen + i + 1, completedAt: new Date() })
        }
        const taskRecord = sanitizeTask({
          ...(existing || {}),
          ...incoming,
          status: 'Done',
          completers: [...baseCompleters, ...appended]
        })
        byKey[key] = taskRecord
      }

      const nextDayArr = Object.values(byKey)
      const nextCompleted = {
        ...priorCompleted,
        [year]: { ...yearBucket, [dateISO]: nextDayArr }
      }

      const saved = await prisma.taskList.update({
        where: { id: taskList.id },
        data: ({ completedTasks: nextCompleted } as any),
        include: { template: true }
      })

      return NextResponse.json({ taskList: saved })
    }

    // Ephemeral tasks operations scoped to a task list
    if (body.ephemeralTasks && body.taskListId) {
      const taskList = await prisma.taskList.findUnique({ where: { id: body.taskListId } })
      if (!taskList) return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })

      const current = (taskList as any).ephemeralTasks || { open: [], closed: [] }
      let open = Array.isArray(current.open) ? current.open : []
      let closed = Array.isArray(current.closed) ? current.closed : []

      if (body.ephemeralTasks.add) {
        const t = body.ephemeralTasks.add
        const withId = { id: t.id || `ephemeral_${Date.now()}_${Math.random().toString(36).slice(2,9)}`, name: t.name, status: t.status || 'Not started', area: t.area || 'self', categories: t.categories || ['custom'], cadence: t.cadence || 'ephemeral', times: t.times || 1, count: t.count || 0, contacts: t.contacts || [], things: t.things || [], favorite: !!t.favorite, isEphemeral: true, createdAt: new Date().toISOString() }
        open = [withId, ...open]
      }

      if (body.ephemeralTasks.close) {
        const id = body.ephemeralTasks.close.id
        const item = open.find((x: any) => x.id === id)
        open = open.filter((x: any) => x.id !== id)
        if (item) closed = [ { ...item, status: 'Done' }, ...closed ]
      }

      const saved = await prisma.taskList.update({
        where: { id: taskList.id },
        data: ({ ephemeralTasks: { open, closed } } as any)
      })

      return NextResponse.json({ taskList: saved })
    }

    // If editing a specific TaskList by ID, update directly
    if (body.taskListId && create === false) {
      const existingById = await prisma.taskList.findUnique({ where: { id: body.taskListId } })
      if (!existingById) {
        return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })
      }
      const updated = await prisma.taskList.update({
        where: { id: existingById.id },
        data: ({
          templateTasks: Array.isArray(tasks) ? tasks : existingById.templateTasks,
          tasks: Array.isArray(tasks) ? tasks : existingById.tasks,
          templateId: typeof templateId !== 'undefined' ? templateId : existingById.templateId,
          role: typeof role === 'string' ? role : existingById.role,
          name: typeof name !== 'undefined' ? name : existingById.name,
          budget: typeof budget !== 'undefined' ? budget : existingById.budget,
          dueDate: typeof dueDate !== 'undefined' ? dueDate : existingById.dueDate,
          collaborators: Array.isArray(collaborators) ? collaborators : existingById.collaborators,
          updatedAt: new Date()
        } as any),
        include: { template: true }
      })

      return NextResponse.json({ taskList: updated })
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
        data: ({
          role: role,
          name: name,
          budget: budget,
          dueDate: dueDate,
          visibility: 'PRIVATE',
          owners: [user.id],
          templateTasks: tasks,
          tasks: tasks,
          templateId: templateId,
          collaborators: Array.isArray(collaborators) ? collaborators : [],
          managers: []
        } as any),
        include: { template: true }
      })
    } else if (existingTaskList) {
      // Update existing TaskList
      taskList = await prisma.taskList?.update({
        where: { id: existingTaskList.id },
        data: ({
          templateTasks: tasks ?? existingTaskList.tasks,
          tasks: tasks,
          templateId: templateId,
          name: name ?? existingTaskList.name,
          budget: budget ?? existingTaskList.budget,
          dueDate: dueDate ?? existingTaskList.dueDate,
          collaborators: Array.isArray(collaborators) ? collaborators : existingTaskList.collaborators,
          updatedAt: new Date()
        } as any),
        include: { template: true }
      })
    } else {
      // Create new TaskList
      taskList = await prisma.taskList.create({
        data: ({
          role: role,
          name: name,
          budget: budget,
          dueDate: dueDate,
          visibility: 'PRIVATE',
          owners: [user.id],
          templateTasks: tasks,
          tasks: tasks,
          templateId: templateId,
          collaborators: Array.isArray(collaborators) ? collaborators : [],
          managers: []
        } as any),
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
