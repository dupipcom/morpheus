# Phase 4 — Media, storage & geolocation foundation

**Goal:** one attachment pipeline and one place-picking pipeline used by jobs, tasks, lists, notes,
events, event covers and A3 fliers. Replaces Phase 3 of `docs/do-rebuild-plan.md` and widens it so
Events (Phase 8) need no new media code. One PR.

Nothing of this exists today: no S3 SDK, no compression, no EXIF, no Places, no map library.
`Document` is already the attachment model (Phase 1 activated it with `mimeType`, `kind`,
`thumbnailUrl`, `posterUrl`, `width/height`, `location`, `taskIds`, `jobIds`, `eventIds`).

## 4.1 Storage — iDrive e2 (S3-compatible)

Deps: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.

Env (defaults in `.env.public`, secrets in `.env.local`):
`STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`,
`STORAGE_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_BASE_URL`.

- `src/lib/storage/s3.ts` — client singleton (`forcePathStyle: true`), `presignPut(key, contentType,
  contentLength)`, `publicUrlFor(key)`, `deleteObject(key)`.
- Key layout: `u/<userId>/<yyyy>/<mm>/<uuid>.<ext>` for user media,
  `o/<orgId>/...` for org media (Phase 7), `ev/<eventId>/cover|flier/<uuid>.<ext>` (Phase 8).
- **Presigned direct upload** — the browser PUTs straight to iDrive, dodging Vercel's ~4.5 MB body
  limit. The server never proxies bytes.

### Routes

| Endpoint | Behaviour |
|----------|-----------|
| `POST /api/v1/attachments/presign` | auth; validate extension allowlist + declared size ≤ cap → `{ uploadUrl, key, publicUrl, expiresIn }`. Cap is per-`kind` (see 4.3). |
| `POST /api/v1/attachments` | auth; `{ key, fileName, fileFormat, fileSize, mimeType, kind, width?, height?, duration?, location?, entityType, entityId, role? }` → verifies the key belongs to the caller's prefix, then **inspects the object's real bytes**: a ranged GET of the first 4 KB is checked against a magic-byte table (`file-type`) and must match the declared `kind`/extension; the HEAD size must be within cap. Only then is the `Document` created and linked, after `assertCan(user, 'edit', entityType, entityId)`. `role` distinguishes `cover` / `flier` / `evidence` / `inline`. Mismatch → the object is deleted and 400 returned. |
| `DELETE /api/v1/attachments/[documentId]` | auth + ownership; unlink, delete object, delete row. |

Server-side re-validation after upload is what makes the client cap non-authoritative.

**Serving safety**: `STORAGE_PUBLIC_BASE_URL` points at a media-only origin (separate host/CDN,
never the app domain), objects are stored with the sniffed `Content-Type`,
`X-Content-Type-Options: nosniff` and, for anything not in the image/video allowlist,
`Content-Disposition: attachment`. A disguised HTML/SVG payload therefore cannot execute in our
origin. SVG is **not** in the allowlist.

**EXIF location consent**: GPS extracted from a photo pre-fills the location field but is
**opt-in per upload** — the picker shows "attach location from this photo?" unchecked by default
for anything destined for a public surface (public tasks, events, public notes). Metadata is
stripped from the re-encoded output, so nothing leaks implicitly.

## 4.2 Client compression — `src/lib/utils/mediaCompression.ts`

Deps: `heic2any`, `exifr`, `@ffmpeg/ffmpeg` (core loaded from CDN via `toBlobURL`, never bundled).

- **Images**: read EXIF with `exifr` **before** re-encode (GPS → `location`, orientation honoured);
  HEIC/HEIF → `heic2any`; canvas re-encode to WebP (JPEG fallback) q0.8, longest edge ≤ 2048 px
  (≤ 4096 px for `role: 'flier'`, see 4.4); loop-reduce quality until ≤ cap.
- **Video**: `ffmpeg.wasm` → H.264 720p 30 fps MP4 + extracted poster frame (uploaded as a second
  object, stored in `Document.posterUrl`).
- Allowlist: images `heic heif jpg jpeg png webp gif`; video `mp4 mov webm`; documents `pdf`.
- Caps (post-compression): image 5 MB, flier 8 MB, video 25 MB, pdf 10 MB. Enforced client-side for
  UX and server-side (`presign` + post-upload HEAD) for truth.

## 4.3 Components

- `src/components/attachmentPicker.tsx` — file input + drag/drop, previews, per-file compression
  progress, per-file location chip (EXIF-filled, editable via PlacePicker), remove, reorder.
  Props: `{ entityType, entityId?, role, max, accept, onChange }`. When `entityId` is absent
  (create-flows) it returns pending descriptors that the parent commits after the entity exists.
- `src/components/imageCropper.tsx` — thin wrapper for fixed-aspect crops: `16:9` (event cover),
  `1:√2` (A3 flier), `1:1` (avatars). Keeps Phase 8 free of layout hacks.

## 4.4 Event media presets (consumed in Phase 8, built here)

| Preset | Aspect | Target | Stored on |
|--------|--------|--------|-----------|
| `cover` | 16:9 | ≤ 2560×1440 WebP | `Event.coverDocumentId` |
| `flier` | A3 portrait, 1:1.414 | ≤ 2480×3508 (A3 @ 300 dpi long edge capped to 3508) WebP + PDF passthrough allowed | `Event.flierDocumentId` |
| `thumb` | 16:9 | 640 px, generated client-side | `Document.thumbnailUrl` |

## 4.5 Geolocation — our own UI over Google Places

Env: `GOOGLE_PLACES_API_KEY` (**server-only**, never `NEXT_PUBLIC_`).

- `GET /api/v1/places/autocomplete?input=&sessionToken=` — server proxy, 5 results, in-memory LRU
  (5 min) to control quota; rate-limited per user.
- `GET /api/v1/places/details?placeId=&sessionToken=` → `{ lat, lng, placeId, name, address }`.
- `src/components/placePicker.tsx` — own input + debounced (300 ms) result list in a shadcn
  Popover, keyboard navigable, "use my current location" (browser geolocation → reverse geocode),
  and a manual lat/lng escape hatch. Emits the canonical `location` JSON shape used everywhere:
  `{ lat, lng, placeId?, name?, address? }`.
- `src/components/locationMap.tsx` — static-first map: renders the Google Static Maps image
  (proxied through `GET /api/v1/places/staticmap?lat=&lng=&zoom=` so the key stays server-side)
  with a "open in Maps" link. No map JS library, no client key, no bundle cost. Interactive
  panning is explicitly out of scope.

## 4.6 Write composer extensions — `src/components/publishNote.tsx`

Today it POSTs `{ content, visibility, date, recipientId }` only, while `Note` already has
`documentIds`, `listIds`, `profileIds`, `taskIds`, `eventIds`, `location`, `repostedListId`.

- Add `AttachmentPicker` (≤ 4 files), `PlacePicker`, and a new
  `src/components/entityTagPicker.tsx` (searches profiles, the user's lists, visible tasks, and
  — from Phase 8 — events; renders chips).
- `POST /api/v1/notes` accepts and sanitises `documentIds`, `location`, `profileIds`, `listIds`,
  `taskIds`, `eventIds`, `repostedListId`.
- **Tag visibility rule** (server, in `visibilityService`): `resolveNoteTags(note, viewerId)` drops
  tagged tasks the viewer can't see (public tasks → everyone; private-list tasks → members only)
  before the note leaves the API. `noteContent.tsx`/`notesList.tsx` render chips from the resolved
  set only.
- Inline link previews already work (`linkPreview.tsx` + `/api/v1/link-preview`); reuse untouched —
  this is what satisfies the "description with inline link previews" requirement in Phase 8.

## Files touched

| Action | Path |
|--------|------|
| new | `src/lib/storage/s3.ts`, `src/lib/utils/mediaCompression.ts`, `src/app/api/v1/attachments/{presign/route.ts,route.ts,[documentId]/route.ts,CLAUDE.md}`, `src/app/api/v1/places/{autocomplete,details,staticmap}/route.ts` + `CLAUDE.md`, `src/components/{attachmentPicker,imageCropper,placePicker,locationMap,entityTagPicker}.tsx` |
| deps | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `heic2any`, `exifr`, `@ffmpeg/ffmpeg`, `file-type` |
| edit | `src/components/publishNote.tsx`, `src/components/noteContent.tsx`, `src/app/api/v1/notes/route.ts`, `src/lib/services/visibility/visibilityService.ts`, `package.json`, `.env.public`, `src/app/api/openapi.yaml` |

## Migrations

None (Phase 1's `0019-convert-task-documents.js` already normalised `Document`).

## Verification

- Upload a 12 MB HEIC → converted, ≤ 5 MB, renders; EXIF GPS is offered, not auto-attached, and
  attaches to the job's `location` only when the user opts in.
- Rename `payload.html` to `photo.jpg` and upload → magic-byte check rejects it, object deleted, 400.
- Fetch an uploaded file → served from the media origin with `nosniff` and a sniffed content type.
- Upload a 60 MB `.mov` → compressed ≤ 25 MB, poster frame stored and shown.
- A file above cap after compression is rejected client-side **and** by `presign`.
- Tamper test: call `POST /api/v1/attachments` with a `key` under another user's prefix → 403.
- PlacePicker search returns results; picking one stores the 5-field JSON; `locationMap` renders
  and the Places key never appears in the client bundle
  (`grep -r GOOGLE_PLACES .next/static` → no hits).
- Write a note with 2 photos, a place, a profile tag and a private-list task tag; a non-member
  viewer sees the note without the private task chip.
