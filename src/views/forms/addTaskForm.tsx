'use client'

import React, { useState, useContext, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
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
          <label className="text-sm font-medium">{t('forms.addTaskForm.taskNameLabel') || 'Task Name'}</label>
          <input
            type="text"
            value={newTask.name}
            onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
            placeholder={t('forms.addTaskForm.taskNamePlaceholder') || 'Enter task name...'}
            className="w-full p-2 border rounded-md"
          />
        </div>
        <div>
          <label className="text-sm font-medium">{t('forms.addTaskForm.areaLabel') || 'Area'}</label>
          <select
            value={newTask.area}
            onChange={(e) => setNewTask(prev => ({ ...prev, area: e.target.value }))}
            className="w-full p-2 border rounded-md"
          >
            <option value="self">{t('forms.commonOptions.area.self') || 'Self'}</option>
            <option value="social">{t('forms.commonOptions.area.social') || 'Social'}</option>
            <option value="home">{t('forms.commonOptions.area.home') || 'Home'}</option>
            <option value="work">{t('forms.commonOptions.area.work') || 'Work'}</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">{t('forms.addTaskForm.categoryLabel') || 'Category'}</label>
          <select
            value={newTask.category}
            onChange={(e) => setNewTask(prev => ({ ...prev, category: e.target.value }))}
            className="w-full p-2 border rounded-md"
          >
            <option value="custom">{t('forms.commonOptions.category.custom') || 'Custom'}</option>
            <option value="body">{t('forms.commonOptions.category.body') || 'Body'}</option>
            <option value="mind">{t('forms.commonOptions.category.mind') || 'Mind'}</option>
            <option value="spirit">{t('forms.commonOptions.category.spirit') || 'Spirit'}</option>
            <option value="social">{t('forms.commonOptions.category.social') || 'Social'}</option>
            <option value="work">{t('forms.commonOptions.category.work') || 'Work'}</option>
            <option value="home">{t('forms.commonOptions.category.home') || 'Home'}</option>
            <option value="fun">{t('forms.commonOptions.category.fun') || 'Fun'}</option>
            <option value="growth">{t('forms.commonOptions.category.growth') || 'Growth'}</option>
            <option value="community">{t('forms.commonOptions.category.community') || 'Community'}</option>
            <option value="affection">{t('forms.commonOptions.category.affection') || 'Affection'}</option>
            <option value="clean">{t('forms.commonOptions.category.clean') || 'Clean'}</option>
            <option value="maintenance">{t('forms.commonOptions.category.maintenance') || 'Maintenance'}</option>
            <option value="spirituality">{t('forms.commonOptions.category.spirituality') || 'Spirituality'}</option>
            <option value="event">{t('forms.commonOptions.category.event') || 'Event'}</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">{t('forms.addTaskForm.timesLabel') || '# of times'}</label>
          <input
            type="number"
            min={1}
            value={newTask.times}
            onChange={(e) => setNewTask(prev => ({ ...prev, times: Math.max(1, Number(e.target.value) || 1) }))}
            className="w-full p-2 border rounded-md"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="save-to-template"
            checked={newTask.saveToTemplate}
            onCheckedChange={(checked) => setNewTask(prev => ({ ...prev, saveToTemplate: checked }))}
          />
          <label htmlFor="save-to-template" className="text-sm font-medium">
            {t('forms.addTaskForm.saveToTemplate') || 'Save task to template'}
          </label>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={!newTask.name.trim()} size="sm">{t('forms.addTaskForm.addTask') || 'Add Task'}</Button>
          <Button variant="outline" onClick={onCancel} size="sm">{t('forms.addTaskForm.cancel') || 'Cancel'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}


