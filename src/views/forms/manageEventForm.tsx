'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/contexts/i18n'
import {
  AttachmentPicker,
  attachmentFileUrl,
  type PickedAttachment
} from '@/components/attachmentPicker'
import type { EventManage } from '@/views/be/eventTypes'

/** ISO instant → `datetime-local` value (browser-local; inverse of the create form). */
function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Existing media id → a done picker descriptor (renders via the media pipe). */
function seedMedia(documentId: string | null | undefined, label: string): PickedAttachment[] {
  if (!documentId) return []
  return [
    {
      key: documentId,
      publicUrl: attachmentFileUrl(documentId),
      fileName: label,
      mimeType: 'image/*',
      kind: 'image',
      size: 0,
      documentId
    }
  ]
}

/**
 * Manage event dialog (Phase 8): edit the draft's profile (incl. cover/flier
 * images), publish to the selected audience, or delete/cancel. Auto-opened on
 * the new draft after creation and from the Mine/Org tab cards.
 */
export const ManageEventForm = ({
  open,
  onOpenChange,
  event,
  onChanged,
  onDeleted
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: EventManage | null
  onChanged: (event: EventManage) => Promise<void> | void
  onDeleted: () => Promise<void> | void
}) => {
  const { locale } = useParams<{ locale: string }>()
  const { t } = useI18n()

  const [current, setCurrent] = useState<EventManage | null>(null)

  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [isOnline, setIsOnline] = useState(false)
  const [onlineUrl, setOnlineUrl] = useState('')
  const [venueName, setVenueName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [visibility, setVisibility] = useState('PUBLIC')
  const [cover, setCover] = useState<PickedAttachment[]>([])
  const [flier, setFlier] = useState<PickedAttachment[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !event) return
    setCurrent(event)
    setName(event.name ?? '')
    setSummary(event.summary ?? '')
    setDescription(event.description ?? '')
    setStartsAt(toDatetimeLocalValue(event.startsAt))
    setEndsAt(toDatetimeLocalValue(event.endsAt))
    setTimezone(event.timezone || 'UTC')
    setIsOnline(event.isOnline === true)
    setOnlineUrl(event.onlineUrl ?? '')
    setVenueName(event.venueName ?? '')
    setCapacity(event.capacity != null ? String(event.capacity) : '')
    setVisibility(event.visibility ?? 'PUBLIC')
    setCover(seedMedia(event.coverDocumentId, 'cover'))
    setFlier(seedMedia(event.flierDocumentId, 'flier'))
    setIsSaving(false)
    setIsPublishing(false)
    setError(null)
  }, [open, event])

  const buildBody = (): Record<string, unknown> => ({
    name: name.trim(),
    summary: summary.trim() || null,
    description: description.trim() || null,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    timezone,
    isOnline,
    onlineUrl: isOnline ? onlineUrl.trim() || null : null,
    location: isOnline ? null : venueName.trim() ? { name: venueName.trim() } : null,
    venueName: isOnline ? null : venueName.trim() || null,
    capacity: capacity ? parseInt(capacity, 10) || null : null,
    visibility,
    coverDocumentId: cover[0]?.documentId ?? null,
    flierDocumentId: flier[0]?.documentId ?? null
  })

  const handleSave = async () => {
    if (!current || !name.trim() || !startsAt || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/events/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody())
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to save event')
      }
      const saved = ((await res.json()) as { event: EventManage }).event
      setCurrent(saved)
      await onChanged(saved)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save event')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!current || isPublishing) return
    setIsPublishing(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/events/${current.id}/publish`, {
        method: 'POST'
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to publish event')
      }
      const published = (data as { event: EventManage }).event
      setCurrent(published)
      await onChanged(published)
      toast.success(t('events.manage.published', { defaultValue: 'Event published' }), {
        description: (
          <Link href={`/${locale}/event/${published.publicUrl}`} className="underline">
            {t('events.manage.view', { defaultValue: 'View event' })}
          </Link>
        )
      })
      onOpenChange(false)
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Failed to publish event')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDelete = async () => {
    if (!current) return
    if (
      !window.confirm(
        t('events.manage.confirmDelete', {
          defaultValue:
            'Delete this event? Drafts are removed permanently; published events are cancelled.'
        })
      )
    ) {
      return
    }
    try {
      const res = await fetch(`/api/v1/events/${current.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to delete event')
      }
      await onDeleted()
      onOpenChange(false)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete event')
    }
  }

  const busy = isSaving || isPublishing

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {current && (
        <DialogContent className="w-[560px] max-w-[90vw] max-h-[85vh] z-[9985] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>{t('events.manage.title', { defaultValue: 'Manage event' })}</DialogTitle>
              <Badge variant={current.status === 'PUBLISHED' ? 'default' : 'secondary'}>
                {current.status ?? 'DRAFT'}
              </Badge>
            </div>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            <div>
              <Label htmlFor="manage-event-name">{t('events.form.name', { defaultValue: 'Name' })}</Label>
              <Input id="manage-event-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="manage-event-summary">{t('events.form.summary', { defaultValue: 'Summary (one-liner)' })}</Label>
              <Input id="manage-event-summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="manage-event-description">{t('events.form.description', { defaultValue: 'Description' })}</Label>
              <textarea
                id="manage-event-description"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[70px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="manage-event-start">{t('events.form.startsAt', { defaultValue: 'Starts at' })}</Label>
                <Input id="manage-event-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="flex-1">
                <Label htmlFor="manage-event-end">{t('events.form.endsAt', { defaultValue: 'Ends at (optional)' })}</Label>
                <Input id="manage-event-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="manage-event-timezone">{t('events.form.timezone', { defaultValue: 'Timezone (IANA)' })}</Label>
              <Input id="manage-event-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/Sao_Paulo" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <Label htmlFor="manage-event-online" className="text-sm">{t('events.form.online', { defaultValue: 'Online event' })}</Label>
              <Switch id="manage-event-online" checked={isOnline} onCheckedChange={(checked) => setIsOnline(checked === true)} />
            </div>
            {isOnline ? (
              <div>
                <Label htmlFor="manage-event-online-url">{t('events.form.onlineUrl', { defaultValue: 'Online URL' })}</Label>
                <Input id="manage-event-online-url" value={onlineUrl} onChange={(e) => setOnlineUrl(e.target.value)} placeholder="https://" />
              </div>
            ) : (
              <div>
                <Label htmlFor="manage-event-venue">{t('events.form.venue', { defaultValue: 'Venue name' })}</Label>
                <Input id="manage-event-venue" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
              </div>
            )}
            <div>
              <Label htmlFor="manage-event-capacity">{t('events.form.capacity', { defaultValue: 'Capacity (optional)' })}</Label>
              <Input id="manage-event-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="manage-event-visibility">{t('events.form.visibility', { defaultValue: 'Visibility' })}</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger id="manage-event-visibility" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['PUBLIC', 'PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS'].map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t('events.form.cover', { defaultValue: 'Cover image' })}</Label>
                <AttachmentPicker
                  entityType="event"
                  entityId={current.id}
                  role="cover"
                  kind="image"
                  max={1}
                  compact
                  value={cover}
                  onChange={setCover}
                />
              </div>
              <div>
                <Label>{t('events.form.flier', { defaultValue: 'Flier image' })}</Label>
                <AttachmentPicker
                  entityType="event"
                  entityId={current.id}
                  role="flier"
                  kind="image"
                  max={1}
                  compact
                  value={flier}
                  onChange={setFlier}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {current.status !== 'PUBLISHED' && current.status !== 'CANCELLED' && (
              <Button onClick={handlePublish} disabled={!name.trim() || !startsAt || busy} size="sm">
                {t('events.manage.publish', { defaultValue: 'Publish' })}
              </Button>
            )}
            <Button onClick={handleSave} disabled={!name.trim() || !startsAt || busy} size="sm" variant="outline">
              {t('events.manage.save', { defaultValue: 'Save' })}
            </Button>
            <Button onClick={handleDelete} disabled={busy} size="sm" variant="destructive">
              {t('events.manage.delete', { defaultValue: 'Delete event' })}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} size="sm" className="ml-auto">
              {t('events.form.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
