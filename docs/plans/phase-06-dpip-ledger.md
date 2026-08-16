# Phase 6 — DPIP ledger & wallets

**Goal:** DPIP becomes a spendable, auditable platform balance. Off-chain ledger is the source of
truth; Kaleido becomes an optional mirror. Prerequisite for ticketing (9) and allowances (11).

Today: `Wallet` has no balance (balance is fetched live from Kaleido `balanceOf`), wallets are
created manually (max 5, `POST /api/v1/wallet`), and `POST /api/v1/wallet/transfer` writes a
`Transaction { status: 'pending' }` that nothing ever settles.

## 6.1 Model

```prisma
model Wallet {
  // existing: name, address, visibility, userId, budgetIds, noteIds, documentIds
  balance         Int      @default(0)      // authoritative spendable DPIP, in MINOR UNITS (1 DPIP = 100)
  pendingBalance  Int      @default(0)      // held by open reservations/escrow, minor units
  currency        String   @default("DPIP")
  kind            String   @default("USER") // USER | ORG | EVENT | ESCROW | SYSTEM
  isDefault       Boolean  @default(false)
  ownerType       String   @default("USER") // USER | ORG   (Phase 7 populates ORG)
  orgId           String?  @db.ObjectId
  eventId         String?  @db.ObjectId     // Phase 8: event proceeds wallet
  onChainSyncedAt DateTime?
  frozen          Boolean  @default(false)
  entries         LedgerEntry[]
  @@index([ownerType, orgId])
  @@index([userId, isDefault])
}

model LedgerEntry {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt     DateTime @default(now())
  transactionId String   @db.ObjectId
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  walletId      String   @db.ObjectId
  wallet        Wallet   @relation(fields: [walletId], references: [id], onDelete: Cascade)
  direction     String   // DEBIT | CREDIT
  amount        Int      // always positive, minor units
  balanceAfter  Int
  currency      String   @default("DPIP")
  @@index([walletId, createdAt])
  @@index([transactionId])
}

model Transaction {
  // existing: amount (legacy Float, retained), type, status, fromAddress, toAddress, userId, walletId, ...
  amountMinor   Int?                      // new authoritative amount; legacy `amount` kept for old rows
  reference     String   @unique          // idempotency key
  kind          String                    // TRANSFER | TICKET_PURCHASE | TICKET_RESERVATION |
                                          // TICKET_BALANCE | REFUND | ALLOWANCE_GRANT | PAYOUT | ADJUSTMENT
  fromWalletId  String?  @db.ObjectId
  toWalletId    String?  @db.ObjectId
  eventId       String?  @db.ObjectId
  ticketId      String?  @db.ObjectId
  metadata      Json?
  settledAt     DateTime?
  failureReason String?
  onChainTxHash String?
  entries       LedgerEntry[]
  @@index([kind, status])
  @@index([fromWalletId]) @@index([toWalletId])
}
```

`Transaction.status` is normalised to `PENDING | SETTLED | FAILED | REVERSED` (existing lowercase
`'pending'` rows migrated).

Every value movement produces exactly **two** `LedgerEntry` rows (one DEBIT, one CREDIT) whose
amounts sum to zero across the system. `SUM(DEBIT) - SUM(CREDIT)` over all entries is the ledger's
invariant and is asserted by the reconciliation job.

## 6.2 Money handling — `src/lib/utils/money.ts`

`toMinor(dpip): number` (×100, rounded — boundary parsing only), `fromMinor(minor): number`,
`formatDpip(minor, locale)`, `assertPositiveMinor(minor)`. **Every persisted monetary value and
every arithmetic operation is in integer minor units.** Floats exist only in JSON at the edge and
in locale formatting. `Int` tops out at ~21.4 M DPIP per row, which is far above any expected
value; if that ever changes, the fields move to `BigInt` (also supported by Prisma-on-Mongo) —
noted here so the decision is deliberate.

## 6.3 Ledger service — `src/lib/services/ledger/ledgerService.ts`

```ts
transfer({ fromWalletId, toWalletId, amountMinor, kind, reference, metadata, actorUserId })
hold({ walletId, amountMinor, reference, ... })  // balance → pendingBalance (reservations)
capture({ reference, amountMinor })              // pendingBalance → transfer to destination
release({ reference })                           // pendingBalance → balance (expiry/cancel)
credit({ walletId, amountMinor, kind, reference })// system-issued (allowances)
getBalance(walletId) / getStatement(walletId, { cursor, kind })
```

**Atomicity: a single interactive transaction, not compensation.** MongoDB Atlas runs as a replica
set, so Prisma 6's interactive `prisma.$transaction(async (tx) => { … })` gives real multi-document
atomicity. The whole movement — debit, credit, both ledger entries, transaction status — commits or
aborts together. A `DATABASE_URL` without a replica set is a **deployment error**, asserted at boot
(`assertTransactionalDatabase()`), because the ledger's correctness depends on it.

```
transfer(...):
  existing = await tx.transaction.findUnique({ where: { reference } })
  if (existing?.status === 'SETTLED') return existing            // idempotent replay
  await prisma.$transaction(async (tx) => {
    1. tx.transaction.create({ reference, status: 'PENDING', ... })   // P2002 ⇒ concurrent replay
    2. const debited = await tx.wallet.updateMany({
         where: { id: fromWalletId, frozen: false, balance: { gte: amountMinor } },
         data:  { balance: { decrement: amountMinor } } })
       if (debited.count !== 1) throw new ApiError(400, 'INSUFFICIENT_FUNDS')
    3. tx.wallet.update({ where: { id: toWalletId }, data: { balance: { increment: amountMinor } } })
    4. tx.ledgerEntry.createMany([ DEBIT(from), CREDIT(to) ])         // balanceAfter read inside tx
    5. tx.transaction.update({ status: 'SETTLED', settledAt: now })
  }, { maxWait: 5000, timeout: 15000 })
```

Points that matter:

- The **conditional `updateMany` with `{ balance: { gte } }`** is still how the debit is expressed —
  it is a compare-and-set, so two concurrent transfers can never both pass the balance check. Naive
  read-then-write is forbidden.
- Insufficient funds throws **inside** the transaction, so the `PENDING` row is rolled back too;
  the caller gets a clean 400 with no residue. (A separate `FAILED` audit row is written outside
  the transaction when we want the attempt recorded.)
- `credit()` from the treasury skips the balance guard: `SYSTEM:treasury` is the issuer and is
  allowed to go negative — its negative balance is precisely the amount of DPIP in circulation.
- **Recovery sweep** (`/api/cron/ledger-reconcile`, hourly): any `PENDING` transaction older than
  15 minutes is an abandoned/crashed attempt; it is marked `FAILED` after verifying it has zero
  ledger entries. Transactions with exactly one entry are impossible under the transactional design
  and are alarmed as data corruption rather than auto-repaired.
- Invariant check in the same job: `Σ DEBIT − Σ CREDIT = 0`, and every wallet's `balance` equals the
  `balanceAfter` of its newest entry. Divergence pages the team; it never silently rewrites balances.

## 6.4 Wallet lifecycle

- **Default wallet at signup**: `POST /api/v1/auth` (`user.created`) creates the internal `User`,
  `Profile` **and** a default `Wallet { kind: 'USER', isDefault: true, balance: 0 }`. Idempotent
  (checks for an existing default first — Clerk retries webhooks).
- `getOrCreateDefaultWallet(userId)` in the wallet service is called defensively by anything that
  needs to move money, so pre-existing users self-heal on first use.
- Kaleido `generateWallet()` becomes **lazy and non-blocking**: the DB wallet exists immediately
  with `address: null`; the address is provisioned on demand (first on-chain-facing action) or by
  the reconcile cron. A Kaleido outage can no longer block signup or a purchase.
- Keep the 5-wallet cap for user-created extra wallets; system wallets (`EVENT`, `ESCROW`,
  `SYSTEM`) don't count.

### System wallets

Seeded once by migration: `SYSTEM:treasury` (source of allowance grants, may go negative — it's the
issuer) and `SYSTEM:escrow` (holds ticket funds until an event settles).

## 6.5 API

| Endpoint | Notes |
|----------|-------|
| `GET /api/v1/wallet` | Now returns DB `balance`/`pendingBalance` first; on-chain balance moves to an optional `?includeOnChain=true` (never blocks the response). |
| `POST /api/v1/wallet/transfer` | Rewritten over `ledgerService.transfer`. Body `{ toAddress \| toWalletId \| toUsername, amount, note?, reference? }`. Server generates `reference` if absent. Returns the settled transaction + new balance. |
| `GET /api/v1/wallet/[walletId]/statement?cursor=` | New — paginated ledger entries with running balance. |
| `GET /api/v1/wallet/resolve?username=` | Resolve a recipient's default wallet for the transfer UI. |
| `POST /api/v1/wallet/[walletId]/sync-onchain` | Explicit, manual Kaleido mirror (admin/opt-in). |

## 6.6 UI

- `src/components/tokenTransfer.tsx` — recipient by username or address, amount with balance-aware
  validation, confirm step, optimistic SWR update, error surface for insufficient funds.
- `src/components/walletBalanceCard.tsx` — balance, pending, statement list (new).
- `src/views/invest/investView.tsx` — surfaces the statement; NFT/Kaleido panels stay as-is.

## Migrations

- `0021-create-default-wallets.js` — one default wallet per existing user (skips users who already
  have one; marks the oldest as `isDefault`), `balance: 0` in minor units.
- `0022-normalize-transactions.js` — lowercase `status`/`type` → the new enums-as-strings, derive
  `kind` (`'transfer'` → `TRANSFER`), set `amountMinor = round(amount × 100)`, backfill `reference`
  (`legacy:<_id>`), resolve `fromWalletId`/`toWalletId` from addresses where possible; unresolvable
  rows → `status: FAILED`, `failureReason: 'legacy-unsettled'` (they never moved value: no ledger
  entries are written).
- `0023-seed-system-wallets.js` — treasury + escrow.
- `0024-backfill-ledger-entries.js` — for `SETTLED` legacy transfers only, write the paired entries
  and set `balanceAfter` by replaying in `createdAt` order. Balances start at 0; any Kaleido
  holdings are *not* auto-credited (that is a deliberate, separately approved treasury action).

## Verification

- Transfer 10 DPIP A→B: both balances change, 2 ledger entries, `SETTLED`, statement shows it.
- Replay the same `reference` → returns the same transaction, no double movement.
- Transfer more than the balance → 400, balances untouched, **no** `PENDING` residue.
- 50 concurrent transfers of 1 DPIP from a wallet holding 10 → exactly 10 succeed
  (script it; this is the overspend test).
- Kill the process mid-transfer (fault injection between debit and credit) → after restart the
  balances are unchanged (transaction aborted) and the reconcile job reports nothing to fix.
- Boot with a non-replica-set `DATABASE_URL` → `assertTransactionalDatabase()` fails loudly.
- Sum of all `LedgerEntry` DEBIT − CREDIT = 0; each wallet's `balance` equals its last
  `balanceAfter`; treasury's negative balance equals total DPIP in circulation.
- New signup (Clerk test webhook, delivered twice) → exactly one default wallet.
- Kaleido env unset → signup, transfer and wallet listing still work.
