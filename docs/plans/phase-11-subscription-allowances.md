# Phase 11 — Subscription DPIP allowances

**Goal:** every paying subscriber's wallet is credited with their monthly DPIP allowance, exactly
once per billing period, driven by a billing webhook and reconciled by a cron so a missed webhook
never costs a user their tokens.

Depends on: Phase 6 (ledger, default wallets, treasury).

Today: plans live only in the Clerk dashboard, rendered by `<PricingTable for="user" />` in
`src/views/pricing/pricingView.tsx`; entitlements are read at runtime with
`useAuth().has({ feature })` in `useFeatureFlag`; there is **no** subscription record, no billing
webhook, and one cron (`/api/cron/unread-chat-emails`, `CRON_SECRET` bearer auth).

## 11.1 Plan catalog — `src/lib/billing/plans.ts`

Code-side mirror keyed by the Clerk plan slug (the dashboard stays the source of truth for price
and entitlements; this file is the source of truth for **DPIP allowance**):

| Slug (Clerk) | Plan | Price/mo | DPIP/mo | Extras |
|---|---|---|---|---|
| `donator` | Dupip Donator (Starter) | $4.17 | **5** | AI Assistant, Lounge, Gallery |
| `donator_plus` | Dupip Donator Plus | $8.34 | **10** | AI Assistant, Lounge, Gallery |
| `donator_pro` | Dupip Donator Pro | $16.67 | **20** | + Virtual Numbers ×1, Coworking |
| `donator_ultra` | Dupip Donator Ultra | $41.67 | **50** | + Virtual Numbers ×3, Coworking |
| `donator_max` | Dupip Donator Max | $83.34 | **100** | + Virtual Numbers ×5, Coworking |

```ts
export const PLANS = {
  donator:       { monthlyDpip: 5,   virtualNumbers: 0, features: ['ai_assistant','lounge','gallery'] },
  donator_plus:  { monthlyDpip: 10,  virtualNumbers: 0, features: ['ai_assistant','lounge','gallery'] },
  donator_pro:   { monthlyDpip: 20,  virtualNumbers: 1, features: ['ai_assistant','virtual_number','lounge','gallery','coworking'] },
  donator_ultra: { monthlyDpip: 50,  virtualNumbers: 3, features: [...] },
  donator_max:   { monthlyDpip: 100, virtualNumbers: 5, features: [...] },
} as const
```

Unknown slug → `monthlyDpip: 0` + a loud server-side log (never guess an amount). The exact slugs
must be read from the Clerk dashboard before implementation and asserted by a startup check.
Marketing copy (access to lounges/galleries/studios/co-workings/residences "based on availability,
consumes DPIP") stays in `src/locales/en.json` under `pricing.plans.*` — it is not duplicated here.

## 11.2 Model

```prisma
model Subscription {
  id                 String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  userId             String   @db.ObjectId
  user               User     @relation("Subscriptions", fields: [userId], references: [id], onDelete: Cascade)
  provider           String   @default("CLERK")
  externalId         String   @unique          // Clerk subscription (item) id
  planSlug           String
  status             String                    // ACTIVE | PAST_DUE | CANCELED | EXPIRED | TRIALING
  monthlyDpipMinor   Int      @default(0)      // snapshot at write time, MINOR UNITS
  currentPeriodStart DateTime?
  currentPeriodEnd   DateTime?
  cancelAtPeriodEnd  Boolean  @default(false)
  raw                Json?                     // last provider payload, for forensics
  grants             AllowanceGrant[]
  @@index([userId, status]) @@index([status, currentPeriodEnd])
}

model AllowanceGrant {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt      DateTime @default(now())
  subscriptionId String   @db.ObjectId
  subscription   Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  userId         String   @db.ObjectId
  walletId       String   @db.ObjectId
  planSlug       String
  periodKey      String                       // "2026-08" or the ISO date of currentPeriodStart
  amount         Int                          // MINOR UNITS (Phase 6 convention)
  transactionId  String   @db.ObjectId
  source         String   @default("WEBHOOK") // WEBHOOK | CRON | MANUAL
  @@unique([userId, periodKey, planSlug])     // one grant per plan per period
  @@index([userId, periodKey])                // supports the per-period ceiling query
  @@index([subscriptionId])
}
```

Two guards, not one:

1. `@@unique([userId, periodKey, planSlug])` makes "the same webhook twice" and "webhook *and*
   cron" harmless — the second insert throws P2002 and the grant is skipped.
2. A **per-period ceiling**: before granting, sum `AllowanceGrant.amount` for
   `(userId, periodKey)` across *all* plan slugs. The grant is capped at
   `max(0, targetPlan.monthlyDpip − alreadyGrantedThisPeriod)`. Without this, an
   upgrade→downgrade→upgrade sequence inside one period could produce several plan-slug rows and
   overgrant. The ceiling read and the grant run inside one `prisma.$transaction` so concurrent
   plan-change events serialise.

## 11.3 Grant service — `src/lib/services/billing/allowanceService.ts`

```
grantAllowance({ subscription, periodKey, source }):
  1. plan = PLANS[subscription.planSlug]; if !plan or monthlyDpip === 0 → skip + log
  2. wallet = getOrCreateDefaultWallet(subscription.userId)          // Phase 6
  3. prisma.$transaction:
       granted = Σ AllowanceGrant.amount where { userId, periodKey }   // all plan slugs
       amount  = max(0, toMinor(plan.monthlyDpip) - granted)           // per-period ceiling
       if (amount === 0) → done
       reference = `allowance:${userId}:${periodKey}:${planSlug}`
       ledgerService.credit(tx, { from: SYSTEM:treasury, to: wallet, amountMinor: amount,
                                  kind: 'ALLOWANCE_GRANT', reference })
       create AllowanceGrant                                          // P2002 ⇒ already granted
```

`periodKey(subscription)` = `currentPeriodStart` ISO date when the provider supplies it, else
`YYYY-MM` of "now" — so a monthly plan gets exactly one grant per calendar month even when period
data is missing.

Proration/upgrades: the ceiling in step 3 *is* the proration policy — an upgrade mid-period tops up
to the new plan's amount and never re-grants what was already issued. Downgrades grant nothing
until the next period. Cancellation never claws back granted DPIP.

## 11.4 Webhook — `POST /api/v1/webhooks/clerk-billing`

- Svix signature verification, shared with the existing Clerk webhook helper.
- Handles subscription lifecycle events (names verified against the Clerk dashboard at
  implementation time — the handler switches on a normalised event family and **ignores unknown
  types safely**): created / updated / active / past_due / canceled, plus item-level variants.
- Maps payload → `Subscription` upsert on `externalId`; when the resulting status is active and the
  period is new, calls `grantAllowance(source: 'WEBHOOK')`.
- Always returns 200 for handled-or-ignored events; 4xx only for signature failures (so the
  provider doesn't retry-storm on our bugs).
- Every payload is stored in `Subscription.raw` for debugging drift.

## 11.5 Cron — `/api/cron/dpip-allowances`

Registered in `vercel.json` alongside the existing entry, daily at `0 6 * * *`,
`Authorization: Bearer $CRON_SECRET` via the existing `isAuthorizedCronRequest`.

Per run:
1. Ensure every user has a default wallet (self-healing for pre-Phase-6 accounts).
2. **Page Clerk's own subscription list**, not just our mirror — a subscription whose `created`
   webhook was never delivered has no local row to reconcile, so a local-only scan would silently
   never pay that user. Each Clerk subscription is upserted into `Subscription`, then, if
   active and the period has no grant, `grantAllowance(source: 'CRON')` runs.
3. Only mark a local subscription `EXPIRED` when **Clerk** reports it inactive/absent. Never expire
   from local period dates alone — a missed renewal webhook would otherwise revoke a paying user.
4. Emit a summary log (subscriptions seen, grants issued, total DPIP) for observability.

`maxDuration = 300`, batched in pages of 200 with a cursor so it scales past one run's budget.

## 11.6 UI

- `src/views/pricing/pricingView.tsx` — each plan card gains its DPIP allowance line, sourced from
  `PLANS` so the marketing copy and the code can't drift.
- `src/components/walletBalanceCard.tsx` (Phase 6) shows "Next allowance: 20 DPIP on 1 Sep" from
  the active subscription.
- `/app/invest` gains a subscription panel: current plan, period, grant history (from
  `AllowanceGrant` + statement entries), manage-subscription link to Clerk.

## Migrations

- `0030-backfill-subscriptions.js` — page through Clerk subscriptions, upsert `Subscription` rows.
  **Grants no DPIP retroactively** (deliberate: back-crediting is a treasury decision, run manually
  with `source: 'MANUAL'` if approved).

## Verification

- Simulate the webhook for a new `donator_pro` subscription → wallet +20 DPIP, one
  `AllowanceGrant`, one `ALLOWANCE_GRANT` transaction with two ledger entries.
- Re-deliver the identical webhook → no second credit, no error surfaced to Clerk.
- **Never deliver the webhook at all** (subscription exists only in Clerk) → the cron discovers it
  from Clerk's API, creates the mirror and grants once.
- Delete the grant row's webhook path (simulate a missed event) then run the cron → granted once,
  `source: 'CRON'`.
- Run the cron twice in a row → the second run grants nothing.
- Upgrade `donator` → `donator_pro` mid-period → +15 DPIP, not +20; then downgrade and upgrade
  again in the same period → still a 20 DPIP total for that period (ceiling holds).
- Cancel → no further grants after `currentPeriodEnd`, balance untouched; a locally "expired-looking"
  but Clerk-active subscription is **not** expired by the cron.
- A user with no wallet at all (legacy account) gets one created and credited.
- Treasury balance decreases by exactly the sum of all grants issued.
