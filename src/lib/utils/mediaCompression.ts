import type { PlaceLocation } from '@/components/placePicker'
import type { FFmpeg } from '@ffmpeg/ffmpeg'

/**
 * Client-side media compression for the attachment pipeline (Phase 4 §4.2).
 *
 * - Images: EXIF read BEFORE re-encode (GPS → location, orientation honoured), HEIC/HEIF →
 *   heic2any → canvas re-encode to WebP (JPEG fallback), longest edge ≤ maxDimension,
 *   quality looped down until the blob fits maxBytes.
 * - Video: ffmpeg.wasm (core fetched from CDN, never bundled) → H.264 720p 30 fps MP4 +
 *   extracted JPEG poster frame.
 * - PDFs pass through untouched (server-side magic-byte check is the authority).
 *
 * Browser-only — every DOM/worker API is used lazily inside the functions.
 */

export type AttachmentKind = 'image' | 'video' | 'document' | 'cv'

export const CAPS = {
  image: 5 * 1024 * 1024,
  video: 25 * 1024 * 1024,
  document: 10 * 1024 * 1024,
  cv: 10 * 1024 * 1024,
  flier: 8 * 1024 * 1024,
} as const

const IMAGE_EXTENSIONS = new Set(['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'gif'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm'])
const PDF_EXTENSIONS = new Set(['pdf'])

export const ACCEPT_BY_KIND: Record<AttachmentKind | 'any', string> = {
  image: '.heic,.heif,.jpg,.jpeg,.png,.webp,.gif',
  video: '.mp4,.mov,.webm',
  document: '.pdf',
  cv: '.pdf',
  any: '.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm,.pdf',
}

/** Error codes thrown by the compression pipeline (mapped to i18n by consumers). */
export const COMPRESS_FAILED = 'COMPRESS_FAILED'
export const VIDEO_LOAD_ERROR_MESSAGE =
  'Could not load the video encoder — video compression is unavailable right now.'

/** Lowercased extension without the dot ('' when the file name has none). */
export function extensionOf(fileName: string): string {
  const base = fileName.trim().toLowerCase()
  const idx = base.lastIndexOf('.')
  return idx >= 0 ? base.slice(idx + 1) : ''
}

/** Resolve the attachment kind from extension first, then MIME as a fallback. */
export function kindFromFileNameAndMime(fileName: string, mimeType: string): AttachmentKind | null {
  const ext = extensionOf(fileName)
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (PDF_EXTENSIONS.has(ext)) return 'document'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf') return 'document'
  return null
}

export type PreCheckResult =
  | { ok: true; kind: AttachmentKind; cap: number }
  | { ok: false; kind: AttachmentKind | null; reason: 'unsupported' | 'too-large'; size: number; cap: number }

/**
 * Client-side pre-checks before the pipeline starts. The server is the authority
 * (presign cap + post-upload magic-byte/HEAD checks); this only saves bandwidth.
 *
 * - Disallowed extensions → 'unsupported'.
 * - PDFs pass through unmodified, so their ORIGINAL size must already fit the cap.
 * - Images/videos may be compressed, so the hard limit to even attempt is cap × 3.
 */
export function preCheckFile(file: File, requested: AttachmentKind | 'any'): PreCheckResult {
  const actual = kindFromFileNameAndMime(file.name, file.type)
  if (!actual) return { ok: false, kind: null, reason: 'unsupported', size: file.size, cap: 0 }
  if (requested !== 'any' && actual !== requested && !(actual === 'document' && requested === 'cv')) {
    return { ok: false, kind: null, reason: 'unsupported', size: file.size, cap: 0 }
  }
  const cap =
    requested === 'cv' ? CAPS.cv
    : actual === 'video' ? CAPS.video
    : actual === 'image' ? CAPS.image
    : CAPS.document
  const limit = actual === 'document' ? cap : cap * 3
  if (file.size > limit) return { ok: false, kind: actual, reason: 'too-large', size: file.size, cap }
  return { ok: true, kind: actual, cap }
}

export interface CompressImageOptions {
  /** Longest edge of the re-encoded image in px (default 2048; 4096 for fliers). */
  maxDimension?: number
  /** Starting encode quality (default 0.8), reduced 0.8 → 0.6 → 0.4 until under maxBytes. */
  quality?: number
  /** Hard size budget for the output blob (default 5 MB). */
  maxBytes?: number
}

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
  /**
   * GPS read from the photo's EXIF. Returned but NEVER embedded automatically —
   * embedding is opt-in per upload by the caller (public surfaces must not leak it).
   */
  location: PlaceLocation | null
}

/**
 * Compress an image file for upload.
 *
 * EXIF (GPS + orientation) is read from the ORIGINAL file before re-encoding, because
 * the re-encoded output has all metadata stripped. HEIC/HEIF is converted to JPEG
 * first (heic2any). GIFs pass through untouched. Orientation 1–8 is honoured when
 * drawing to the canvas.
 */
export async function compressImageFile(
  file: File,
  opts: CompressImageOptions = {}
): Promise<CompressedImage> {
  const maxDimension = opts.maxDimension ?? 2048
  const quality = opts.quality ?? 0.8
  const maxBytes = opts.maxBytes ?? CAPS.image

  // EXIF must be read from the ORIGINAL file — re-encoding strips it.
  const exifr = await import('exifr')
  const [gps, orientation] = await Promise.all([
    exifr.gps(file).catch(() => undefined),
    exifr.orientation(file).catch(() => undefined),
  ])
  const location: PlaceLocation | null =
    gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number'
      ? { lat: gps.latitude, lng: gps.longitude }
      : null

  const ext = extensionOf(file.name)
  const isGif = ext === 'gif' || file.type === 'image/gif'
  const isHeic = ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif'

  // GIFs are animated — pass through untouched, just report dimensions.
  if (isGif) {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    bitmap.close()
    return { blob: file, width, height, location }
  }

  let source: Blob = file
  if (isHeic) {
    try {
      const { default: heic2any } = await import('heic2any')
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 })
      source = Array.isArray(converted) ? converted[0] : converted
    } catch {
      throw new Error(COMPRESS_FAILED)
    }
  }

  let img: HTMLImageElement
  try {
    img = await loadImage(source)
  } catch {
    throw new Error(COMPRESS_FAILED)
  }

  const naturalW = img.naturalWidth || img.width
  const naturalH = img.naturalHeight || img.height
  // Orientations 5–8 are 90° rotations: the canvas dims swap.
  const swap = orientation !== undefined && orientation >= 5 && orientation <= 8
  const baseW = swap ? naturalH : naturalW
  const baseH = swap ? naturalW : naturalH
  const scale = Math.min(1, maxDimension / Math.max(baseW, baseH))
  const outW = Math.max(1, Math.round(baseW * scale))
  const outH = Math.max(1, Math.round(baseH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(COMPRESS_FAILED)

  drawOriented(ctx, img, orientation, scale)

  try {
    const blob = await encodeCanvas(canvas, maxBytes, quality)
    return { blob, width: outW, height: outH, location }
  } catch {
    throw new Error(COMPRESS_FAILED)
  }
}

export interface CompressedVideo {
  blob: Blob
  /** Best-effort duration in seconds (video-element metadata probe, ffmpeg log fallback). */
  duration?: number
  /** JPEG poster frame at 0.5 s, 640 px wide — upload as a second object, store its URL in Document.posterUrl. */
  poster?: Blob
}

const FFMPEG_CORE_CDN = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'

/**
 * Compress a video to H.264 720p 30 fps MP4 and extract a JPEG poster frame.
 *
 * ffmpeg is imported AND the core is fetched from the CDN lazily — only when a video
 * is actually picked. The core is never bundled. Size cap: 25 MB; one retry at a
 * higher CRF (32) if the first pass is still over.
 */
export async function compressVideoFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<CompressedVideo> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const ffmpeg = new FFmpeg()
  const inputName = `input.${extensionOf(file.name) || 'mp4'}`
  const blobUrls: string[] = []
  let logDuration: number | undefined

  ffmpeg.on('progress', ({ progress }) => {
    if (onProgress) onProgress(Math.max(0, Math.min(1, progress)))
  })
  ffmpeg.on('log', ({ message }) => {
    if (logDuration === undefined) {
      const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message)
      if (match) {
        logDuration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
      }
    }
  })

  try {
    try {
      // Core fetched at runtime from the CDN — never bundled with the app.
      const coreURL = await fetchAsBlobUrl(`${FFMPEG_CORE_CDN}/ffmpeg-core.js`, 'text/javascript')
      blobUrls.push(coreURL)
      const wasmURL = await fetchAsBlobUrl(`${FFMPEG_CORE_CDN}/ffmpeg-core.wasm`, 'application/wasm')
      blobUrls.push(wasmURL)
      await ffmpeg.load({ coreURL, wasmURL })
    } catch {
      throw new Error(VIDEO_LOAD_ERROR_MESSAGE)
    }

    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()))

    const baseArgs = [
      '-i', inputName,
      '-vf', 'scale=-2:720',
      '-r', '30',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
    ]
    await ffmpeg.exec([...baseArgs, '-crf', '28', 'output.mp4'])
    let data = await readFileData(ffmpeg, 'output.mp4')

    if (data.byteLength > CAPS.video) {
      // One retry with a higher CRF (smaller file, slightly worse quality).
      await ffmpeg.exec([...baseArgs, '-crf', '32', 'output2.mp4'])
      data = await readFileData(ffmpeg, 'output2.mp4')
    }

    let poster: Blob | undefined
    try {
      await ffmpeg.exec(['-ss', '0.5', '-i', inputName, '-frames:v', '1', '-vf', 'scale=640:-2', 'poster.jpg'])
      poster = new Blob([await readFileData(ffmpeg, 'poster.jpg')], { type: 'image/jpeg' })
    } catch {
      poster = undefined // The poster is a nicety — never fail the upload over it.
    }

    return {
      blob: new Blob([data], { type: 'video/mp4' }),
      duration: (await probeVideoDuration(file)) ?? logDuration,
      poster,
    }
  } finally {
    for (const path of [inputName, 'output.mp4', 'output2.mp4', 'poster.jpg']) {
      try {
        await ffmpeg.deleteFile(path)
      } catch {
        // Already gone — fine.
      }
    }
    ffmpeg.terminate()
    for (const url of blobUrls) URL.revokeObjectURL(url)
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not decode image'))
    }
    img.src = url
  })
}

/**
 * Draw the image honouring EXIF orientation 1–8, centered in the (already
 * dimension-adjusted) canvas. Canvas transforms post-multiply, so the first call is
 * applied to the point last — each case's calls are ordered so the composed matrix
 * matches the canonical EXIF matrices used by exif-js.
 */
function drawOriented(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  orientation: number | undefined,
  scale: number
): void {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2)
  switch (orientation) {
    case 2: ctx.scale(-1, 1); break
    case 3: ctx.rotate(Math.PI); break
    case 4: ctx.scale(1, -1); break
    case 5: ctx.scale(1, -1); ctx.rotate(Math.PI / 2); break
    case 6: ctx.rotate(Math.PI / 2); break
    case 7: ctx.scale(1, -1); ctx.rotate(-Math.PI / 2); break
    case 8: ctx.rotate(-Math.PI / 2); break
  }
  ctx.drawImage(img, (-w * scale) / 2, (-h * scale) / 2, w * scale, h * scale)
}

/**
 * Re-encode the canvas to WebP (JPEG fallback when WebP is unavailable), looping
 * quality 0.8 → 0.6 → 0.4 until the blob fits maxBytes. Returns the last attempt
 * (smallest) when even 0.4 is over budget.
 */
async function encodeCanvas(canvas: HTMLCanvasElement, maxBytes: number, startQuality: number): Promise<Blob> {
  const qualities = [startQuality, 0.6, 0.4]
  let best: Blob | null = null
  for (const q of qualities) {
    const blob =
      (await canvasToBlob(canvas, 'image/webp', q)) ??
      (await canvasToBlob(canvas, 'image/jpeg', q))
    if (!blob) continue
    if (blob.size <= maxBytes) return blob
    best = blob
  }
  if (best) return best
  throw new Error(COMPRESS_FAILED)
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function fetchAsBlobUrl(url: string, mimeType: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}`)
  return URL.createObjectURL(await res.blob())
}

async function readFileData(ffmpeg: FFmpeg, path: string): Promise<Uint8Array<ArrayBuffer>> {
  const data = await ffmpeg.readFile(path)
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  // slice() copies into a fresh ArrayBuffer — required for BlobPart (TS 5.7+).
  return bytes.slice()
}

/** Best-effort duration probe using the browser's own demuxer (metadata only). */
async function probeVideoDuration(file: File): Promise<number | undefined> {
  try {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    return await new Promise<number | undefined>((resolve) => {
      const done = (d: number | undefined) => {
        URL.revokeObjectURL(url)
        video.removeAttribute('src')
        resolve(d)
      }
      video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : undefined)
      video.onerror = () => done(undefined)
    })
  } catch {
    return undefined
  }
}
