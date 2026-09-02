'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/contexts/i18n'
import { CadencePicker } from '@/components/cadencePicker'
import { Switch } from '@/components/ui/switch'

/** YYYY-MM-DD of the Monday starting the current week (local time). */
const getCurrentWeekMonday = (): string => {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Create/edit task dialog (mirrors the AddListForm dialog pattern).
 * Controlled via `open` / `onOpenChange`.
 */
export const AddTaskForm = ({
  open,
  onOpenChange,
  selectedTaskListId,
  onCreated,
  editTask,
  jobBoardEnabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTaskListId?: string
  onCreated: () => Promise<void> | void
  editTask?: any
  /** Whether the owning list has jobBoardEnabled (shows the Publish-as-job section) */
  jobBoardEnabled?: boolean
}) => {
  const { t } = useI18n()
  const isEditMode = !!editTask

  const [name, setName] = useState(editTask?.name || '')
  const [rrule, setRRule] = useState<string | null>(editTask?.rrule || null)
  const [times, setTimes] = useState<number>(editTask?.times || 1)
  const [premium, setPremium] = useState<string>(editTask?.premium != null ? String(editTask.premium) : '')
  const [premiumType, setPremiumType] = useState<string>(editTask?.premiumType || 'FIAT')
  const [redacted, setRedacted] = useState<boolean>(editTask?.redacted || false)
  // Job-post fields (active when the list has jobBoardEnabled)
  const [publishAsJob, setPublishAsJob] = useState<boolean>(editTask?.visibility === 'PUBLIC')
  const [jobDescription, setJobDescription] = useState<string>(editTask?.jobDescription || '')
  const [requirements, setRequirements] = useState<string>(editTask?.requirements || '')
  const [openings, setOpenings] = useState<number>(editTask?.openings ?? 1)
  const [applyBy, setApplyBy] = useState<string>(editTask?.applyBy || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset/sync form state whenever the dialog opens (create or edit)
  useEffect(() => {
    if (open) {
      if (editTask) {
        setName(editTask.name || '')
        setRRule(editTask.rrule || null)
        setTimes(editTask.times || 1)
        setPremium(editTask.premium != null ? String(editTask.premium) : '')
        setPremiumType(editTask.premiumType || 'FIAT')
        setRedacted(editTask.redacted || false)
        setPublishAsJob(editTask.visibility === 'PUBLIC')
        setJobDescription(editTask.jobDescription || '')
        setRequirements(editTask.requirements || '')
        setOpenings(editTask.openings ?? 1)
        setApplyBy(editTask.applyBy || '')
      } else {
        setName('')
        setRRule(null)
        setTimes(1)
        setPremium('')
        setPremiumType('FIAT')
        setRedacted(false)
        setPublishAsJob(false)
        setJobDescription('')
        setRequirements('')
        setOpenings(1)
        setApplyBy('')
      }
      setIsSubmitting(false)
    }
  }, [open, editTask])

  const handleSubmit = async () => {
    if (!selectedTaskListId || !name.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const parsedPremium = premium.trim() === '' ? null : parseFloat(premium)

      // Un-publishing a task that was a job clears the job fields (nulls);
      // editing a task that was never a job leaves them untouched (undefined,
      // dropped by JSON.stringify) so the API doesn't reject them.
      const clearingJobPost = isEditMode && editTask?.visibility === 'PUBLIC' && !publishAsJob
      const jobFields = {
        visibility: publishAsJob ? 'PUBLIC' : undefined,
        jobDescription: publishAsJob ? jobDescription : clearingJobPost ? null : undefined,
        requirements: publishAsJob ? requirements : clearingJobPost ? null : undefined,
        openings: publishAsJob ? Math.max(1, Number(openings) || 1) : clearingJobPost ? null : undefined,
        applyBy: publishAsJob && applyBy ? applyBy : clearingJobPost ? null : undefined,
      }

      if (isEditMode && editTask?.id) {
        // Update existing task via the tasks endpoint
        const editBody: Record<string, unknown> = {
          name: name.trim(),
          rrule,
          times: Math.max(1, Number(times) || 1),
          premium: parsedPremium,
          premiumType: parsedPremium != null ? premiumType : null,
          redacted,
          ...jobFields,
        }
        // Anchor a newly-set cadence at the current week's Monday when the
        // task's effective start is missing or newer: a weekly task edited
        // mid-week must appear for the whole current week instead of waiting
        // for next week's occurrence.
        if (rrule) {
          const weekMonday = getCurrentWeekMonday()
          const createdAtStart = editTask?.createdAt
            ? String(editTask.createdAt).slice(0, 10)
            : null
          const effectiveStart = editTask?.dtstart || createdAtStart
          if (!effectiveStart || effectiveStart > weekMonday) {
            editBody.dtstart = weekMonday
          }
        }
        await fetch(`/api/v1/tasks/${editTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editBody),
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
            redacted,
            ...jobFields,
          }),
        })
      }

      // Close the dialog before awaiting the refresh: the parent's onCreated
      // revalidates several SWR caches, and a slow/failed revalidation must
      // never leave the modal overlay blocking the page.
      onOpenChange(false)
      await onCreated()
    } catch (error) {
      console.error('Error saving task:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-w-[90vw] max-h-[70vh] z-[9980] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEditMode
              ? (t('forms.addTaskForm.editTitle') || 'Edit Task')
              : (t('forms.addTaskForm.title') || 'Add Task')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
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
          {jobBoardEnabled && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="task-publish-job" className="text-sm">
                    {t('forms.addTaskForm.publishAsJob', { defaultValue: 'Publish as job' })}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('forms.addTaskForm.publishAsJobHint', { defaultValue: 'Makes the task a public job post on this list\'s job board' })}
                  </p>
                </div>
                <Switch
                  id="task-publish-job"
                  checked={publishAsJob}
                  onCheckedChange={(checked) => setPublishAsJob(checked === true)}
                />
              </div>
              {publishAsJob && (
                <>
                  <div>
                    <Label htmlFor="task-job-description">{t('forms.addTaskForm.jobDescriptionLabel', { defaultValue: 'Job description' })}</Label>
                    <textarea
                      id="task-job-description"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]"
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder={t('forms.addTaskForm.jobDescriptionPlaceholder', { defaultValue: 'Describe the role, expectations, and how to apply...' })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="task-requirements">{t('forms.addTaskForm.requirementsLabel', { defaultValue: 'Requirements' })}</Label>
                    <Input
                      id="task-requirements"
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                      placeholder={t('forms.addTaskForm.requirementsPlaceholder', { defaultValue: 'Skills, tools, availability...' })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label htmlFor="task-openings">{t('forms.addTaskForm.openingsLabel', { defaultValue: 'Openings' })}</Label>
                      <Input
                        id="task-openings"
                        type="number"
                        min={1}
                        value={openings}
                        onChange={(e) => setOpenings(Math.max(1, Number(e.target.value) || 1))}
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor="task-apply-by">{t('forms.addTaskForm.applyByLabel', { defaultValue: 'Apply by (YYYY-MM-DD)' })}</Label>
                      <Input
                        id="task-apply-by"
                        type="date"
                        value={applyBy}
                        onChange={(e) => setApplyBy(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="task-redacted" className="text-sm">
                {t('tasks.markAsSensitive', { defaultValue: 'Mark as sensitive' })}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('forms.addTaskForm.sensitiveHint', { defaultValue: 'Hides the task name until you choose to reveal it' })}
              </p>
            </div>
            <Switch
              id="task-redacted"
              checked={redacted}
              onCheckedChange={(checked) => setRedacted(checked === true)}
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={!name.trim() || isSubmitting} size="sm">
            {isEditMode
              ? (t('forms.addTaskForm.saveTask') || 'Save Task')
              : (t('forms.addTaskForm.addTask') || 'Add Task')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">{t('forms.addTaskForm.cancel') || 'Cancel'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
