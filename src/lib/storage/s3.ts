/**
 * S3-compatible storage (iDrive e2) — client singleton + attachment media policy.
 *
 * Env (defaults in `.env.public`, secrets in `.env.local`):
 *   STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID,
 *   STORAGE_SECRET_ACCESS_KEY, STORAGE_PUBLIC_BASE_URL
 *
 * The browser PUTs directly to a presigned URL; the server never proxies bytes
 * (Vercel's ~4.5 MB body limit does not apply to direct-to-storage uploads).
 * Key layout: `u/<userId>/<yyyy>/<mm>/<uuid>.<ext>` for user media.
 *
 * The media policy block (allowlists, caps, sniffing rules) lives here so the
 * presign and create routes share one source of truth and cannot drift.
 */

import { randomUUID } from 'crypto'
import { Readable } from 'stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ENDPOINT = process.env.STORAGE_ENDPOINT || ''
const REGION = process.env.STORAGE_REGION || 'us-east-1'
const BUCKET = process.env.STORAGE_BUCKET || ''
const ACCESS_KEY_ID = process.env.STORAGE_ACCESS_KEY_ID || ''
const SECRET_ACCESS_KEY = process.env.STORAGE_SECRET_ACCESS_KEY || ''

/** Public media origin (media-only host/CDN, never the app domain), trailing slash trimmed. */
export const PUBLIC_BASE_URL = (process.env.STORAGE_PUBLIC_BASE_URL || '').replace(/\/+$/, '')

const PRESIGN_EXPIRY_SECONDS = 5 * 60

let client: S3Client | null = null

/** True when endpoint and bucket are configured (credentials may be blank in dev). */
export function isStorageConfigured(): boolean {
  return Boolean(ENDPOINT && BUCKET)
}

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error('Storage is not configured')
  }
  if (!client) {
    client = new S3Client({
      endpoint: ENDPOINT,
      region: REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY
      }
    })
  }
  return client
}

/**
 * Presign a PUT for direct browser upload. Content-Type and Content-Length are
 * pinned into the signature, so the client cannot upload different bytes or a
 * different size than it declared at presign time.
 */
export async function presignPut(
  key: string,
  contentType: string,
  contentLength: number
): Promise<{ uploadUrl: string; expiresIn: number }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength
  })
  const uploadUrl = await getSignedUrl(getClient(), command, {
    expiresIn: PRESIGN_EXPIRY_SECONDS
  })
  return { uploadUrl, expiresIn: PRESIGN_EXPIRY_SECONDS }
}

/** Public (media-origin) URL for an object key. */
export function publicUrlFor(key: string): string {
  return `${PUBLIC_BASE_URL}/${key}`
}

/**
 * Server-side read of an object's bytes. The bucket is never exposed publicly:
 * only this authenticated path (and presigned uploads) reach it.
 *
 * Range is passed through for video seeking (browsers send `Range: bytes=...`);
 * the caller maps a non-null contentRange to a 206 response.
 */
export async function getObjectStream(
  key: string,
  range?: string | null
): Promise<{
  stream: ReadableStream
  contentType: string
  contentLength: number
  contentRange?: string
} | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ...(range ? { Range: range } : {})
    })
    const output = await getClient().send(command)
    if (!output.Body) return null

    const nodeStream = output.Body as Readable
    const stream = Readable.toWeb(nodeStream) as unknown as ReadableStream

    return {
      stream,
      contentType: output.ContentType || 'application/octet-stream',
      contentLength: output.ContentLength ?? 0,
      ...(output.ContentRange ? { contentRange: output.ContentRange } : {})
    }
  } catch {
    // NoSuchKey, access errors, etc. — treat as "object missing" for the caller
    return null
  }
}

/** Delete an object; NoSuchKey is swallowed so deletes are idempotent. */
export async function deleteObject(key: string): Promise<void> {
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name !== 'NoSuchKey') throw error
  }
}

/** HEAD an object; null when it does not exist. */
export async function headObject(
  key: string
): Promise<{ contentLength: number; contentType: string } | null> {
  try {
    const head = await getClient().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    if (head.ContentLength === undefined) return null
    return { contentLength: head.ContentLength, contentType: head.ContentType || '' }
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'NoSuchKey' || name === 'NotFound') return null
    throw error
  }
}

/** Ranged GET of the first n bytes, for magic-byte inspection. */
export async function getFirstBytes(key: string, n: number): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Range: `bytes=0-${n - 1}`
  })
  const response = await getClient().send(command)
  if (!response.Body) return Buffer.alloc(0)
  return Buffer.from(await response.Body.transformToByteArray())
}

/** User-media key: `u/<userId>/<yyyy>/<mm>/<uuid>.<ext>`. */
export function objectKeyForUpload(userId: string, extension: string): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `u/${userId}/${yyyy}/${mm}/${randomUUID()}.${extension}`
}

/* ---------------------------------------------------------------------------
 * Media policy — kind allowlists, caps and sniffing rules shared by the
 * presign and create routes (single source of truth so the two can't drift).
 * Plan §4.2: image 5 MB (flier 8 MB), video 25 MB, pdf/document 10 MB, cv 10 MB.
 * ------------------------------------------------------------------------- */

export const VALID_KINDS = ['image', 'video', 'document', 'cv'] as const
export type AttachmentKind = (typeof VALID_KINDS)[number]

export const VALID_ROLES = ['cover', 'flier', 'evidence', 'inline', 'cv'] as const
export type AttachmentRole = (typeof VALID_ROLES)[number]

export const EXTENSIONS_BY_KIND: Record<AttachmentKind, string[]> = {
  image: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'gif'],
  video: ['mp4', 'mov', 'webm'],
  document: ['pdf'],
  cv: ['pdf']
}

/** Canonical mimeType for a declared extension (presign consistency check). */
export const MIME_BY_EXTENSION: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  pdf: 'application/pdf'
}

export const KIND_CAPS: Record<AttachmentKind, number> = {
  image: 5 * 1024 * 1024,
  video: 25 * 1024 * 1024,
  document: 10 * 1024 * 1024,
  cv: 10 * 1024 * 1024
}

/** Flier (A3) images are allowed up to 8 MB (plan §4.2/§4.4). */
export const FLIER_IMAGE_CAP = 8 * 1024 * 1024

/** SVG is explicitly not allowed for any kind (disguised HTML/SVG payloads). */
export const SVG_MIME_TYPE = 'image/svg+xml'

/** Lowercased extension of a file name ('' when there is none). */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
}

/** Size cap for a kind, honoring the flier override for images. */
export function capFor(kind: AttachmentKind, role?: string): number {
  if (role === 'flier' && kind === 'image') return FLIER_IMAGE_CAP
  return KIND_CAPS[kind]
}

/** Is the extension allowed for the kind? */
export function extensionAllowedFor(kind: AttachmentKind, ext: string): boolean {
  return EXTENSIONS_BY_KIND[kind].includes(ext)
}

/** Does a sniffed mime type belong to the kind's family? */
export function kindFamilyMatches(kind: AttachmentKind, mime: string): boolean {
  if (kind === 'image') return mime.startsWith('image/')
  if (kind === 'video') return mime.startsWith('video/')
  return mime === 'application/pdf'
}
