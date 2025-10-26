'use client'

import React, { useContext, useMemo, useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Pencil } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { AddTaskForm } from '@/views/forms/AddTaskForm'
import { AddListForm } from '@/views/forms/AddListForm'
import { AddTemplateForm } from '@/views/forms/AddTemplateForm'

type TaskList = { id: string; name?: string; role?: string }

export const DoToolbar = ({
  locale: _locale,
  selectedTaskListId,
  onChangeSelectedTaskListId,
  onAddEphemeral: _onAddEphemeral,
}: {
  locale: string
  selectedTaskListId?: string
  onChangeSelectedTaskListId: (id: string) => void
  onAddEphemeral: () => Promise<void> | void
}) => {
  const { t } = useI18n()
  const { taskLists, refreshTaskLists } = useContext(GlobalContext)
  const allTaskLists = useMemo(() => (Array.isArray(taskLists) ? taskLists : []), [taskLists]) as TaskList[]
  const selectedList = useMemo(() => allTaskLists.find((l:any) => l.id === selectedTaskListId), [allTaskLists, selectedTaskListId])

  const [showAddTask, setShowAddTask] = useState(false)
  const [showAddList, setShowAddList] = useState(false)
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [isEditingList, setIsEditingList] = useState(false)
  const [userTemplates, setUserTemplates] = useState<any[]>([])

  const refreshTemplates = async () => {
    try {
      const res = await fetch('/api/v1/templates')
      if (res.ok) {
        const data = await res.json()
        setUserTemplates(data.templates || [])
      }
    } catch {}
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (cancelled) return
      await refreshTemplates()
    }
    run()
    return () => { cancelled = true }
  }, [])

  const closeAll = () => { setShowAddTask(false); setShowAddList(false); setShowAddTemplate(false) }

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
            onClick={() => { if (selectedList) { closeAll(); setIsEditingList(true); setShowAddList(true) } }}
            disabled={!selectedList}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showAddTask && (
        <AddTaskForm
          selectedTaskListId={selectedTaskListId}
          onCancel={() => setShowAddTask(false)}
          onCreated={refreshTaskLists}
        />
      )}

      {showAddList && (
        <AddListForm
          allTaskLists={allTaskLists}
          userTemplates={userTemplates}
          isEditing={isEditingList}
          initialList={isEditingList ? (selectedList as any) : undefined}
          onCancel={() => { setShowAddList(false); setIsEditingList(false) }}
          onCreated={refreshTaskLists}
        />
      )}

      {showAddTemplate && (
        <AddTemplateForm
          allTaskLists={allTaskLists}
          onCancel={() => setShowAddTemplate(false)}
          onCreated={async () => { await refreshTemplates(); await refreshTaskLists() }}
        />
      )}
    </div>
  )
}


