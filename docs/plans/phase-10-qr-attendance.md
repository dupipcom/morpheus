# Phase 10 — QR attendance & door control

**Goal:** a ticket holder shows a QR on their phone; a staff member scans it with theirs; the
scanner sees who the person is, whether they may enter *this event, right now*, and how much they
still owe; confirming stores an immutable attendance record visible to the holder and to the event
manager.

Depends on: Phase 9 (tickets), Phase 6 (ledger, for pay-at-door), Phase 8 (`EventStaff`).

## 10.1 Threat model → token design

A static QR encoding a ticket id can be screenshotted and forwarded. Therefore the QR is a
**short-lived signed token**, not an identifier.

```
payload  = base64url(JSON{ v:1, t: ticketId, e: eventId, w: window })   // window = floor(epochSec/30)
signature= HMAC-SHA256(payload, TICKET_QR_SECRET + ticket.qrSecret)     // server-side secret + per-ticket secret
token    = "dpip1." + payload + "." + base64url(signature).slice(0,22)
```

- `window` rotates every **30 s**; the verifier accepts `window ∈ {n-1, n}` (one window of backward
  skew tolerance, so a token lives at most ~60 s and never validates into the future).
- The holder's ticket page re-derives a fresh token every 20 s while visible.
- `TICKET_QR_SECRET` is server-only; `ticket.qrSecret` **and** the printed `code` are both
  regenerated on ticket transfer, so a forwarded screenshot dies at the next window and a
  transferred ticket invalidates every old credential.
- Offline fallback: the ticket `code` (`DPIP-XXXX-XXXX`) can be typed into the scanner UI, which
  takes the same verify path minus the token check (and is flagged `method: 'MANUAL'`).
- **Honest limits**: rotation does not defeat a real-time relay (a confederate screen-sharing the
  live QR). The mitigations are that check-in is single-use — the first scan wins and the second
  gets `ALREADY_CHECKED_IN` with who and when — and that staff see the holder's photo and name on
  the verdict card. Anything stronger needs identity checks at the door, which is a policy choice,
  not a code change.
- The 22-char (132-bit) truncated signature is not the weak point; rate limits exist to stop noise,
  not to make forgery infeasible.

Rate limits: verify is capped per scanner user (e.g. 120/min) and per ticket (10/min).

## 10.2 Model

```prisma
model Attendance {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt      DateTime @default(now())
  eventId        String   @db.ObjectId
  event          Event    @relation("EventAttendances", fields: [eventId], references: [id], onDelete: Cascade)
  ticketId       String   @unique @db.ObjectId     // one attendance per ticket
  ticket         Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  userId         String   @db.ObjectId             // the attendee
  user           User     @relation("Attendances", fields: [userId], references: [id], onDelete: Cascade)
  scannedByUserId String  @db.ObjectId
  scannedBy      User     @relation("AttendanceScans", fields: [scannedByUserId], references: [id])
  scannedAt      DateTime @default(now())
  method         String   @default("QR")           // QR | MANUAL
  amountCollected Int     @default(0)              // minor units
  transactionId  String?  @db.ObjectId             // the TICKET_BALANCE payment, if any
  location       Json?
  deviceInfo     String?
  @@index([eventId, scannedAt])
  @@index([userId])
}
```

**Inverse fields this phase adds:** `Event.attendances Attendance[] @relation("EventAttendances")`,
`Ticket.attendance Attendance?`, `User.attendances Attendance[] @relation("Attendances")`,
`User.attendanceScans Attendance[] @relation("AttendanceScans")`.

`Ticket.status` moves to `CHECKED_IN` and `attendedAt` is set in the same operation.
`@@unique` on `ticketId` is what makes double-scan impossible at the storage layer.

## 10.3 API

| Endpoint | Behaviour |
|----------|-----------|
| `GET /api/v1/tickets/[ticketId]/qr` | Holder only. Returns `{ token, expiresIn }`. Called on an interval by the ticket page. |
| `POST /api/v1/scan/verify` | Staff only. `{ token \| code, eventId? }` → **read-only** decision payload (see below). Never mutates. |
| `POST /api/v1/scan/confirm` | Staff only. `{ token \| code, collectAmount?, eventId }`. **Re-runs the full verify** — the earlier verify call authorizes nothing. Then, in one `prisma.$transaction`: CAS the ticket (`updateMany where { id, status: { in: ['PAID','RESERVED'] } } → CHECKED_IN`), collect `amountDue` via `ledgerService.transfer(kind: 'TICKET_BALANCE')` if owed, create `Attendance`. Idempotent by construction: the payment reference is **derived**, `ticket-balance:<ticketId>`, and `Attendance.ticketId` is unique — a repeat returns the existing attendance with `alreadyCheckedIn: true` and charges nothing. |
| `GET /api/v1/events/[eventId]/attendance?cursor=` | Organiser manifest: who's in, when, by whom, collected totals; CSV export. |
| `GET /api/v1/user/attendances` | The holder's own attendance history. |

### Verify decision payload

```jsonc
{
  "decision": "ALLOW" | "DENY" | "PAYMENT_DUE",
  "reason": "OK" | "WRONG_EVENT" | "NOT_STARTED" | "ENDED" | "ALREADY_CHECKED_IN" |
            "CANCELLED" | "REFUNDED" | "EXPIRED_RESERVATION" | "INVALID_TOKEN" | "EXPIRED_TOKEN",
  "holder":   { "userId", "username", "displayName", "avatarUrl" },   // profile shown to the scanner
  "event":    { "id", "name", "startsAt", "endsAt", "venueName", "isRunning": true },
  "ticket":   { "id", "code", "tierName", "status", "amountPaid", "amountDue" },
  "alreadyCheckedIn": { "at", "byDisplayName" } | null
}
```

"Right to attend at this point in time" = the token's `eventId` matches the scanner's active event,
the event is within its admission window
(`doorsAt ?? startsAt − 2 h` … `endsAt ?? startsAt + 12 h`, computed in the event's `timezone`),
and the ticket is `PAID` or `RESERVED`. A `RESERVED` ticket with `amountDue > 0` returns
`PAYMENT_DUE` — the scanner UI then shows the amount and a "collect & admit" button, which is the
marketing mechanic (cheap reservation, balance at the door).

**Privacy:** the payload exposes only public profile fields — no email, no wallet balance, no
purchase history.

## 10.4 UI

- **Holder** — `src/app/[locale]/app/be/tickets/[ticketId]/page.tsx`: big QR (`qrcode` npm →
  canvas/SVG, no third-party rendering service), auto-refresh countdown, screen-brightness hint,
  ticket code fallback, event summary, amount still due, add-to-calendar.
- **Scanner** — `src/app/[locale]/app/be/events/[eventId]/door/page.tsx`:
  `BarcodeDetector` when available, `@zxing/browser` fallback; camera permission flow; on decode →
  `verify` → a full-screen green/amber/red verdict card with the holder's photo and name; amber
  (`PAYMENT_DUE`) shows the amount and a confirm-collect action; manual code entry; a running
  session tally (admitted / denied / collected).
  **Offline behaviour: fail closed.** Both verify and confirm require the network; with no
  connectivity the UI shows an explicit "offline — cannot admit" state. There is no offline queue:
  optimistically admitting and reconciling later would let an expired, refunded or already-used
  ticket through and could admit a `PAYMENT_DUE` holder without collecting. An offline mode would
  need signed, pre-downloaded manifests and is deliberately out of scope.
  The success state is only ever rendered **after** `confirm` returns 200.
- Access: `EventStaff` role `SCANNER`/`MANAGER`, or the event owner, or MANAGER+ of the owning org.
  The door page 403s otherwise.
- `src/components/qrTicket.tsx`, `src/components/scanResultCard.tsx`.

Deps to add: `qrcode` (generation), `@zxing/browser` (decode fallback).

## 10.5 Manager visibility

- Event manage console gains an **Attendance** tab: live count vs sold, arrival timeline, per-staff
  scan counts, amounts collected at the door, no-shows, CSV export.
- The holder's profile/dashboard shows attended events (subject to their own visibility settings).

## Migrations

None (new collection only).

## Verification

- Happy path: buy → open ticket → scan with a staff device → ALLOW → attendance stored, ticket
  `CHECKED_IN`, manifest updates.
- Re-scan the same ticket → `ALREADY_CHECKED_IN` with who/when, and **no** second `Attendance` row
  and no second charge.
- Screenshot a QR, wait 2 minutes, scan → `EXPIRED_TOKEN`.
- Scan a valid ticket for event A at event B's door → `WRONG_EVENT`.
- Scan 3 hours before doors → `NOT_STARTED`; after the window → `ENDED`.
- Reserved ticket with 6 DPIP due → `PAYMENT_DUE`; collect → holder debited 6, ledger entries
  written, attendance records `amountCollected: 600` (minor units); retrying the confirm collects
  nothing extra (derived reference).
- Two staff devices confirm the same ticket simultaneously → exactly one `Attendance`, exactly one
  charge, the loser gets `alreadyCheckedIn`.
- Kill the network after `verify` → the UI never shows admitted; `confirm` fails closed.
- Insufficient balance at the door → clear error, no attendance, staff can still admit-with-debt
  only if the organiser enabled it (`event.allowDoorDebt`, default off).
- A non-staff user hitting `/scan/verify` → 403.
- Transfer a ticket to another user → both the old QR **and** the old printed code fail; the new
  holder's work.
