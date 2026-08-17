'use client'

import { useState, useEffect, useContext, useMemo, useRef, useSyncExternalStore } from 'react'
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useI18n } from "@/lib/contexts/i18n"
import { useNotesRefresh } from "@/lib/contexts/notesRefresh"
import { GlobalContext } from "@/lib/contexts"
import { Send, Loader2, Paperclip, MapPin, Users, ListChecks, CheckSquare, Calendar, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { VisibilitySelect } from "@/components/visibilitySelect"
import { DatePickerButton } from "@/components/ui/datePickerButton"
import { LinkPreview } from "@/components/linkPreview"
import { extractUrls } from "@/lib/utils/linkPreview"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { AttachmentPicker, attachmentFileUrl, type PickedAttachment } from "@/components/attachmentPicker"
import { PlacePicker, type PlaceLocation } from "@/components/placePicker"
import { EntityTagPicker, type EntityTag } from "@/components/entityTagPicker"
import {
  subscribeEditingNote,
  getEditingNote,
  clearEditNote
} from "@/lib/editNoteStore"

interface PublishNoteProps {
  onNotePublished?: () => void
  date?: string
  onDateChange?: (date: Date | undefined) => void
  defaultVisibility?: string
  recipientId?: string | null
  recipientLabel?: string | null
}


export const PublishNote = ({ onNotePublished, date, onDateChange, defaultVisibility, recipientId = null, recipientLabel = null }: PublishNoteProps) => {
  const { t } = useI18n()
  const { refreshAll } = useNotesRefresh()
  const { selectedDate: contextSelectedDate, setSelectedDate, session } = useContext(GlobalContext)
  const [noteContent, setNoteContent] = useState('')
  // Explicit per-page prop wins, then the user's persisted default, then PRIVATE
  const [noteVisibility, setNoteVisibility] = useState(
    defaultVisibility || (session?.user as { defaultNoteVisibility?: string } | undefined)?.defaultNoteVisibility || 'PRIVATE'
  )
  const [aiEnabled, setAiEnabled] = useState(
    (session?.user as { defaultAiEnabled?: boolean } | undefined)?.defaultAiEnabled ?? false
  )
  const [isPublishing, setIsPublishing] = useState(false)
  const previewUrls = useMemo(() => extractUrls(noteContent), [noteContent])
  // Composer extensions: attachments, location, and entity tags
  const [attachments, setAttachments] = useState<PickedAttachment[]>([])
  const [location, setLocation] = useState<PlaceLocation | null>(null)
  const [profileTags, setProfileTags] = useState<EntityTag[]>([])
  const [listTags, setListTags] = useState<EntityTag[]>([])
  const [taskTags, setTaskTags] = useState<EntityTag[]>([])
  const [eventTags, setEventTags] = useState<EntityTag[]>([])
  // Which extension popover is open (attach | place | profile | list | task | event)
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  // Controlled accordion state — opens automatically when a note is handed over for editing
  const [accordionValue, setAccordionValue] = useState<string>('')
  // Full-edit mode: a note handed over from the feed (see editNoteStore).
  const editingNote = useSyncExternalStore(subscribeEditingNote, getEditingNote, () => null)
  
  // Prefill the composer when a note is handed over for editing (see
  // editNoteStore). Tag chips start with fallback labels so ids are never
  // dropped on save; resolvable labels replace them as fetches land.
  useEffect(() => {
    if (!editingNote) return
    setNoteContent(editingNote.content)
    setNoteVisibility(editingNote.visibility || 'PRIVATE')
    setAiEnabled(editingNote.aiEnabled ?? false)
    setLocation(editingNote.location || null)
    // Prefill the note's date too (local midnight — the note date is YYYY-MM-DD)
    if (editingNote.date) {
      const [year, month, day] = editingNote.date.split('-').map(Number)
      if (year && month && day) {
        setSelectedDate(new Date(year, month - 1, day))
      }
    }
    setAttachments((editingNote.documents || []).map((doc) => ({
      key: doc.id,
      publicUrl: attachmentFileUrl(doc.id),
      fileName: doc.fileName || doc.id,
      mimeType: doc.mimeType || 'application/octet-stream',
      kind: (doc.kind || 'document') as PickedAttachment['kind'],
      size: 0,
      documentId: doc.id,
      ...(doc.location ? { location: doc.location } : {})
    })))

    const fallback = (id: string) => `#${id.slice(-4)}`
    setProfileTags((editingNote.profileIds || []).map((id) => ({ id, label: fallback(id) })))
    setListTags((editingNote.listIds || []).map((id) => ({ id, label: fallback(id) })))
    setTaskTags((editingNote.taskIds || []).map((id) => ({ id, label: fallback(id) })))
    setEventTags((editingNote.eventIds || []).map((id) => ({ id, label: fallback(id) })))

    const resolveLabels = async () => {
      try {
        if (editingNote.profileIds?.length) {
          const res = await fetch(`/api/v1/profiles/by-ids?ids=${encodeURIComponent(editingNote.profileIds.join(','))}`)
          if (res.ok) {
            const data = await res.json()
            const byId = new Map<string, string>(
              (data.profiles || []).map((p: any) => [p.userId, p.userName || p.userId])
            )
            setProfileTags(editingNote.profileIds.map((id) => ({ id, label: byId.get(id) || fallback(id) })))
          }
        }
      } catch {
        // Labels stay as fallbacks
      }
      try {
        if (editingNote.listIds?.length) {
          const res = await fetch('/api/v1/tasklists')
          if (res.ok) {
            const data = await res.json()
            const byId = new Map<string, string>((data.taskLists || []).map((l: any) => [l.id, l.name || l.id]))
            setListTags(editingNote.listIds.map((id) => ({ id, label: byId.get(id) || fallback(id) })))
          }
        }
      } catch {
        // Labels stay as fallbacks
      }
      try {
        if (editingNote.eventIds?.length) {
          const res = await fetch('/api/v1/life-events')
          if (res.ok) {
            const data = await res.json()
            const byId = new Map<string, string>((data.lifeEvents || []).map((e: any) => [e.id, e.name || e.id]))
            setEventTags(editingNote.eventIds.map((id) => ({ id, label: byId.get(id) || fallback(id) })))
          }
        }
      } catch {
        // Labels stay as fallbacks
      }
    }
    resolveLabels()
  }, [editingNote])

  // Open the composer accordion whenever an edit is requested
  useEffect(() => {
    if (editingNote) {
      setAccordionValue('publish-note')
    }
  }, [editingNote])

  const cancelEditing = () => {
    clearEditNote()
    setNoteContent('')
    setAttachments([])
    setLocation(null)
    setProfileTags([])
    setListTags([])
    setTaskTags([])
    setEventTags([])
    setOpenPicker(null)
  }

  // Use ref to track if we're updating from props to prevent loops
  const isUpdatingFromProps = useRef(false)
  const hasInitializedFromProps = useRef(false)
  const writeScrollRef = useRef<HTMLDivElement | null>(null)

  // Helper to compare dates by value
  const datesEqual = (date1: Date | undefined, date2: Date | undefined): boolean => {
    if (!date1 && !date2) return true
    if (!date1 || !date2) return false
    return date1.getTime() === date2.getTime()
  }

  // Sync date prop with GlobalContext - only initialize once from props
  useEffect(() => {
    if (date && !hasInitializedFromProps.current) {
      try {
        const dateObj = new Date(date)
        if (dateObj && (!contextSelectedDate || !datesEqual(dateObj, contextSelectedDate))) {
          isUpdatingFromProps.current = true
          setSelectedDate(dateObj)
          hasInitializedFromProps.current = true
          // Reset flag after state update
          setTimeout(() => {
            isUpdatingFromProps.current = false
          }, 0)
        } else {
          hasInitializedFromProps.current = true
        }
      } catch {
        // Invalid date, ignore
        hasInitializedFromProps.current = true
      }
    }
  }, [date]) // Only depend on date prop, not context

  // Notify parent component when context date changes (for backward compatibility)
  // Skip if we're updating from props to avoid loops
  useEffect(() => {
    if (!isUpdatingFromProps.current && onDateChange && contextSelectedDate) {
      onDateChange(contextSelectedDate)
    }
  }, [contextSelectedDate]) // Only depend on contextSelectedDate to avoid loops

  /**
   * Resolve the note-level location: the explicit PlacePicker chip wins;
   * otherwise the first attachment's location (EXIF GPS opt-in or picked)
   * becomes the note's location, enriched through the Places geocode API when
   * it only carries raw coordinates.
   */
  const resolveNoteLocation = async (): Promise<PlaceLocation | null> => {
    if (location) return location
    const withLocation = attachments.find((a) => a.location)
    if (!withLocation?.location) return null
    const loc = withLocation.location
    if (loc.name || loc.address) return loc
    try {
      const res = await fetch(`/api/v1/places/geocode?lat=${loc.lat}&lng=${loc.lng}`)
      if (res.ok) {
        const data = await res.json()
        return (data?.location as PlaceLocation) || loc
      }
    } catch {
      // Fall through to the raw coordinates
    }
    return loc
  }

  const handlePublishNote = async () => {
    if (!noteContent.trim() || isPublishing) return

    setIsPublishing(true)
    try {
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const today = new Date()
      const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
      // Use context selectedDate if available, otherwise fall back to date prop or today
      // Use locale-aware formatting (same as todayDate) to avoid UTC offset causing -1 day shift
      const selectedDateForNote = contextSelectedDate 
        ? contextSelectedDate.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
        : (date || todayDate)
      const noteDate = selectedDateForNote

      // Attachments already committed elsewhere (documentId set) go in the note
      // body directly; new uploads are committed against the note after creation.
      const committedDocumentIds = attachments
        .filter((attachment) => !!attachment.documentId)
        .map((attachment) => attachment.documentId as string)

      const body: Record<string, unknown> = {
        content: noteContent.trim(),
        visibility: noteVisibility,
        aiEnabled,
        date: noteDate,
        recipientId
      }
      if (committedDocumentIds.length > 0) body.documentIds = committedDocumentIds
      // Note location: explicit chip, else enriched from the first attachment
      const noteLocation = await resolveNoteLocation()
      if (noteLocation) {
        setLocation(noteLocation)
        body.location = noteLocation
      }
      if (profileTags.length > 0) body.profileIds = profileTags.map((tag) => tag.id)
      if (listTags.length > 0) body.listIds = listTags.map((tag) => tag.id)
      if (taskTags.length > 0) body.taskIds = taskTags.map((tag) => tag.id)
      if (eventTags.length > 0) body.eventIds = eventTags.map((tag) => tag.id)

      const editing = editingNote
      const response = await fetch(editing ? `/api/v1/notes/${editing.id}` : '/api/v1/notes', {
        method: editing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        // Create-flow only: commit new uploads against the created note. The
        // attachments API links the document (pushes documentIds into the
        // note), so no follow-up PATCH is needed. In edit mode the picker
        // commits against the existing note id directly. Failures only break
        // the attachment, never the note itself.
        if (!editing) {
          const createdNote = await response.json().catch(() => null)
          const createdNoteId = createdNote?.note?.id as string | undefined
          if (createdNoteId) {
            await Promise.all(
              attachments
                .filter((attachment) => !attachment.documentId)
                .map(async (attachment) => {
                  try {
                    const commitResponse = await fetch('/api/v1/attachments', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      // The route requires the full descriptor (key, fileName, kind,
                      // entityType, entityId) — the picker stores it all on the
                      // pending attachment for exactly this create-flow commit.
                      body: JSON.stringify({
                        entityType: 'note',
                        entityId: createdNoteId,
                        key: attachment.key,
                        fileName: attachment.fileName,
                        kind: attachment.kind,
                        mimeType: attachment.mimeType,
                        ...(attachment.width !== undefined ? { width: attachment.width } : {}),
                        ...(attachment.height !== undefined ? { height: attachment.height } : {}),
                        ...(attachment.duration !== undefined ? { duration: attachment.duration } : {}),
                        ...(attachment.location ? { location: attachment.location } : {}),
                        ...(attachment.posterPublicUrl ? { posterUrl: attachment.posterPublicUrl } : {})
                      })
                    })
                    if (!commitResponse.ok) {
                      console.error('Error committing attachment:', await commitResponse.text())
                    }
                  } catch (error) {
                    console.error('Error committing attachment:', error)
                  }
                })
            )
          }
        }

        // Persist the AI analysis preference only if it changed
        const storedAiEnabled = (session?.user as { defaultAiEnabled?: boolean } | undefined)?.defaultAiEnabled ?? false
        if (aiEnabled !== storedAiEnabled) {
          try {
            await fetch('/api/v1/user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ defaultAiEnabled: aiEnabled })
            })
          } catch (error) {
            console.error('Error saving AI analysis preference:', error)
          }
        }
        // Clear the note content after successful publish (and exit edit mode)
        if (editing) clearEditNote()
        setNoteContent('')
        setAttachments([])
        setLocation(null)
        setProfileTags([])
        setListTags([])
        setTaskTags([])
        setEventTags([])
        // Refresh all registered note lists
        refreshAll()
        if (onNotePublished) {
          onNotePublished()
        }
      }
    } catch (error) {
      console.error('Error publishing note:', error)
    } finally {
      setIsPublishing(false)
    }
  }

  // Extension icon buttons (each opens its picker in a popover)
  const extensionIcons = (
    <>
      <Popover open={openPicker === 'attach'} onOpenChange={(open) => setOpenPicker(open ? 'attach' : null)}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="px-2" title={t('notes.extensions.attach') || 'Attachments'}>
            <Paperclip className="h-4 w-4" />
            {attachments.length > 0 && <span className="ml-1 text-xs text-muted-foreground">{attachments.length}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-3" align="start">
          <AttachmentPicker compact inlineResults entityType="note" entityId={editingNote?.id ?? undefined} kind="any" max={4} value={attachments} onChange={setAttachments} />
        </PopoverContent>
      </Popover>

      <Popover open={openPicker === 'place'} onOpenChange={(open) => setOpenPicker(open ? 'place' : null)}>
        <PopoverTrigger asChild>
          <Button type="button" variant={location ? 'secondary' : 'ghost'} size="sm" className="px-2" title={t('notes.extensions.location') || 'Location'}>
            <MapPin className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-3" align="start">
          <PlacePicker value={location} onChange={setLocation} compact inlineResults />
        </PopoverContent>
      </Popover>

      <Popover open={openPicker === 'profile'} onOpenChange={(open) => setOpenPicker(open ? 'profile' : null)}>
        <PopoverTrigger asChild>
          <Button type="button" variant={profileTags.length > 0 ? 'secondary' : 'ghost'} size="sm" className="px-2" title={t('notes.extensions.people') || 'Tag people'}>
            <Users className="h-4 w-4" />
            {profileTags.length > 0 && <span className="ml-1 text-xs text-muted-foreground">{profileTags.length}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-3" align="start">
          <EntityTagPicker kind="profile" value={profileTags} onChange={setProfileTags} />
        </PopoverContent>
      </Popover>

      <Popover open={openPicker === 'list'} onOpenChange={(open) => setOpenPicker(open ? 'list' : null)}>
        <PopoverTrigger asChild>
          <Button type="button" variant={listTags.length > 0 ? 'secondary' : 'ghost'} size="sm" className="px-2" title={t('notes.extensions.lists') || 'Tag lists'}>
            <ListChecks className="h-4 w-4" />
            {listTags.length > 0 && <span className="ml-1 text-xs text-muted-foreground">{listTags.length}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-3" align="start">
          <EntityTagPicker kind="list" value={listTags} onChange={setListTags} />
        </PopoverContent>
      </Popover>

      <Popover open={openPicker === 'task'} onOpenChange={(open) => setOpenPicker(open ? 'task' : null)}>
        <PopoverTrigger asChild>
          <Button type="button" variant={taskTags.length > 0 ? 'secondary' : 'ghost'} size="sm" className="px-2" title={t('notes.extensions.tasks') || 'Tag tasks'}>
            <CheckSquare className="h-4 w-4" />
            {taskTags.length > 0 && <span className="ml-1 text-xs text-muted-foreground">{taskTags.length}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-3" align="start">
          <EntityTagPicker kind="task" value={taskTags} onChange={setTaskTags} />
        </PopoverContent>
      </Popover>

      <Popover open={openPicker === 'event'} onOpenChange={(open) => setOpenPicker(open ? 'event' : null)}>
        <PopoverTrigger asChild>
          <Button type="button" variant={eventTags.length > 0 ? 'secondary' : 'ghost'} size="sm" className="px-2" title={t('notes.extensions.events') || 'Tag events'}>
            <Calendar className="h-4 w-4" />
            {eventTags.length > 0 && <span className="ml-1 text-xs text-muted-foreground">{eventTags.length}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-3" align="start">
          <EntityTagPicker kind="event" value={eventTags} onChange={setEventTags} />
        </PopoverContent>
      </Popover>
    </>
  )

  const formContent = (
    <>
      {recipientId && (
        <div className="mb-2">
          <label htmlFor="publish-note-recipient" className="text-xs text-muted-foreground block mb-1">
            {t('notes.recipient') || 'Recipient'}
          </label>
          <Input id="publish-note-recipient" value={recipientLabel || recipientId} readOnly />
        </div>
      )}
      <Textarea
        className="mb-3 w-full"
        placeholder={t('mood.publish.placeholder') || 'Write your note here...'}
        value={noteContent}
        onChange={(e) => {
          setNoteContent(e.target.value)
        }}
      />
      {/* Controls row: extension icons → AI toggle → visibility → publish */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {extensionIcons}
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Switch
            checked={aiEnabled}
            onCheckedChange={setAiEnabled}
          />
          <span>{t('mood.publish.enableAiAnalysis') || 'Enable AI analysis'}</span>
        </label>
        {/* Visibility + publish stay together as one group (ml-auto pushes the
            pair to the row end; they wrap as a unit, never separately). */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <VisibilitySelect
            value={noteVisibility}
            onValueChange={setNoteVisibility}
          />
          {editingNote && (
            <Button type="button" variant="ghost" size="sm" onClick={cancelEditing}>
              {t('common.cancel') || 'Cancel'}
            </Button>
          )}
          <Button
            onClick={handlePublishNote}
            disabled={!noteContent.trim() || isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="ml-1 hidden md:inline">
              {isPublishing
                ? t('mood.publish.publishing')
                : editingNote
                  ? (t('common.save') || 'Save')
                  : t('mood.publish.action')}
            </span>
          </Button>
        </div>
      </div>
      {/* Selected attachment/location/tag chips */}
      <div className="space-y-2">
        {(attachments.length > 0 || location || profileTags.length > 0 || listTags.length > 0 || taskTags.length > 0 || eventTags.length > 0) && (
          <div className="flex flex-wrap items-center gap-1">
            {attachments.map((a) => (
              <span key={a.key} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {a.fileName}
              </span>
            ))}
            {location && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {location.name || location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
                <button type="button" onClick={() => setLocation(null)} aria-label={t('components.placePicker.removeLocation') || 'Remove location'}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {[
              ...profileTags.map((tag) => ({ tag, remove: () => setProfileTags(profileTags.filter((t) => t.id !== tag.id)) })),
              ...listTags.map((tag) => ({ tag, remove: () => setListTags(listTags.filter((t) => t.id !== tag.id)) })),
              ...taskTags.map((tag) => ({ tag, remove: () => setTaskTags(taskTags.filter((t) => t.id !== tag.id)) })),
              ...eventTags.map((tag) => ({ tag, remove: () => setEventTags(eventTags.filter((t) => t.id !== tag.id)) })),
            ].map(({ tag, remove }) => (
              <span key={tag.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {tag.label}
                <button type="button" onClick={remove} aria-label={t('components.entityTagPicker.removeTag') || 'Remove tag'}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      {previewUrls.length > 0 && (
        <div className="mt-3">
          {previewUrls.map((url) => (
            <LinkPreview key={url} url={url} />
          ))}
        </div>
      )}
    </>
  )

  return (
    <div className="p-3 sm:p-4 border rounded-lg border-body w-full max-w-full sticky top-0 z-50 bg-muted backdrop-blur-sm mb-[calc(env(safe-area-inset-bottom)+16px)] md:mb-0 md:sticky md:top-4">
      <Accordion type="single" collapsible className="w-full" value={accordionValue} onValueChange={setAccordionValue}>
        <AccordionItem value="publish-note" className="border-none">
          <AccordionTrigger className="py-0 px-0 hover:no-underline">
            <div className="flex items-center justify-between w-full gap-2">
              <h3 className="text-base font-semibold text-body">{t('mood.publish.title') || 'Write'}</h3>
              <DatePickerButton />
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-3 pb-3">
            <div
              ref={writeScrollRef}
              className="overflow-y-auto overscroll-contain pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] pb-4 max-h-[320px]"
              
            >
              {formContent}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
