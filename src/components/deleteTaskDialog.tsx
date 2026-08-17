'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/contexts/i18n'

interface DeleteTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: { id?: string } | null
  date: string // YYYY-MM-DD of the currently viewed date
  onDeleted: () => Promise<void> | void
}

/**
 * Delete-task scope prompt (criterion 7):
 * - All entries: hard-delete the task and its jobs
 * - From today onwards: cancel future jobs and stop the task occurring
 * - Today only: cancel only the viewed date's jobs
 */
export const DeleteTaskDialog = ({ open, onOpenChange, task, date, onDeleted }: DeleteTaskDialogProps) => {
  const { t } = useI18n()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (scope: 'all' | 'onwards' | 'today') => {
    if (!task?.id || isDeleting) return
    setIsDeleting(true)
    try {
      const query = scope === 'all' ? '' : `?scope=${scope}&date=${date}`
      const res = await fetch(`/api/v1/tasks/${task.id}${query}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete task')
      // Close the dialog before awaiting the refresh: the parent's onDeleted
      // revalidates several SWR caches, and a slow/failed revalidation must
      // never leave the modal overlay blocking the page.
      onOpenChange(false)
      await onDeleted()
    } catch (error) {
      console.error('Error deleting task:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] max-w-[90vw] z-[9980]">
        <DialogHeader>
          <DialogTitle>{t('tasks.deleteTitle', { defaultValue: 'Delete task' })}</DialogTitle>
          <DialogDescription>
            {t('tasks.deleteDescription', { defaultValue: 'How much of this task do you want to delete?' })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            disabled={isDeleting}
            onClick={() => handleDelete('today')}
          >
            {t('tasks.deleteScopes.today', { defaultValue: 'Today only' })}
          </Button>
          <Button
            variant="outline"
            disabled={isDeleting}
            onClick={() => handleDelete('onwards')}
          >
            {t('tasks.deleteScopes.onwards', { defaultValue: 'From today onwards' })}
          </Button>
          <Button
            variant="destructive"
            disabled={isDeleting}
            onClick={() => handleDelete('all')}
          >
            {t('tasks.deleteScopes.all', { defaultValue: 'All entries' })}
          </Button>
          <Button variant="ghost" disabled={isDeleting} onClick={() => onOpenChange(false)}>
            {t('forms.addTaskForm.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
