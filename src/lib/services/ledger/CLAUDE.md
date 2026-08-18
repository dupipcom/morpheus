# Ledger Service

## Purpose

DPIP off-chain ledger (Phase 6): `Wallet.balance`/`pendingBalance` + double-entry `LedgerEntry` rows behind every `Transaction` are the source of truth; Kaleido is an optional mirror never on the critical path. Dual-mode atomicity: single interactive `prisma.$transaction` on a replica set (production), sequential idempotent steps with compensation on standalone Mongo (dev). See `docs/plans/phase-06-dpip-ledger.md` §6.3 for the deviation decision.

## Files

- `ledgerService.ts` — transfer/hold/release/credit, statement, reconcile, transaction-support probe
- `index.ts` — barrel re-export

## Key Exports

| Export | Purpose |
|---|---|
| `supportsTransactions` | Cached `hello` probe — is the DB a replica set? |
| `assertTransactionalDatabase` | Boot check; strict only when `LEDGER_REQUIRE_TRANSACTIONS=true` |
| `newReference` | Server-generated idempotency key |
| `transfer` | Move DPIP between wallets; idempotent on `reference`; compare-and-set debit in both modes |
| `hold` / `release` | Reservation engine (balance ↔ pendingBalance) for Phase 9 ticketing |
| `credit` | Treasury-issued credit (treasury may go negative — it's the issuer) |
| `getBalance` / `getStatement` | Reads (statement is cursor-paginated, newest first) |
| `reconcile` | Hourly sweep: abandoned PENDING → FAILED, one-entry corruption alarm, invariant checks (ΣDEBIT−ΣCREDIT=0, balance === latest balanceAfter) — reports, never rewrites |

## Consumers

- `src/app/api/v1/wallet/transfer/route.ts`, `src/app/api/v1/wallet/[walletId]/statement/route.ts`
- `src/app/api/cron/ledger-reconcile/route.ts`
- Phase 9 (ticketing) will call `hold`/`release`

## Notes

- Money is integer minor units everywhere in this service (`src/lib/utils/money.ts` converts at the boundary only).
- The debit is always the conditional `updateMany { balance: { gte } }` compare-and-set — never read-then-write.

## Cross-References

- `src/lib/services/wallet` (wallet lifecycle, recipient resolution)
- `src/lib/utils/money.ts`
- `src/app/api/v1/wallet/CLAUDE.md`
- `src/lib/services/CLAUDE.md`
