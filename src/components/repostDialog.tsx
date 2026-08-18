'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/contexts/i18n'

/**
 * Source of a repost: any activity item the feed renders. Only the reference
 * ids travel into the new Note — never documents, geo or other metadata.
 */
export interface RepostSource {
  type: string
  id: string
  name?: string
  eventIds?: string[] | null
  listIds?: string[] | null
  taskIds?: string[] | null
  profileIds?: string[] | null
}

/**
 * Repost dialog: turns an activity (note/event/list/task/template) into a new
 * Note carrying reference ids. The comment is optional — a pure reference
 * share is allowed by the notes API.
 */
export function RepostDialog({
  open,
  onOpenChange,
  source,
  onReposted
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: RepostSource | null
  onReposted: () => Promise<void> | void
}) {
  const { t } = useI18n()

  const [comment, setComment] = useState('')
  const [visibility, setVisibility] = useState('FRIENDS')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setComment('')
      setVisibility('FRIENDS')
      setIsSubmitting(false)
      setError(null)
    }
  }, [open])

  const buildRefs = (): Record<string, string[] | undefined> => {
    if (!source) return {}
    switch (source.type) {
      case 'event':
        return { eventIds: [source.id] }
      case 'tasklist':
      case 'list':
        return { listIds: [source.id] }
      case 'task':
        return { taskIds: [source.id] }
      case 'note':
      case 'template':
      default:
        // Notes/templates have no forward reference of their own: share the
        // references they carried (event/list/task/profile tags).
        return {
          eventIds: source.eventIds && source.eventIds.length > 0 ? source.eventIds : undefined,
          listIds: source.listIds && source.listIds.length > 0 ? source.listIds : undefined,
          taskIds: source.taskIds && source.taskIds.length > 0 ? source.taskIds : undefined,
          profileIds: source.profileIds && source.profileIds.length > 0 ? source.profileIds : undefined
        }
    }
  }

  const handleSubmit = async () => {
    if (!source || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: comment.trim(),
          visibility,
          ...buildRefs()
        })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to repost')
      }
      onOpenChange(false)
      toast.success(t('repost.success', { defaultValue: 'Reposted successfully' }))
      await onReposted()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to repost')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-w-[90vw] z-[9985]">
        <DialogHeader>
          <DialogTitle>
            {t('repost.title', { defaultValue: 'Repost' })}
            {source?.name ? ` — ${source.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <textarea
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[70px]"
            placeholder={t('repost.placeholder', { defaultValue: 'Add a comment (optional)...' })}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div>
            <Label>{t('events.form.visibility', { defaultValue: 'Visibility' })}</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['PUBLIC', 'FRIENDS', 'CLOSE_FRIENDS', 'PRIVATE'].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={isSubmitting} size="sm">
              {t('repost.submit', { defaultValue: 'Repost' })}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} size="sm">
              {t('events.form.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
