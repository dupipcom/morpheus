'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/contexts/i18n'

export type CropAspect = '16:9' | 'a3' | '1:1'

interface ImageCropperProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing image URL (e.g. a previously uploaded publicUrl). */
  imageUrl?: string | null
  /** Or a freshly picked File — an object URL is created internally and revoked. */
  imageFile?: File | null
  /** Fixed crop aspect: 16:9 (event cover), a3 (A3 flier, portrait), 1:1 (avatar). */
  aspect: CropAspect
  /** Called with the cropped WebP blob (long edge 2048, or 3508 for a3). */
  onCrop: (blob: Blob) => void
}

/**
 * Fixed-aspect image cropper (Phase 4 §4.3). The image is shown inside a
 * fixed-aspect viewport at cover scale; the user drags to position it. The crop is
 * re-encoded to WebP with the long edge at 2048 px (16:9 / 1:1) or 3508 px
 * (a3 — A3 @ 300 dpi). No pan/zoom library.
 */
export const ImageCropper = ({
  open,
  onOpenChange,
  imageUrl = null,
  imageFile = null,
  aspect,
  onCrop,
}: ImageCropperProps) => {
  const { t } = useI18n()
  const viewportRef = useRef<HTMLDivElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const centeredRef = useRef(false)

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [viewSize, setViewSize] = useState<{ w: number; h: number } | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const ratio = ASPECT_RATIOS[aspect]

  // Load the source image when the dialog opens.
  useEffect(() => {
    if (!open) return
    let url: string | null = imageUrl ?? null
    if (imageFile) {
      url = URL.createObjectURL(imageFile)
      objectUrlRef.current = url
    }
    if (!url) {
      setImg(null)
      setLoadError(false)
      return
    }
    centeredRef.current = false
    const el = new Image()
    el.onload = () => {
      setImg(el)
      setLoadError(false)
    }
    el.onerror = () => {
      setImg(null)
      setLoadError(true)
    }
    el.src = url
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [open, imageUrl, imageFile])

  // Measure the viewport (and keep it measured across resizes).
  useLayoutEffect(() => {
    if (!open || !viewportRef.current) return
    const measure = () => {
      const el = viewportRef.current
      if (el) setViewSize({ w: el.clientWidth, h: el.clientHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(viewportRef.current)
    return () => ro.disconnect()
  }, [open, aspect])

  const displayScale = useMemo(() => {
    if (!img || !viewSize) return 0
    // Cover scale: the image always fills the viewport in both dimensions.
    return Math.max(viewSize.w / (img.naturalWidth || 1), viewSize.h / (img.naturalHeight || 1))
  }, [img, viewSize])

  const drawn = useMemo(
    () => ({
      w: img && displayScale ? (img.naturalWidth || 0) * displayScale : 0,
      h: img && displayScale ? (img.naturalHeight || 0) * displayScale : 0,
    }),
    [img, displayScale]
  )

  const clamp = useCallback(
    (x: number, y: number) => {
      if (!viewSize) return { x: 0, y: 0 }
      return {
        x: Math.min(0, Math.max(viewSize.w - drawn.w, x)),
        y: Math.min(0, Math.max(viewSize.h - drawn.h, y)),
      }
    },
    [viewSize, drawn]
  )

  // Center the image once when both image and viewport are known.
  useEffect(() => {
    if (!img || !viewSize || centeredRef.current) return
    centeredRef.current = true
    setPos(clamp((viewSize.w - drawn.w) / 2, (viewSize.h - drawn.h) / 2))
  }, [img, viewSize, drawn, clamp])

  // Re-clamp when the viewport resizes (e.g. dialog width change).
  useEffect(() => {
    if (!viewSize) return
    setPos((prev) => clamp(prev.x, prev.y))
  }, [viewSize, clamp])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!img) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    setPos(clamp(d.origX + e.clientX - d.startX, d.origY + e.clientY - d.startY))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const applyCrop = async () => {
    if (!img || !viewSize || displayScale <= 0) return
    const target = TARGETS[aspect]
    // Visible region in natural pixels.
    const sx = -pos.x / displayScale
    const sy = -pos.y / displayScale
    const sw = viewSize.w / displayScale
    const sh = viewSize.h / displayScale

    const canvas = document.createElement('canvas')
    canvas.width = target.w
    canvas.height = target.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, target.w, target.h)

    const blob =
      (await canvasToBlob(canvas, 'image/webp', 0.85)) ??
      (await canvasToBlob(canvas, 'image/jpeg', 0.9))
    if (blob) {
      onCrop(blob)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] max-w-[92vw]">
        <DialogHeader>
          <DialogTitle>{t('forms.imageCropper.title', { defaultValue: 'Crop image' })}</DialogTitle>
        </DialogHeader>

        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative w-full touch-none overflow-hidden rounded-md border bg-muted select-none"
          style={{ aspectRatio: `${ratio}` }}
        >
          {img && viewSize && displayScale > 0 && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="absolute max-w-none cursor-grab active:cursor-grabbing"
              style={{
                left: pos.x,
                top: pos.y,
                width: drawn.w,
                height: drawn.h,
              }}
            />
          )}
          {loadError && (
            <div className="flex h-full min-h-40 items-center justify-center text-sm text-destructive">
              {t('forms.imageCropper.error', { defaultValue: 'Could not load this image' })}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {t('forms.imageCropper.dragHint', {
            defaultValue: 'Drag the image to position it in the frame',
          })}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('forms.imageCropper.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button size="sm" onClick={applyCrop} disabled={!img || loadError}>
            {t('forms.imageCropper.apply', { defaultValue: 'Apply' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const ASPECT_RATIOS: Record<CropAspect, number> = {
  '16:9': 16 / 9,
  '1:1': 1,
  a3: 1 / Math.SQRT2, // Portrait A3 (1 : √2)
}

/** Output canvas sizes — long edge 2048 (16:9/1:1) or 3508 (A3 @ 300 dpi). */
const TARGETS: Record<CropAspect, { w: number; h: number }> = {
  '16:9': { w: 2048, h: Math.round((2048 * 9) / 16) },
  '1:1': { w: 2048, h: 2048 },
  a3: { w: Math.round(3508 / Math.SQRT2), h: 3508 },
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}
