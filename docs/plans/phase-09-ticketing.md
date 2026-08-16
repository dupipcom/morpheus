# Phase 9 — Ticketing & checkout (DPIP)

**Goal:** sell and reserve seats in DPIP, with tiered pricing, promo/early-bird windows, bundles,
and deposit-now / pay-rest-at-the-door. Money moves only through the Phase 6 ledger.

Depends on: Phase 6 (ledger), Phase 8 (events).

## 9.1 Model

```prisma
model TicketTier {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  eventId       String   @db.ObjectId
  event         Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name          String                     // "Early bird", "Promo 3-pack", "Door"
  description   String?
  kind          String   @default("PAID")  // PAID | FREE | DONATION
  unitPrice     Int      @default(0)       // MINOR UNITS, price of ONE issued ticket
  bundleSize    Int      @default(1)       // tickets issued per purchased unit (promo bundles)
  bundlePrice   Int?                       // MINOR UNITS, total for one bundle; defaults to unitPrice × bundleSize
  depositPerTicket Int?                    // MINOR UNITS due now; remainder collected at the door
  salesStartAt  DateTime?
  salesEndAt    DateTime?                  // "10 DPIP until Aug 1"
  capacity      Int?                       // in TICKETS (null = only bounded by Event.capacity)
  sold          Int      @default(0)       // tickets issued from this tier (reserved + paid)
  maxPerUser    Int?     @default(10)
  minQuantity   Int      @default(1)
  visibility    String   @default("PUBLIC")  // PUBLIC | HIDDEN (unlocked by code)
  accessCode    String?
  sortOrder     Int      @default(0)
  active        Boolean  @default(true)
  tickets       Ticket[]
  @@index([eventId, active])
}

model TicketOrder {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  reference     String   @unique          // client-supplied checkout key; shared with the Transaction
  status        String   @default("PENDING") // PENDING | PAID | RESERVED | CANCELLED | REFUNDED | EXPIRED
  eventId       String   @db.ObjectId
  buyerUserId   String   @db.ObjectId
  buyer         User     @relation("TicketOrders", fields: [buyerUserId], references: [id], onDelete: Cascade)
  tierId        String   @db.ObjectId
  quantity      Int      @default(1)      // bundles purchased
  ticketCount   Int      @default(1)      // quantity × bundleSize — the number of Ticket rows
  subtotal      Int                       // MINOR UNITS, server-computed
  amountPaid    Int      @default(0)
  amountDue     Int      @default(0)      // remainder collected at the door
  transactionId String?  @db.ObjectId
  expiresAt     DateTime?                 // reservation hold expiry
  tickets       Ticket[]
  @@index([eventId, status]) @@index([buyerUserId])
}

model Ticket {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  code          String   @unique          // opaque: DPIP-XXXX-XXXX
  qrSecret      String                    // per-ticket HMAC secret (Phase 10)
  status        String   @default("RESERVED") // RESERVED | PAID | CHECKED_IN | CANCELLED | REFUNDED | EXPIRED
  eventId       String   @db.ObjectId
  event         Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  tierId        String   @db.ObjectId
  tier          TicketTier @relation(fields: [tierId], references: [id])
  orderId       String   @db.ObjectId
  order         TicketOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  holderUserId  String   @db.ObjectId
  holder        User     @relation("TicketsHeld", fields: [holderUserId], references: [id], onDelete: Cascade)
  amountPaid    Int      @default(0)      // minor units
  amountDue     Int      @default(0)      // minor units
  reservedUntil DateTime?
  attendedAt    DateTime?
  @@index([eventId, status]) @@index([holderUserId]) @@index([code])
}
```

**Inverse fields this phase adds to Phase 8's models:** `Event.tiers TicketTier[]`,
`Event.tickets Ticket[]`, `Event.orders TicketOrder[]`, `Event.ticketsEnabled Boolean @default(false)`,
`Event.refundPolicy String?`, `Event.allowDoorDebt Boolean @default(false)`, and — critically —
`Event.soldCount Int @default(0)` + `Event.capacity Int?` as the **event-wide** inventory counter.
`User` gains `ticketOrders`, `ticketsHeld`.

**Amount allocation rule (no ambiguity):** `bundlePrice` is the charged total per bundle;
`orderSubtotal = quantity × bundlePrice`. Per-ticket allocation is
`floor(bundlePrice / bundleSize)` with the remainder added to the first ticket, so
`Σ ticket.amountPaid + Σ ticket.amountDue === order.subtotal` **exactly** (asserted in code, in
integer minor units). Deposits are per issued ticket: `order.amountPaid = ticketCount ×
depositPerTicket` for `RESERVE`, `order.subtotal` for `BUY`.

## 9.2 Pricing rules (server-authoritative)

`src/lib/services/ticketing/pricingService.ts`:

- `resolveActiveTiers(event, now, viewer)` — a tier is purchasable when `active`, within
  `[salesStartAt, salesEndAt)`, `sold + ticketsIssued <= capacity` (and the event has room), event
  `PUBLISHED`, event not started (or `allowLateSales`), and (if `HIDDEN`) the supplied `accessCode`
  matches.
- **Early-bird / promo is just tiers with windows** — "10 DPIP until 1 Aug" is a tier with
  `unitPrice: 1000, salesEndAt: 2026-08-01T00:00:00Z`; the next tier takes over automatically. No
  discount-code engine, no coupon table. Organisers set N tiers with N windows.
- **Bundles** are `bundleSize > 1` with a `bundlePrice` (e.g. 3 tickets for 25 DPIP).
- `quote({ tierId, quantity, accessCode })` → `{ unitPrice, bundlePrice, ticketsIssued, subtotal,
  depositTotal, dueAtDoor, currency }`, all minor units. The client only ever *displays* a quote;
  checkout re-quotes server-side and ignores any client-sent amount.

## 9.3 Checkout flows

Everything below — inventory claim, ledger movement, order and ticket creation — happens inside
**one** `prisma.$transaction`, so there is no window in which money moved without tickets or
inventory was claimed without an order. The ledger call is the Phase 6 service running on the same
`tx` handle.

**Buy (full payment)**

```
POST /api/v1/events/:id/checkout { tierId, quantity, mode, accessCode, reference }
  reference is REQUIRED and client-generated (uuid), so a retried request is provably the same order.

  existing = order.findUnique({ reference }); if (existing) return existing     // before any claim
  quote = pricingService.quote(...)                                            // server-authoritative

  prisma.$transaction(tx => {
    1. order = tx.ticketOrder.create({ reference, status: 'PENDING', ...quote })  // P2002 ⇒ replay
    2. tier claim:  tx.ticketTier.updateMany({
         where: { id: tierId, active: true, OR: [{ capacity: null },
                  { sold: { lte: capacity - ticketsIssued } }] },
         data: { sold: { increment: ticketsIssued } } })            // count !== 1 ⇒ SOLD_OUT
    3. event claim: tx.event.updateMany({
         where: { id: eventId, OR: [{ capacity: null },
                  { soldCount: { lte: capacity - ticketsIssued } }] },
         data: { soldCount: { increment: ticketsIssued } } })       // count !== 1 ⇒ EVENT_FULL
    4. ledger.transfer(tx, { from: buyerDefaultWallet, to: SYSTEM:escrow,
                             amountMinor: subtotal, kind: 'TICKET_PURCHASE', reference })
    5. tx.ticket.createMany(ticketCount rows, allocation rule from §9.1)
    6. tx.ticketOrder.update({ status: 'PAID' })
  })
```

Any throw (sold out, event full, insufficient funds) aborts the whole thing: no leaked inventory,
no orphaned debit, no partial order. Step 2's `capacity - ticketsIssued` is computed in the query
builder from the tier's loaded `capacity`; the `OR: [{ capacity: null }]` branch handles unlimited
tiers, which is why the naive `sold < capacity` form isn't used.

**Reserve (deposit)**
Identical, except step 4 moves only `ticketCount × depositPerTicket`
(`kind: 'TICKET_RESERVATION'`), tickets are `RESERVED` with `amountDue` per the allocation rule and
`reservedUntil = min(event.startsAt, now + holdWindow)`. The remainder is collected at the door in
Phase 10 (`kind: 'TICKET_BALANCE'`).

**Free / donation** tiers skip the transfer (donation runs a normal transfer of the chosen amount).

**Escrow → organiser settlement**: funds sit in `SYSTEM:escrow` until
`POST /api/v1/events/[eventId]/settle` (or the daily cron, 24 h after `endsAt`) transfers the net
to the event wallet, then to the owner/org wallet. Cancellation refunds from escrow, which is why
proceeds are not credited directly to the organiser.

**Expiry cron** (`/api/cron/ticket-holds`, hourly): `RESERVED` orders past `expiresAt` that were
never converted → `EXPIRED`, `tier.sold` and `event.soldCount` decremented in the same transaction,
deposit refunded or forfeited per `event.refundPolicy` (default: refund before `startsAt`, forfeit
after).

## 9.4 API

| Endpoint | Notes |
|----------|-------|
| `GET/POST /api/v1/events/[eventId]/tiers` · `PUT/DELETE .../tiers/[tierId]` | Organiser CRUD. A tier with issued tickets can't be deleted, only deactivated; price edits don't affect issued tickets. |
| `POST /api/v1/events/[eventId]/quote` | `{ tierId, quantity, accessCode? }` → quote. |
| `POST /api/v1/events/[eventId]/checkout` | `{ tierId, quantity, mode: 'BUY'\|'RESERVE', accessCode?, reference }` → `{ order, tickets }`. `reference` is required (client-generated uuid) and is the idempotency key for the entire checkout. |
| `GET /api/v1/tickets?scope=mine\|event:<id>&cursor=` | Holder's wallet of tickets / organiser's manifest. |
| `GET /api/v1/tickets/[ticketId]` | Holder or organiser; includes the rotating QR token (Phase 10). |
| `POST /api/v1/tickets/[ticketId]/transfer` | `{ toUsername }` — gift a ticket (re-issues `qrSecret`, logs the transfer). |
| `POST /api/v1/orders/[orderId]/cancel` | Refund per policy through the ledger. |
| `POST /api/v1/events/[eventId]/settle` | Escrow → event wallet → owner wallet. |

## 9.5 UI

- Public event page action bar: **Buy** / **Reserve** buttons per tier with live availability,
  countdown to the current window's `salesEndAt`, and the deposit split shown explicitly
  ("Pay 4 DPIP now, 6 DPIP at the door").
- `src/components/ticketCheckoutDialog.tsx` — quantity, quote, balance check with a link to top up,
  confirm, success state with the ticket(s).
- `src/components/ticketCard.tsx` + `src/app/[locale]/app/be/tickets/page.tsx` — the holder's ticket
  wallet, with QR (Phase 10).
- Manage console: tier editor (drag to sort, window pickers, bundle size, deposit), live sold/
  capacity/revenue, manifest with export.

## Migrations

None required (all-new collections). `0029-enable-event-wallets.js` backfills an `EVENT` wallet for
events created in Phase 8 before this phase shipped.

## Verification

- Two tiers with adjacent windows: before 1 Aug the quote is 10 DPIP; after, it's the next tier —
  purely from the clock, no manual switch.
- Bundle tier `bundleSize: 3, bundlePrice: 2500` issues 3 tickets, debits 25 DPIP, and the three
  tickets' `amountPaid` sum to exactly 2500 minor units (remainder allocation asserted).
- Reserve with a 4 DPIP per-ticket deposit on a 10 DPIP tier → wallet −4, ticket `RESERVED`,
  `amountDue` 6.
- Concurrency: 30 simultaneous buys against a 10-capacity tier → exactly 10 orders, `sold === 10`,
  20 clean "sold out" errors, zero orphaned debits (assert the ledger sum is unchanged for the
  failures).
- Event-level cap: two tiers of 10 under an `Event.capacity` of 15 → the 16th ticket fails with
  `EVENT_FULL`, and `soldCount === 15`.
- Insufficient balance → no inventory leak (`sold` and `soldCount` unchanged).
- Replayed `reference` → the same order, one debit, no extra tickets — including when the retry
  arrives while the first request is still in flight.
- Crash injected between the ledger transfer and ticket creation → nothing persisted; the buyer's
  balance is intact and the seats are free.
- Cancel before `startsAt` → refund lands, ticket `REFUNDED`, `sold`/`soldCount` decremented.
- Hold expiry cron flips an unpaid reservation to `EXPIRED` and frees the seat.
