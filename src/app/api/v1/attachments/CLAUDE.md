# Attachments API

## Routes
- `POST /api/v1/attachments/presign` — validate + presign a direct upload
- `POST /api/v1/attachments` — confirm upload, inspect real bytes, create + link `Document`
- `GET /api/v1/attachments` — list own documents (`?kind=cv&mine=true`)
- `DELETE /api/v1/attachments/[documentId]` — unlink, delete object, delete row

## Auth
All routes require Clerk auth. The caller's internal `User.id` is resolved from the Clerk
`userId` and used for key prefixes, ownership and self-only checks — never a client-provided id.

## POST `/attachments/presign`
Body: `{ fileName, mimeType, kind, size, role? }`. Validates extension allowlist per kind
(image: `heic heif jpg jpeg png webp gif`; video: `mp4 mov webm`; document/cv: `pdf`; SVG
explicitly rejected), `mimeType` consistency with the extension (simple map), and declared
size against the per-kind cap (image 5 MB, flier image 8 MB, video 25 MB, document/cv 10 MB).
Storage unconfigured (`STORAGE_ENDPOINT`/`STORAGE_BUCKET` missing) → 503
`{ error: 'Storage not configured' }`. Returns `{ uploadUrl, key, publicUrl, expiresIn }`.
The key is `u/<internalUserId>/<yyyy>/<mm>/<uuid>.<ext>`.

## POST `/attachments`
Body: `{ key, fileName, fileFormat, fileSize, mimeType, kind, width?, height?, duration?,
location?, entityType, entityId, role? }`.
- **Key prefix**: `key` must start with `u/<callerInternalUserId>/`, else 403 (tamper test).
- **HEAD re-validation**: object must exist (404), size ≤ per-kind cap (else object deleted,
  400). Declared `fileSize`/`mimeType` in the body are ignored — HEAD size and sniffed mime
  are the server-side truth.
- **Magic bytes**: first 4 KB are ranged-GET'd and sniffed with `file-type` (ESM-only, so it is
  loaded via dynamic `await import('file-type')`). Sniffed mime must match the kind family
  (image/*, video/*, application/pdf) and the sniffed extension must be in the kind's
  allowlist. Mismatch or unrecognized → object deleted, 400
  `{ error: 'File content does not match its type' }`. This also rejects disguised HTML/SVG.
- **Ownership**: `task`/`list`/`job`/`note` → entity must exist (404) and the caller needs
  `edit` via `ownership/assertCan` (403 otherwise). `user` → only when `entityId` is the
  caller's own internal id (self-owned CVs).
- **Document row**: `fileUrl` = public URL of the key, `fileName` sanitized with
  `sanitizeText`, `fileSize` from HEAD, `fileFormat` = key extension, `mimeType` = sniffed,
  `kind` from body, `width`/`height`/`fileDuration`/`location` when provided (non-negative
  numbers; `location` must be `{ lat, lng, ... }`).
- **Linking** (relation names verified against the schema): `task` → push into
  `Task.documentIds` (Document side kept in sync via `Document.taskIds`); `job` → push into
  `Job.documentIds` (Document side via `Document.jobIds`); `list` → `List.documentIds`;
  `note` → `Note.documentIds`; `user` → no linking. Returns `{ document }`.
- **`role`** (`cover`/`flier`/`evidence`/`inline`/`cv`) is validated but not persisted: the
  `Document` model has no role column. CVs are distinguished by `kind='cv'`; other roles are
  resolved contextually by the entity that references the document (Phase 8 event covers).

## GET `/attachments`
Only one mode exists for now: `?mine=true` (required, else 400
`{ error: 'kind and mine=true are required' }`), optional `kind` filter (e.g. `?kind=cv`),
newest first, `limit` ≤ 50. Returns `{ documents }`.

## DELETE `/attachments/[documentId]`
Owner-only (`Document.userId` === caller, else 403). Storage object is deleted first
(deriving the key from `fileUrl` by stripping `STORAGE_PUBLIC_BASE_URL`; best-effort — a
storage failure logs and does not block). `Task`/`Job`/`List`/`Note` `documentIds` arrays
have no onDelete cascade (plain MongoDB scalar arrays) and the generated client only
exposes `set`/`push` on them, so the id is removed from each affected row by
read-modify-write (`set` of the filtered array) inside a transaction that ends with the
row delete. Returns `{ message: 'Attachment deleted' }`.

## Dependencies
- `src/lib/storage/s3.ts` — S3 client singleton, presign/head/range-get/delete, media policy
  (kind allowlists, caps, sniffing family rules — single source of truth for presign + create)
- `src/lib/services/errors` (`ApiError`/`toResponse`), `src/lib/services/ownership`
  (`assertCan`), `src/lib/utils/sanitize` (`sanitizeText`)
- `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `file-type`
- Prisma models: `Document`, `Task`, `Job`, `List`, `Note`, `User`

## Note
Serving safety lives in the storage layer (media-only origin, sniffed content types,
`nosniff`); the API guarantees only allowlisted types can be registered. HEIF files are
sniffed by file-type as `image/heif` and accepted under the image kind.
