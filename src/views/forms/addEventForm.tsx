'use client'

import React, { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'
import {
  AttachmentPicker,
  commitAttachmentToEntity,
  type PickedAttachment
} from '@/components/attachmentPicker'
import { PlacePicker, type PlaceLocation } from '@/components/placePicker'
import type { EventManage } from '@/views/be/eventTypes'

/**
 * Create event dialog (Phase 8): name, summary, description, date/time +
 * timezone, online toggle/URL, venue (Google Places search with geopos),
 * capacity, visibility, owner selector (Me / orgs), cover/flier images.
 * Creates a DRAFT and/or publishes directly — a failed publish keeps the
 * dialog open with the draft saved so the fields can be fixed and retried.
 */
export const AddEventForm = ({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (event: EventManage) => Promise<void> | void
}) => {
  const { t } = useI18n()

  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [isOnline, setIsOnline] = useState(false)
  const [onlineUrl, setOnlineUrl] = useState('')
  const [venue, setVenue] = useState<PlaceLocation | null>(null)
  const [capacity, setCapacity] = useState('')
  const [visibility, setVisibility] = useState('PUBLIC')
  const [ownerOrgId, setOwnerOrgId] = useState('')
  const [cover, setCover] = useState<PickedAttachment[]>([])
  const [flier, setFlier] = useState<PickedAttachment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Draft created by a failed publish attempt — retries reuse it instead of
  // creating duplicates.
  const createdRef = useRef<{ id: string; event: EventManage } | null>(null)
  // Media commit bookkeeping: maps an upload key to its committed document id
  // so retries never commit the same object twice.
  const mediaRef = useRef<{
    cover: { key: string | null; id: string | null }
    flier: { key: string | null; id: string | null }
  }>({
    cover: { key: null, id: null },
    flier: { key: null, id: null }
  })

  const { data: orgsData } = useSWR<{ orgs: Array<{ id: string; username: string; viewerRole: string }> }>(
    open ? '/api/v1/orgs' : null,
    jsonFetcher,
    { revalidateOnFocus: false }
  )
  const orgs = (orgsData?.orgs || []).filter((o) => ['OWNER', 'ADMIN', 'MANAGER'].includes(o.viewerRole))

  useEffect(() => {
    if (open) {
      setName('')
      setSummary('')
      setDescription('')
      setStartsAt('')
      setEndsAt('')
      setTimezone('UTC')
      setIsOnline(false)
      setOnlineUrl('')
      setVenue(null)
      setCapacity('')
      setVisibility('PUBLIC')
      setOwnerOrgId('')
      setCover([])
      setFlier([])
      setIsSubmitting(false)
      setIsPublishing(false)
      setError(null)
      createdRef.current = null
      mediaRef.current = {
        cover: { key: null, id: null },
        flier: { key: null, id: null }
      }
    }
  }, [open])

  const buildFields = (): Record<string, unknown> => ({
    name: name.trim(),
    summary: summary.trim() || null,
    description: description.trim() || null,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    timezone,
    isOnline,
    onlineUrl: isOnline ? onlineUrl.trim() || null : null,
    location: isOnline
      ? null
      : venue
        ? { name: venue.name, address: venue.address, lat: venue.lat, lng: venue.lng }
        : null,
    venueName: isOnline ? null : venue?.name ?? null,
    capacity: capacity ? parseInt(capacity, 10) || null : null,
    visibility,
    ...(ownerOrgId ? { ownerType: 'ORG', orgId: ownerOrgId } : {})
  })

  const commitOne = async (
    list: PickedAttachment[],
    role: 'cover' | 'flier',
    eventId: string
  ): Promise<string | null> => {
    const pending = list.filter((a) => !a.documentId)
    const ids = await Promise.all(
      pending.map((a) =>
        commitAttachmentToEntity(a, 'event', eventId, role).catch((uploadError) => {
          console.error('Error committing event attachment:', uploadError)
          return null
        })
      )
    )
    return ids.find((id): id is string => Boolean(id)) ?? null
  }

  const resolveMediaIds = async (
    eventId: string
  ): Promise<{ coverDocumentId: string | null; flierDocumentId: string | null }> => {
    const resolveOne = async (list: PickedAttachment[], slot: 'cover' | 'flier'): Promise<string | null> => {
      const ref = mediaRef.current[slot]
      if (list.length === 0) {
        ref.key = null
        ref.id = null
        return null
      }
      const item = list[0]
      if (item.documentId) {
        ref.key = item.key
        ref.id = item.documentId
        return item.documentId
      }
      // Same upload committed on a previous attempt — reuse its document id.
      if (ref.id && ref.key === item.key) return ref.id
      const id = await commitOne(list, slot, eventId)
      ref.key = item.key
      ref.id = id
      return id
    }
    return {
      coverDocumentId: await resolveOne(cover, 'cover'),
      flierDocumentId: await resolveOne(flier, 'flier')
    }
  }

  /** Creates the draft on first call; later calls update the same draft. */
  const ensureCreated = async (): Promise<EventManage> => {
    let id: string
    let base: EventManage
    if (createdRef.current) {
      id = createdRef.current.id
      base = createdRef.current.event
    } else {
      const res = await fetch('/api/v1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildFields())
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to create event')
      }
      base = ((await res.json()) as { event: EventManage }).event
      id = base.id
    }

    const media = await resolveMediaIds(id)
    const putRes = await fetch(`/api/v1/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...buildFields(), ...media })
    })
    const final = putRes.ok ? ((await putRes.json()) as { event: EventManage }).event : base
    createdRef.current = { id, event: final }
    return final
  }

  const handleCreateDraft = async () => {
    if (!name.trim() || !startsAt || isSubmitting || isPublishing) return
    setIsSubmitting(true)
    setError(null)
    try {
      const final = await ensureCreated()
      onOpenChange(false)
      await onCreated(final)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create event')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateAndPublish = async () => {
    if (!name.trim() || !startsAt || isSubmitting || isPublishing) return
    setIsPublishing(true)
    setError(null)
    try {
      const draft = await ensureCreated()
      const res = await fetch(`/api/v1/events/${draft.id}/publish`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(
          `${data?.error || 'Failed to publish event'} ${t('events.form.draftSaved', {
            defaultValue: 'A draft was saved — fix the fields above and try publishing again.'
          })}`
        )
      }
      const published = (data as { event: EventManage }).event
      onOpenChange(false)
      await onCreated(published)
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Failed to publish event')
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-w-[90vw] max-h-[85vh] z-[9980] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('events.create', { defaultValue: 'New event' })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          <div>
            <Label htmlFor="event-name">{t('events.form.name', { defaultValue: 'Name' })}</Label>
            <Input id="event-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('events.form.namePlaceholder', { defaultValue: 'Event name...' })} />
          </div>
          <div>
            <Label htmlFor="event-summary">{t('events.form.summary', { defaultValue: 'Summary (one-liner)' })}</Label>
            <Input id="event-summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="event-description">{t('events.form.description', { defaultValue: 'Description' })}</Label>
            <textarea
              id="event-description"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[70px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="event-start">{t('events.form.startsAt', { defaultValue: 'Starts at' })}</Label>
              <Input id="event-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="flex-1">
              <Label htmlFor="event-end">{t('events.form.endsAt', { defaultValue: 'Ends at (optional)' })}</Label>
              <Input id="event-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="event-timezone">{t('events.form.timezone', { defaultValue: 'Timezone (IANA)' })}</Label>
            <Input id="event-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/Sao_Paulo" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <Label htmlFor="event-online" className="text-sm">{t('events.form.online', { defaultValue: 'Online event' })}</Label>
            <Switch id="event-online" checked={isOnline} onCheckedChange={(checked) => setIsOnline(checked === true)} />
          </div>
          {isOnline ? (
            <div>
              <Label htmlFor="event-online-url">{t('events.form.onlineUrl', { defaultValue: 'Online URL' })}</Label>
              <Input id="event-online-url" value={onlineUrl} onChange={(e) => setOnlineUrl(e.target.value)} placeholder="https://" />
            </div>
          ) : (
            <div>
              <Label>{t('events.form.venue', { defaultValue: 'Venue name' })}</Label>
              <PlacePicker value={venue} onChange={setVenue} inlineResults />
            </div>
          )}
          <div>
            <Label htmlFor="event-capacity">{t('events.form.capacity', { defaultValue: 'Capacity (optional)' })}</Label>
            <Input id="event-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="event-visibility">{t('events.form.visibility', { defaultValue: 'Visibility' })}</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger id="event-visibility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['PUBLIC', 'PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS'].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {orgs.length > 0 && (
            <div>
              <Label htmlFor="event-owner">{t('events.form.owner', { defaultValue: 'Owner' })}</Label>
              <Select value={ownerOrgId} onValueChange={setOwnerOrgId}>
                <SelectTrigger id="event-owner" className="w-full">
                  <SelectValue placeholder={t('events.form.ownerMe', { defaultValue: 'Me' })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('events.form.ownerMe', { defaultValue: 'Me' })}</SelectItem>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>@{o.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('events.form.cover', { defaultValue: 'Cover image' })}</Label>
              <AttachmentPicker
                entityType="event"
                entityId={null}
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
                entityId={null}
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
        <div className="flex gap-2 pt-2">
          <Button onClick={handleCreateAndPublish} disabled={!name.trim() || !startsAt || isSubmitting || isPublishing} size="sm">
            {t('events.form.publish', { defaultValue: 'Publish' })}
          </Button>
          <Button onClick={handleCreateDraft} disabled={!name.trim() || !startsAt || isSubmitting || isPublishing} size="sm" variant="outline">
            {t('events.form.createButton', { defaultValue: 'Create draft' })}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} size="sm" className="ml-auto">
            {t('events.form.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
