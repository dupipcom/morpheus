# Wallet Service

## Purpose

Wallet lifecycle around the off-chain ledger (Phase 6): default wallet at signup, self-healing `getOrCreateDefaultWallet` for pre-existing users, and recipient resolution across the shared `/@` namespace.

## Files

- `walletService.ts` — default-wallet lifecycle + recipient resolution
- `index.ts` — barrel re-export

## Key Exports

| Export | Purpose |
|---|---|
| `getOrCreateDefaultWallet(userInternalId)` | The user's default wallet — created on first call (idempotent; Clerk webhook retries safe) |
| `countUserWallets(userInternalId)` | USER-kind wallet count for the 5-wallet cap (system kinds don't count) |
| `USER_WALLET_CAP` | 5 |
| `resolveRecipient(target)` | Resolve wallet id / address / @handle to `{ walletId, displayName }`; users today, orgs in Phase 7, projects 404 until the donate follow-up |

## Consumers

- `src/app/api/v1/auth/route.ts` (default wallet at signup)
- `src/app/api/v1/wallet/route.ts`, `src/app/api/v1/wallet/transfer/route.ts`, `src/app/api/v1/wallet/resolve/route.ts`

## Notes

- Kaleido address provisioning is lazy and non-blocking: the DB wallet exists immediately with `address: null`.

## Cross-References

- `src/lib/services/ledger` (movement engine)
- `src/app/api/v1/wallet/CLAUDE.md`
- `src/lib/services/CLAUDE.md`
