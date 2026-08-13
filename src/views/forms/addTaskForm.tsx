'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/contexts/i18n'
import { CadencePicker } from '@/components/cadencePicker'

export const AddTaskForm = ({
  selectedTaskListId,
  onCancel,
  onCreated,
  editTask,
}: {
  selectedTaskListId?: string
  onCancel: () => void
  onCreated: () => Promise<void> | void
  editTask?: any
}) => {
  const { t } = useI18n()
  const isEditMode = !!editTask

  const [name, setName] = useState(editTask?.name || '')
  const [rrule, setRRule] = useState<string | null>(editTask?.rrule || null)
  const [times, setTimes] = useState<number>(editTask?.times || 1)
  const [premium, setPremium] = useState<string>(editTask?.premium != null ? String(editTask.premium) : '')
  const [premiumType, setPremiumType] = useState<string>(editTask?.premiumType || 'FIAT')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Sync form state when editTask changes
  useEffect(() => {
    if (editTask) {
      setName(editTask.name || '')
      setRRule(editTask.rrule || null)
      setTimes(editTask.times || 1)
      setPremium(editTask.premium != null ? String(editTask.premium) : '')
      setPremiumType(editTask.premiumType || 'FIAT')
    } else {
      setName('')
      setRRule(null)
      setTimes(1)
      setPremium('')
      setPremiumType('FIAT')
    }
  }, [editTask])

  const handleSubmit = async () => {
    if (!selectedTaskListId || !name.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const parsedPremium = premium.trim() === '' ? null : parseFloat(premium)

      if (isEditMode && editTask?.id) {
        // Update existing task via the tasks endpoint
        await fetch(`/api/v1/tasks/${editTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            rrule,
            times: Math.max(1, Number(times) || 1),
            premium: parsedPremium,
            premiumType: parsedPremium != null ? premiumType : null,
          }),
        })
      } else {
        // Create a new task; dtstart anchors the cadence at today
        const today = new Date()
        const dtstart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        await fetch('/api/v1/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            listId: selectedTaskListId,
            rrule,
            dtstart,
            times: Math.max(1, Number(times) || 1),
            premium: parsedPremium,
            premiumType: parsedPremium != null ? premiumType : null,
          }),
        })
      }

      await onCreated()
    } catch (error) {
      console.error('Error saving task:', error)
    } finally {
      setIsSubmitting(false)
      onCancel()
    }
  }

  return (
    <Card className="mb-2 p-4">
      <CardHeader>
        <CardTitle className="text-sm">
          {isEditMode
            ? (t('forms.addTaskForm.editTitle') || 'Edit Task')
            : (t('forms.addTaskForm.title') || 'Add Task')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="task-name">{t('forms.addTaskForm.taskNameLabel') || 'Task Name'}</Label>
          <Input
            id="task-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('forms.addTaskForm.taskNamePlaceholder') || 'Enter task name...'}
          />
        </div>
        <CadencePicker value={rrule} onChange={setRRule} />
        <div>
          <Label htmlFor="task-times">{t('forms.addTaskForm.timesLabel') || '# of times per day'}</Label>
          <Input
            id="task-times"
            type="number"
            min={1}
            value={times}
            onChange={(e) => setTimes(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="task-premium">{t('forms.addTaskForm.premiumLabel', { defaultValue: 'Premium (optional)' })}</Label>
          <div className="flex gap-2">
            <Input
              id="task-premium"
              type="number"
              min={0}
              step="0.01"
              className="flex-1"
              value={premium}
              placeholder="0"
              onChange={(e) => setPremium(e.target.value)}
            />
            <Select value={premiumType} onValueChange={setPremiumType}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIAT">$</SelectItem>
                <SelectItem value="PERCENT">%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {premiumType === 'PERCENT' && (
            <p className="text-xs text-muted-foreground">{t('forms.addTaskForm.premiumPercentHint', { defaultValue: 'Percent of the list budget' })}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={!name.trim() || isSubmitting} size="sm">
            {isEditMode
              ? (t('forms.addTaskForm.saveTask') || 'Save Task')
              : (t('forms.addTaskForm.addTask') || 'Add Task')}
          </Button>
          <Button variant="outline" onClick={onCancel} size="sm">{t('forms.addTaskForm.cancel') || 'Cancel'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
