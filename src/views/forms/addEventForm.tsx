'use client'

import React, { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'

/**
 * Create event dialog (Phase 8): name, summary, description, date/time +
 * timezone, online toggle/URL, venue, capacity, visibility, owner selector
 * (Me / orgs). Publishes as DRAFT (publish happens from the manage page).
 */
export const AddEventForm = ({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => Promise<void> | void
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
  const [venueName, setVenueName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [visibility, setVisibility] = useState('PUBLIC')
  const [ownerOrgId, setOwnerOrgId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setVenueName('')
      setCapacity('')
      setVisibility('PUBLIC')
      setOwnerOrgId('')
      setIsSubmitting(false)
      setError(null)
    }
  }, [open])

  const handleSubmit = async () => {
    if (!name.trim() || !startsAt || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          summary: summary.trim() || null,
          description: description.trim() || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          timezone,
          isOnline,
          onlineUrl: isOnline ? onlineUrl.trim() || null : null,
          venueName: isOnline ? null : venueName.trim() || null,
          location: isOnline
            ? null
            : venueName.trim()
              ? { name: venueName.trim() }
              : null,
          capacity: capacity ? parseInt(capacity, 10) || null : null,
          visibility,
          ...(ownerOrgId ? { ownerType: 'ORG', orgId: ownerOrgId } : {})
        })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to create event')
      }
      onOpenChange(false)
      await onCreated()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create event')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-w-[90vw] max-h-[80vh] z-[9980] flex flex-col">
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
              <Label htmlFor="event-venue">{t('events.form.venue', { defaultValue: 'Venue name' })}</Label>
              <Input id="event-venue" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
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
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={!name.trim() || !startsAt || isSubmitting} size="sm">
            {t('events.form.createButton', { defaultValue: 'Create draft' })}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
            {t('events.form.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
