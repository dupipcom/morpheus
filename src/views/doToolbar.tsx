'use client'

import React, { useMemo, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useI18n } from '@/lib/contexts/i18n'
import { Plus, Settings as SettingsIcon, Pencil } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'

type TaskList = { id: string; name?: string; role?: string }

export const DoToolbar = ({
  locale,
  allTaskLists,
  selectedTaskListId,
  onChangeSelectedTaskListId,
  onAddEphemeral,
  refreshLists,
}: {
  locale: string
  allTaskLists: TaskList[]
  selectedTaskListId?: string
  onChangeSelectedTaskListId: (id: string) => void
  onAddEphemeral: () => Promise<void> | void
  refreshLists: () => Promise<any>
}) => {
  const { t } = useI18n()
  const selectedList = useMemo(() => allTaskLists.find((l:any) => l.id === selectedTaskListId), [allTaskLists, selectedTaskListId])

  const [showAddTask, setShowAddTask] = useState(false)
  const [showAddList, setShowAddList] = useState(false)
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [isEditingList, setIsEditingList] = useState(false)

  const [newTaskName, setNewTaskName] = useState('')
  const [listName, setListName] = useState('')
  const [listBudget, setListBudget] = useState('')
  const [listDueDate, setListDueDate] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateFromCurrent, setTemplateFromCurrent] = useState(true)

  const closeAll = () => {
    setShowAddTask(false)
    setShowAddList(false)
    setShowAddTemplate(false)
  }

  const handleOpenEditList = () => {
    if (!selectedList) return
    setIsEditingList(true)
    setListName(selectedList.name || '')
    setListBudget((selectedList as any).budget || '')
    setListDueDate((selectedList as any).dueDate || '')
    setShowAddList(true)
  }

  const submitNewTask = async () => {
    if (!selectedTaskListId || !newTaskName.trim()) return
    await fetch('/api/v1/tasklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskListId: selectedTaskListId,
        ephemeralTasks: { add: { name: newTaskName.trim(), cadence: 'day' } }
      })
    })
    setNewTaskName('')
    setShowAddTask(false)
    await refreshLists()
  }

  const submitList = async () => {
    // If editing, update by role + tasks passthrough
    if (isEditingList && selectedList) {
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        body: JSON.stringify({
          role: (selectedList as any).role,
          tasks: (selectedList as any).tasks,
          templateId: (selectedList as any).templateId,
          name: listName || undefined,
          budget: listBudget || undefined,
          dueDate: listDueDate || undefined
        })
      })
      setIsEditingList(false)
    } else {
      // Create a simple custom list
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        body: JSON.stringify({
          create: true,
          role: 'one-off.custom',
          name: listName || undefined,
          budget: listBudget || undefined,
          dueDate: listDueDate || undefined,
          tasks: []
        })
      })
    }
    setListName('')
    setListBudget('')
    setListDueDate('')
    setShowAddList(false)
    await refreshLists()
  }

  const submitTemplate = async () => {
    if (!templateName.trim()) return
    const tasks = (templateFromCurrent && selectedList && Array.isArray((selectedList as any).tasks))
      ? (selectedList as any).tasks
      : []
    await fetch('/api/v1/templates', {
      method: 'POST',
      body: JSON.stringify({ name: templateName.trim(), tasks, visibility: 'PRIVATE' })
    })
    setTemplateName('')
    setTemplateFromCurrent(true)
    setShowAddTemplate(false)
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={selectedTaskListId} onValueChange={onChangeSelectedTaskListId}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder={t('tasks.selectList') || 'Select list'} />
          </SelectTrigger>
          <SelectContent>
            {allTaskLists.map((tl:any) => (
              <SelectItem key={tl.id} value={tl.id}>
                {tl.name || tl.role || tl.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { closeAll(); setShowAddTask(true) }}>
                {t('common.newTask') || 'New task'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { closeAll(); setIsEditingList(false); setShowAddList(true) }}>
                {t('common.newList') || 'New list'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { closeAll(); setShowAddTemplate(true) }}>
                {t('common.newTemplate') || 'New template'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            className="flex items-center text-muted-foreground hover:text-foreground"
            onClick={handleOpenEditList}
            disabled={!selectedList}
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button asChild variant="ghost" size="sm" className="flex items-center text-muted-foreground hover:text-foreground">
            <Link href={`/${locale}/app/settings`}>
              <SettingsIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {(selectedList as any)?.budget || (selectedList as any)?.dueDate ? (
        <div className="flex items-center gap-2">
          {(selectedList as any)?.budget && (
            <Badge variant="secondary">Budget: {(selectedList as any).budget}</Badge>
          )}
          {(selectedList as any)?.dueDate && (
            <Badge variant="secondary">Due: {(selectedList as any).dueDate}</Badge>
          )}
        </div>
      ) : null}

      {showAddTask && (
        <div className="flex items-center gap-2">
          <input
            className="w-full p-2 border rounded-md"
            placeholder={t('tasks.taskName') || 'Task name'}
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
          />
          <Button size="sm" onClick={submitNewTask} disabled={!newTaskName.trim()}>
            {t('common.add') || 'Add'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAddTask(false)}>
            {t('common.cancel') || 'Cancel'}
          </Button>
        </div>
      )}

      {showAddList && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-sm font-medium">{t('common.name') || 'Name'}</label>
            <input className="w-full p-2 border rounded-md" value={listName} onChange={(e) => setListName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">{t('tasks.budget') || 'Budget'}</label>
            <input className="w-full p-2 border rounded-md" value={listBudget} onChange={(e) => setListBudget(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">{t('tasks.dueDate') || 'Due date'}</label>
            <input type="date" className="w-full p-2 border rounded-md" value={listDueDate} onChange={(e) => setListDueDate(e.target.value)} />
          </div>
          <div className="md:col-span-3 flex gap-2">
            <Button size="sm" onClick={submitList} disabled={!listName.trim()}>
              {isEditingList ? (t('common.save') || 'Save') : (t('common.create') || 'Create')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowAddList(false); setIsEditingList(false) }}>
              {t('common.cancel') || 'Cancel'}
            </Button>
          </div>
        </div>
      )}

      {showAddTemplate && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-sm font-medium">{t('common.name') || 'Name'}</label>
            <input className="w-full p-2 border rounded-md" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 mt-6">
            <input id="from-current" type="checkbox" checked={templateFromCurrent} onChange={(e) => setTemplateFromCurrent(e.target.checked)} />
            <label htmlFor="from-current" className="text-sm">{t('tasks.createFromCurrent') || 'Use current list tasks'}</label>
          </div>
          <div className="md:col-span-3 flex gap-2">
            <Button size="sm" onClick={submitTemplate} disabled={!templateName.trim()}>
              {t('common.create') || 'Create'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddTemplate(false)}>
              {t('common.cancel') || 'Cancel'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}


