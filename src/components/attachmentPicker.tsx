'use client'

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Film, FileText, Image as ImageIcon, Loader, MapPin, Upload, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/contexts/i18n'
import { cn } from '@/lib/utils/utils'
import { PlacePicker, type PlaceLocation } from '@/components/placePicker'
import {
  ACCEPT_BY_KIND,
  CAPS,
  COMPRESS_FAILED,
  compressImageFile,
  compressVideoFile,
  extensionOf,
  kindFromFileNameAndMime,
  preCheckFile,
  VIDEO_LOAD_ERROR_MESSAGE,
  type AttachmentKind,
} from '@/lib/utils/mediaCompression'

export type { PlaceLocation } from '@/components/placePicker'

export interface PickedAttachment {
  key: string
  publicUrl: string
  fileName: string
  mimeType: string
  kind: AttachmentKind
  size: number
  width?: number
  height?: number
  duration?: number
  posterPublicUrl?: string
  location?: PlaceLocation | null
  /** Set after POST /api/v1/attachments commits the Document; null while pending. */
  documentId?: string | null
}

export type AttachmentRole = 'cover' | 'flier' | 'evidence' | 'inline' | 'cv'

/**
 * In-app URL for a committed Document. The storage bucket is private (iDrive e2
 * requires credentials), so rendering goes through the authenticated pipe at
 * GET /api/v1/attachments/[documentId]/file. Path-relative: works on any origin.
 * (Client-safe: no storage SDK imports in this module.)
 */
export function attachmentFileUrl(documentId: string): string {
  return `/api/v1/attachments/${documentId}/file`
}

interface AttachmentPickerProps {
  entityType: 'task' | 'list' | 'job' | 'note' | 'user'
  entityId?: string | null
  kind?: AttachmentKind | 'any'
  role?: AttachmentRole
  /** Maximum number of attachments (default 4). */
  max?: number
  /** HTML accept string; defaults to the allowlist for the `kind` prop. */
  accept?: string
  /** Compact mode: a small "Add files" button instead of the drag/drop clipboard zone */
  compact?: boolean
  /** Forwarded to the embedded PlacePicker (required when this picker sits inside a Popover) */
  inlineResults?: boolean
  value: PickedAttachment[]
  onChange: (attachments: PickedAttachment[]) => void
}

/**
 * File picker + drag/drop + compression + upload for the attachment pipeline
 * (Phase 4 §4.3).
 *
 * Per file: pre-checks → compress (images/videos; PDFs pass through) → presign →
 * direct PUT to storage (presigned URL, no auth header) → when `entityId` is present,
 * POST /api/v1/attachments immediately (documentId set). Video posters are uploaded
 * as a SECOND object (key + '-poster.jpg') and their public URL is sent in the
 * Document POST body as `posterUrl`.
 *
 * CREATE-FLOW CONTRACT: when `entityId` is absent, the uploaded object descriptor is
 * emitted with `documentId: null` and the parent must commit it after the entity
 * exists by POSTing /api/v1/attachments (same body shape this component uses) with
 * the new entityId. The object stays in storage either way.
 *
 * EXIF location is offered as an opt-in checkbox (unchecked by default) and is only
 * attached to the descriptor when the user opts in; the re-encoded output strips all
 * metadata so nothing leaks implicitly.
 */
export const AttachmentPicker = ({
  entityType,
  entityId = null,
  kind: kindProp = 'any',
  role,
  max = 4,
  accept,
  compact = false,
  inlineResults = false,
  value,
  onChange,
}: AttachmentPickerProps) => {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const committedRef = useRef<PickedAttachment[]>(value)
  const pipelineRef = useRef<Map<string, ItemPipeline>>(new Map())
  const uiRef = useRef<ItemUi[]>([])
  const [ui, setUi] = useState<ItemUi[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [, forceRender] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    committedRef.current = value
  }, [value])

  useEffect(() => {
    uiRef.current = ui
  }, [ui])

  // Sync done items with the parent's value (add missing, drop removed).
  useEffect(() => {
    setUi((prev) => {
      const keyByUi = new Map<string, ItemUi>()
      for (const u of prev) {
        const d = pipelineRef.current.get(u.id)?.descriptor
        if (d) keyByUi.set(d.key, u)
      }
      const valueKeys = new Set(value.map((v) => v.key))
      const next: ItemUi[] = []
      let changed = false
      for (const u of prev) {
        const d = pipelineRef.current.get(u.id)?.descriptor
        if (u.state === 'done' && d && !valueKeys.has(d.key)) {
          changed = true
          continue // Parent removed it — drop from the list.
        }
        next.push(u)
      }
      for (const v of value) {
        if (keyByUi.has(v.key)) continue
        changed = true
        pipelineRef.current.set(v.key, {
          id: v.key,
          file: null,
          kind: v.kind,
          exifLocation: null,
          location: v.location ?? null,
          useExifLocation: false,
          descriptor: v,
        })
        next.push({ id: v.key, state: 'done', progress: 100 })
      }
      return changed ? next : prev
    })
  }, [value])

  // Revoke every object URL this component created.
  useEffect(() => {
    const pipeline = pipelineRef.current
    return () => {
      for (const item of pipeline.values()) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        if (item.posterUrl) URL.revokeObjectURL(item.posterUrl)
      }
    }
  }, [])

  const enqueue = useCallback((task: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(task, task)
  }, [])

  const handleFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return
      const active = uiRef.current.filter((u) => u.state !== 'error').length
      const slots = Math.max(0, max - Math.max(value.length, active))
      const accepted = files.slice(0, slots)
      if (accepted.length === 0) return

      const ids: string[] = []
      const newUi: ItemUi[] = []
      for (const file of accepted) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const item: ItemPipeline = {
          id,
          file,
          kind: kindProp === 'any' ? kindFromFileNameAndMime(file.name, file.type) : kindProp,
          exifLocation: null,
          location: null,
          useExifLocation: false,
          descriptor: null,
        }
        if (item.kind === 'image') item.previewUrl = URL.createObjectURL(file)
        pipelineRef.current.set(id, item)
        ids.push(id)
        newUi.push({ id, state: 'compressing', progress: 0 })
      }
      setUi((prev) => [...prev, ...newUi])
      enqueue(async () => {
        for (const id of ids) {
          await processItem(id)
        }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kindProp, max, value, enqueue]
  )

  // Canonical extension for a MIME type. Compression can change the output
  // format (HEIC→JPEG, PNG→WebP, MOV→MP4), and the presign endpoint requires
  // the declared mimeType to match the fileName extension — so the name must
  // follow the FINAL blob, not the original file.
  const EXTENSION_BY_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
  }

  const fileNameForMime = (fileName: string, mimeType: string): string => {
    const ext = EXTENSION_BY_MIME[mimeType]
    if (!ext) return fileName
    return `${fileName.replace(/\.[^/.]+$/, '')}.${ext}`
  }

  const processItem = async (id: string): Promise<void> => {
    const item = pipelineRef.current.get(id)
    if (!item?.file) return

    const check = preCheckFile(item.file, kindProp)
    if (!check.ok) {
      setItemError(id, check.reason === 'too-large' ? 'TOO_LARGE' : 'UNSUPPORTED')
      return
    }
    // A PDF requested as a CV is uploaded with kind 'cv'.
    const kind: AttachmentKind = kindProp === 'cv' ? 'cv' : check.kind
    item.kind = kind
    setItemState(id, 'compressing', 0)

    try {
      let blob: Blob = item.file
      let width: number | undefined
      let height: number | undefined
      let duration: number | undefined
      let poster: Blob | undefined

      if (kind === 'image') {
        const { maxDimension, maxBytes } = imageTargets(role)
        const result = await compressImageFile(item.file, { maxDimension, maxBytes })
        blob = result.blob
        width = result.width
        height = result.height
        item.exifLocation = result.location
        forceRender() // The EXIF-location opt-in chip may now appear.
      } else if (kind === 'video') {
        const result = await compressVideoFile(item.file, (p) => {
          setItemProgress(id, Math.min(99, Math.round(p * 100)))
        })
        blob = result.blob
        duration = result.duration
        poster = result.poster
        if (poster) item.posterUrl = URL.createObjectURL(poster)
      }
      // 'document'/'cv': PDF passthrough — nothing to compress.

      const cap = kind === 'cv' ? CAPS.cv : kind === 'video' ? CAPS.video : CAPS.image
      if (blob.size > cap) throw new Error('TOO_LARGE_AFTER')

      const mimeType = blob.type || item.file.type
      // The presign endpoint requires mimeType and fileName extension to match;
      // after compression the blob's format may differ from the original file's.
      const uploadFileName = fileNameForMime(item.file.name, mimeType)

      // 1. Presign the main object.
      const presign = await presignObject({
        fileName: uploadFileName,
        mimeType,
        kind,
        size: blob.size,
      })
      setItemState(id, 'uploading', 0)

      // 2. Direct PUT to storage (presigned — no auth header needed).
      await putWithProgress(presign.uploadUrl, blob, mimeType, (pct) => {
        setItemProgress(id, pct)
      })

      // 3. Video poster as a SECOND object; its URL goes into Document.posterUrl.
      // The key is server-generated (no key-hint in the presign contract), so the
      // poster object simply gets its own key and the Document.posterUrl links them.
      let posterPublicUrl: string | undefined
      if (kind === 'video' && poster) {
        const posterPresign = await presignObject({
          fileName: posterFileName(item.file.name),
          mimeType: 'image/jpeg',
          kind: 'image',
          size: poster.size,
        })
        await putWithProgress(posterPresign.uploadUrl, poster, 'image/jpeg', () => {})
        posterPublicUrl = posterPresign.publicUrl
      }

      const descriptor: PickedAttachment = {
        key: presign.key,
        publicUrl: presign.publicUrl,
        fileName: uploadFileName,
        mimeType,
        kind,
        size: blob.size,
        width,
        height,
        duration,
        posterPublicUrl,
        location: item.useExifLocation ? item.location : null,
        documentId: null,
      }
      item.descriptor = descriptor

      // 4. Commit when the entity already exists; otherwise the parent commits later.
      if (entityId) {
        descriptor.documentId = await commitAttachment(descriptor, posterPublicUrl)
        if (descriptor.documentId) {
          // The bucket URL requires credentials; rendering goes through the
          // authenticated in-app pipe instead.
          descriptor.publicUrl = attachmentFileUrl(descriptor.documentId)
        }
        item.descriptor = descriptor
      }

      setItemState(id, 'done', 100)
      const next = [...committedRef.current, descriptor]
      committedRef.current = next
      onChange(next)
    } catch (error) {
      console.error('Attachment pipeline error:', error)
      const raw = error instanceof Error ? error.message : ''
      const code =
        raw === 'TOO_LARGE_AFTER' ? 'TOO_LARGE_AFTER'
        : raw === COMPRESS_FAILED ? 'COMPRESS_FAILED'
        : raw === VIDEO_LOAD_ERROR_MESSAGE ? 'COMPRESSION_UNAVAILABLE'
        : raw
      setItemError(id, code || 'GENERIC')
    }
  }

  const presignObject = async (body: {
    fileName: string
    mimeType: string
    kind: AttachmentKind
    size: number
  }): Promise<PresignResponse> => {
    const res = await fetch('/api/v1/attachments/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, role: role ?? undefined }),
    })
    if (!res.ok) throw new Error('PRESIGN_FAILED')
    return (await res.json()) as PresignResponse
  }

  const commitAttachment = async (
    descriptor: PickedAttachment,
    posterPublicUrl: string | undefined
  ): Promise<string> => {
    const res = await fetch('/api/v1/attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: descriptor.key,
        fileName: descriptor.fileName,
        fileFormat: extensionOf(descriptor.fileName),
        fileSize: descriptor.size,
        mimeType: descriptor.mimeType,
        kind: descriptor.kind,
        width: descriptor.width,
        height: descriptor.height,
        duration: descriptor.duration,
        location: descriptor.location ?? undefined,
        entityType,
        entityId,
        role: role ?? undefined,
        // Backend-integration note: Document.posterUrl is set from this field.
        posterUrl: posterPublicUrl ?? undefined,
      }),
    })
    if (!res.ok) throw new Error('SAVE_FAILED')
    const data = (await res.json()) as { document?: { id?: string } }
    const documentId = data?.document?.id
    if (!documentId) throw new Error('SAVE_FAILED')
    return documentId
  }

  const removeItem = (id: string) => {
    const item = pipelineRef.current.get(id)
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    if (item?.posterUrl) URL.revokeObjectURL(item.posterUrl)
    pipelineRef.current.delete(id)
    setUi((prev) => prev.filter((u) => u.id !== id))
    if (item?.descriptor) {
      const next = committedRef.current.filter((a) => a.key !== item.descriptor?.key)
      committedRef.current = next
      onChange(next)
    }
  }

  const toggleUsePhotoLocation = (item: ItemPipeline, on: boolean) => {
    item.useExifLocation = on
    item.location = on ? item.exifLocation : null
    forceRender()
  }

  const setLocation = (item: ItemPipeline, loc: PlaceLocation | null) => {
    item.location = loc
    forceRender()
  }

  const setItemState = (id: string, state: ItemUi['state'], progress: number) => {
    setUi((prev) => {
      const idx = prev.findIndex((u) => u.id === id)
      if (idx === -1) return prev
      if (prev[idx].state === state && prev[idx].progress === progress && prev[idx].error === undefined) {
        return prev
      }
      const next = [...prev]
      next[idx] = { id, state, progress, error: undefined }
      return next
    })
  }

  const setItemProgress = (id: string, progress: number) => {
    setUi((prev) => {
      const idx = prev.findIndex((u) => u.id === id)
      if (idx === -1 || prev[idx].progress === progress) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], progress }
      return next
    })
  }

  const setItemError = (id: string, error: string) => {
    setUi((prev) => {
      const idx = prev.findIndex((u) => u.id === id)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], state: 'error', progress: 0, error }
      return next
    })
  }

  const count = Math.max(value.length, ui.filter((u) => u.state !== 'error').length)
  const canAdd = count < max
  const acceptValue = accept ?? ACCEPT_BY_KIND[kindProp]

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptValue}
        className="hidden"
        onChange={(e) => {
          handleFiles(Array.from(e.target.files || []))
          e.target.value = ''
        }}
      />
      {canAdd ? (
        compact ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            {t('forms.attachmentPicker.browse', { defaultValue: 'Add files' })}
          </Button>
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label={t('forms.attachmentPicker.browse', { defaultValue: 'Add files' })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              handleFiles(Array.from(e.dataTransfer.files))
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-4 text-center transition-colors',
              isDragging ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/50'
            )}
          >
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t('forms.attachmentPicker.dropHere', { defaultValue: 'Drop files here' })}
            </span>
            <span className="text-xs text-muted-foreground/70">
              {t('forms.attachmentPicker.orClick', { defaultValue: 'or click to choose' })}
            </span>
          </div>
        )
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('forms.attachmentPicker.maxReached', { defaultValue: 'Maximum {max} files', max })}
        </p>
      )}

      {ui.length > 0 && (
        <ul className="space-y-2">
          {ui.map((u) => {
            const item = pipelineRef.current.get(u.id)
            if (!item) return null
            const busy = u.state === 'compressing' || u.state === 'uploading'
            const done = u.state === 'done'
            const editable = !done
            return (
              <li key={u.id} className="flex items-start gap-3 rounded-md border bg-card p-2">
                {renderThumb(item, done)}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm" title={item.file?.name ?? item.descriptor?.fileName}>
                      {item.file?.name ?? item.descriptor?.fileName}
                    </p>
                    <button
                      type="button"
                      aria-label={t('forms.attachmentPicker.remove', { defaultValue: 'Remove' })}
                      onClick={() => removeItem(u.id)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {busy && (
                    <div className="space-y-1">
                      <Progress value={u.progress} className="h-1.5" />
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {u.state === 'compressing' && (
                          <Loader className="h-3 w-3 animate-spin" aria-hidden />
                        )}
                        {u.state === 'compressing'
                          ? t('forms.attachmentPicker.compress', { defaultValue: 'Compressing…' })
                          : u.progress >= 100
                            ? t('forms.attachmentPicker.saving', { defaultValue: 'Saving…' })
                            : t('forms.attachmentPicker.uploading', {
                                defaultValue: 'Uploading {percent}%',
                                percent: u.progress,
                              })}
                      </p>
                    </div>
                  )}

                  {u.state === 'error' && u.error && (
                    <p className="text-xs text-destructive">
                      {t(ERROR_KEYS[u.error] ?? ERROR_KEYS.GENERIC, {
                        defaultValue: ERROR_DEFAULTS[u.error] ?? ERROR_DEFAULTS.GENERIC,
                      })}
                    </p>
                  )}

                  {item.kind === 'image' && editable && item.exifLocation && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={item.useExifLocation}
                        onCheckedChange={(v) => toggleUsePhotoLocation(item, v === true)}
                        aria-label={t('forms.attachmentPicker.usePhotoLocation', {
                          defaultValue: 'Attach location from this photo?',
                        })}
                      />
                      {t('forms.attachmentPicker.usePhotoLocation', {
                        defaultValue: 'Attach location from this photo?',
                      })}
                    </label>
                  )}

                  {editable && item.location && (
                    <PlacePicker
                      value={item.location}
                      onChange={(loc) => setLocation(item, loc)}
                      compact
                      inlineResults={inlineResults}
                    />
                  )}

                  {done && item.descriptor?.location && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {t('forms.attachmentPicker.locationAttached', { defaultValue: 'Location attached' })}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface PresignResponse {
  uploadUrl: string
  key: string
  publicUrl: string
  expiresIn: number
}

interface ItemPipeline {
  id: string
  file: File | null
  kind: AttachmentKind | null
  exifLocation: PlaceLocation | null
  location: PlaceLocation | null
  useExifLocation: boolean
  previewUrl?: string
  posterUrl?: string
  descriptor: PickedAttachment | null
}

interface ItemUi {
  id: string
  state: 'compressing' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

const ERROR_KEYS: Record<string, string> = {
  UNSUPPORTED: 'forms.attachmentPicker.error.unsupported',
  TOO_LARGE: 'forms.attachmentPicker.error.tooLarge',
  TOO_LARGE_AFTER: 'forms.attachmentPicker.error.tooLargeAfterCompression',
  COMPRESS_FAILED: 'forms.attachmentPicker.error.compressFailed',
  COMPRESSION_UNAVAILABLE: 'forms.attachmentPicker.error.compressionUnavailable',
  PRESIGN_FAILED: 'forms.attachmentPicker.error.presignFailed',
  UPLOAD_FAILED: 'forms.attachmentPicker.error.uploadFailed',
  SAVE_FAILED: 'forms.attachmentPicker.error.saveFailed',
  GENERIC: 'forms.attachmentPicker.error.generic',
}

const ERROR_DEFAULTS: Record<string, string> = {
  UNSUPPORTED: 'This file type is not supported',
  TOO_LARGE: 'This file is too large',
  TOO_LARGE_AFTER: 'Still too large after compression',
  COMPRESS_FAILED: 'Could not compress this file',
  COMPRESSION_UNAVAILABLE: 'Video compression is unavailable right now',
  PRESIGN_FAILED: 'Could not start the upload',
  UPLOAD_FAILED: 'Upload failed',
  SAVE_FAILED: 'Could not save the attachment',
  GENERIC: 'Could not add this file',
}

/** Re-encode targets per role (Phase 4 §4.2/§4.4). */
function imageTargets(role: AttachmentRole | undefined): { maxDimension: number; maxBytes: number } {
  if (role === 'flier') return { maxDimension: 4096, maxBytes: CAPS.flier }
  if (role === 'cover') return { maxDimension: 2560, maxBytes: CAPS.image }
  return { maxDimension: 2048, maxBytes: CAPS.image }
}

function posterFileName(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, '')
  return `${base}-poster.jpg`
}

function renderThumb(item: ItemPipeline, done: boolean) {
  const className = 'h-14 w-14 shrink-0 overflow-hidden rounded-md border object-cover'
  if (item.kind === 'image') {
    // Prefer the committed in-app URL; while uploading (or before the parent
    // commits a create-flow attachment) fall back to the local blob preview —
    // the bucket URL is not directly renderable.
    const src = done && item.descriptor?.documentId
      ? item.descriptor?.publicUrl
      : item.previewUrl
    if (src) return <img src={src} alt={item.file?.name ?? item.descriptor?.fileName ?? ''} className={className} />
    return (
      <div className={cn(className, 'flex items-center justify-center bg-muted text-muted-foreground')}>
        <ImageIcon className="h-5 w-5" aria-hidden />
      </div>
    )
  }
  if (item.kind === 'video') {
    // Poster thumbnails use the local blob; the stored poster object has no
    // Document row (no in-app URL).
    const src = item.posterUrl
    if (src) return <img src={src} alt={item.file?.name ?? ''} className={className} />
    return (
      <div className={cn(className, 'flex items-center justify-center bg-muted text-muted-foreground')}>
        <Film className="h-5 w-5" aria-hidden />
      </div>
    )
  }
  return (
    <div className={cn(className, 'flex items-center justify-center bg-muted text-muted-foreground')}>
      <FileText className="h-5 w-5" aria-hidden />
    </div>
  )
}

/**
 * Direct PUT to the presigned URL with upload progress. Presigned uploads do NOT
 * carry an auth header — the URL itself grants permission for this object.
 */
function putWithProgress(
  url: string,
  blob: Blob,
  mimeType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', mimeType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error('UPLOAD_FAILED'))
    }
    xhr.onerror = () => reject(new Error('UPLOAD_FAILED'))
    xhr.send(blob)
  })
}
