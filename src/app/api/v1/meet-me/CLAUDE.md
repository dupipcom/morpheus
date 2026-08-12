# Meet Me API

## Routes
- `POST /api/v1/meet-me` — book a meeting.
- `GET /api/v1/meet-me/availability` — fetch CalDAV busy slots.

## Auth
Both require Clerk auth.

## POST `/meet-me`
Body: `{ profileUsername, startTime, endTime, message? }`.
- Validates presence and date ordering (`end > start`).
- Resolves the target profile owner and their Clerk email.
- Builds a Safari-friendly ICS calendar invite, sanitizes `message`, and emails the profile owner and booking user via Brevo SMTP (`nodemailer`).

## GET `/meet-me/availability`
Query params: `username`, `start`, `end` (ISO dates).
- Validates dates, `end > start`, and max 60-day range.
- Resolves the target profile.
- Uses the requester's Clerk OIDC token to fetch CalDAV busy slots via `fetchCalendarAvailability`.

## Response
- Booking: `{ success: true, message }`.
- Availability: `{ busy: [...] }` or `{ busy, warning }`.

## Errors
- `400`: missing/invalid fields, invalid dates, range > 60 days, no email.
- `401`: unauthorized.
- `404`: profile/user not found.

## Dependencies
- `src/lib/services/caldav`
- Clerk client, nodemailer, Brevo SMTP env vars
- Prisma models: `Profile`, `User`
