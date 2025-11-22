'use client'

import React, { useState, useContext, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'

export const AddTaskForm = ({
  selectedTaskListId,
  onCancel,
  onCreated
}: {
  selectedTaskListId?: string
  onCancel: () => void
  onCreated: () => Promise<void> | void
}) => {
  const { t } = useI18n()
  const [newTask, setNewTask] = useState({ name: '', area: 'self', category: 'custom', saveToTemplate: false, times: 1 })
  const { taskLists } = useContext(GlobalContext)
  const allTaskLists = useMemo(() => (Array.isArray(taskLists) ? taskLists : []), [taskLists])
  const selectedList = useMemo(() => allTaskLists.find((l:any) => l.id === selectedTaskListId), [allTaskLists, selectedTaskListId])

  const handleSubmit = async () => {
    if (!selectedTaskListId || !newTask.name.trim()) return
    const baseTask = {
      name: newTask.name.trim(),
      area: newTask.area,
      categories: [newTask.category],
      cadence: 'day',
      status: 'open',
      times: Math.max(1, Number(newTask.times) || 1),
      count: 0,
    }

    if (newTask.saveToTemplate && selectedList) {
      const blueprint = (Array.isArray((selectedList as any).tasks) && (selectedList as any).tasks.length > 0)
        ? (selectedList as any).tasks
        : ((selectedList as any).templateTasks || [])
      const updatedTasks = [ { ...baseTask }, ...(blueprint || []) ]
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          taskListId: selectedTaskListId,
          create: false,
          role: (selectedList as any).role, 
          tasks: updatedTasks 
        })
      })
    } else {
      const ephemeralTask = { ...baseTask, isEphemeral: true, createdAt: new Date().toISOString() }
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskListId: selectedTaskListId, ephemeralTasks: { add: ephemeralTask } })
      })
    }
    await onCreated()
    onCancel()
  }

  return (
    <Card className="mb-2 p-4">
      <CardHeader>
        <CardTitle className="text-sm">{t('forms.addTaskForm.title') || 'Add Custom Task'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="task-name">{t('forms.addTaskForm.taskNameLabel') || 'Task Name'}</Label>
          <Input
            id="task-name"
            type="text"
            value={newTask.name}
            onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
            placeholder={t('forms.addTaskForm.taskNamePlaceholder') || 'Enter task name...'}
          />
        </div>
        <div>
          <Label htmlFor="task-area">{t('forms.addTaskForm.areaLabel') || 'Area'}</Label>
          <Select value={newTask.area} onValueChange={(val) => setNewTask(prev => ({ ...prev, area: val }))}>
            <SelectTrigger className="w-full" id="task-area">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="self">{t('forms.commonOptions.area.self') || 'Self'}</SelectItem>
              <SelectItem value="social">{t('forms.commonOptions.area.social') || 'Social'}</SelectItem>
              <SelectItem value="home">{t('forms.commonOptions.area.home') || 'Home'}</SelectItem>
              <SelectItem value="work">{t('forms.commonOptions.area.work') || 'Work'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="task-category">{t('forms.addTaskForm.categoryLabel') || 'Category'}</Label>
          <Select value={newTask.category} onValueChange={(val) => setNewTask(prev => ({ ...prev, category: val }))}>
            <SelectTrigger className="w-full" id="task-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">{t('forms.commonOptions.category.custom') || 'Custom'}</SelectItem>
              <SelectItem value="body">{t('forms.commonOptions.category.body') || 'Body'}</SelectItem>
              <SelectItem value="mind">{t('forms.commonOptions.category.mind') || 'Mind'}</SelectItem>
              <SelectItem value="spirit">{t('forms.commonOptions.category.spirit') || 'Spirit'}</SelectItem>
              <SelectItem value="social">{t('forms.commonOptions.category.social') || 'Social'}</SelectItem>
              <SelectItem value="work">{t('forms.commonOptions.category.work') || 'Work'}</SelectItem>
              <SelectItem value="home">{t('forms.commonOptions.category.home') || 'Home'}</SelectItem>
              <SelectItem value="fun">{t('forms.commonOptions.category.fun') || 'Fun'}</SelectItem>
              <SelectItem value="growth">{t('forms.commonOptions.category.growth') || 'Growth'}</SelectItem>
              <SelectItem value="community">{t('forms.commonOptions.category.community') || 'Community'}</SelectItem>
              <SelectItem value="affection">{t('forms.commonOptions.category.affection') || 'Affection'}</SelectItem>
              <SelectItem value="clean">{t('forms.commonOptions.category.clean') || 'Clean'}</SelectItem>
              <SelectItem value="maintenance">{t('forms.commonOptions.category.maintenance') || 'Maintenance'}</SelectItem>
              <SelectItem value="spirituality">{t('forms.commonOptions.category.spirituality') || 'Spirituality'}</SelectItem>
              <SelectItem value="event">{t('forms.commonOptions.category.event') || 'Event'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="task-times">{t('forms.addTaskForm.timesLabel') || '# of times'}</Label>
          <Input
            id="task-times"
            type="number"
            min={1}
            value={newTask.times}
            onChange={(e) => setNewTask(prev => ({ ...prev, times: e.target.value }))}
          />
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="save-to-template"
            checked={newTask.saveToTemplate}
            onCheckedChange={(checked) => setNewTask(prev => ({ ...prev, saveToTemplate: checked }))}
          />
          <Label htmlFor="save-to-template">
            {t('forms.addTaskForm.saveToTemplate') || 'Save task to template'}
          </Label>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={!newTask.name.trim()} size="sm">{t('forms.addTaskForm.addTask') || 'Add Task'}</Button>
          <Button variant="outline" onClick={onCancel} size="sm">{t('forms.addTaskForm.cancel') || 'Cancel'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}


