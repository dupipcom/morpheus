# Notes API

## Routes
- `GET /api/v1/notes`
- `POST /api/v1/notes`
- `PUT /api/v1/notes/[noteId]`
- `PATCH /api/v1/notes/[noteId]`
- `DELETE /api/v1/notes/[noteId]`
- `GET /api/v1/notes/[noteId]/comments`
- `POST /api/v1/notes/[noteId]/comments`
- `GET /api/v1/notes/public`

## Auth
`notes` collection and `[noteId]` require Clerk auth. `notes/public` is public but visibility-aware. `[noteId]/comments` GET is public; POST requires auth.

## GET `/notes`
Lists notes where the current user is owner or recipient. Supports `visibility` (comma-separated) and `noteId` (prioritized filter). Includes sorted comments, sender/recipient summaries, and like/comment counts.

When `userId` targets another user, requires a `Delegation` from that user to the caller (403 otherwise) and returns the target's notes filtered to the visibilities the delegation unlocks (scope allow-list plus `DOC_ENABLED`, which any delegation unlocks).

## POST `/notes`
Creates a note. Body: `{ content, visibility?, date?, recipientId? }` plus optional reference arrays (`documentIds`, `location`, `profileIds`, `listIds`, `taskIds`, `eventIds` — validated for shape/ownership/visibility). Sanitizes `content`. `visibility` is validated against `WRITABLE_NOTE_VISIBILITIES` and defaults to the user's `defaultNoteVisibility`, then `PRIVATE`. If `recipientId` is supplied, validates a delegation exists from the recipient to the sender. **Reposts**: `content` may be empty when at least one reference array is present (a pure reference share — used by the BeView Repost flow; no attachments or sensitive metadata travel).

## PUT `[noteId]`
Updates own note content/visibility/date. Enforces ownership.

## PATCH `[noteId]`
Updates own note visibility only. Validates visibility against `WRITABLE_NOTE_VISIBILITIES` (includes `DOC_ENABLED`).

## DELETE `[noteId]`
Deletes own note. Enforces ownership.

## `[noteId]/comments`
- GET: lists comments for the note (matches `noteId` or legacy `entityType=note`).
- POST: creates a comment (auth required; sanitizes via `create`; content not sanitized in this route — note below).

## `notes/public`
Paginated visibility-aware public notes. Supports `page`, `limit`, `sort`, `noteId`, `profileId`. Uses `buildVisibilityWhereClause`, relevance scoring, and batch profile enrichment.

## Dependencies
- `src/lib/services/visibility`
- `src/lib/utils/profileUtils`, `src/lib/utils/noteRelevance`
- Prisma models: `Note`, `Comment`, `Like`, `User`, `Profile`, `Delegation`

## Note
`POST /notes/[noteId]/comments` does not currently sanitize `content`; prefer `/api/v1/comments` which sanitizes.
