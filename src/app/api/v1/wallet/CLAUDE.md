# Wallet API

## Routes
- `GET /api/v1/wallet`
- `POST /api/v1/wallet`
- `GET /api/v1/wallet/[walletId]`
- `DELETE /api/v1/wallet/[walletId]`
- `GET /api/v1/wallet/[walletId]/statement` (Phase 6 — paginated ledger entries)
- `POST /api/v1/wallet/[walletId]/sync-onchain` (Phase 6 — opt-in Kaleido mirror)
- `GET /api/v1/wallet/resolve` (Phase 6 — recipient resolution across the shared /@ namespace)
- `POST /api/v1/wallet/nft`
- `GET /api/v1/wallet/nft/list`
- `POST /api/v1/wallet/transfer`

## Auth
All routes require Clerk auth and verify the wallet belongs to the internal `User`.

## GET `/wallet`
Lists the user's wallets with authoritative DB `balance`/`pendingBalance` (minor units) first; on-chain balance only with `?includeOnChain=true` (never blocks the response). Self-heals the default wallet.

## POST `/wallet`
Creates a wallet (max 5 USER-kind). The Kaleido address is lazy — an outage or unset env never blocks creation.

## GET `/wallet/[walletId]/statement`
Cursor-paginated ledger entries for an owned wallet, newest first, with `balanceAfter` on each entry.

## POST `/wallet/[walletId]/sync-onchain`
Explicit, opt-in Kaleido mirror (address + balance refresh). 503 on Kaleido failure without touching the ledger.

## GET `/wallet/resolve?username=`
Resolves a wallet id / address / @handle to `{ walletId, displayName }` (users today; orgs Phase 7; projects later).

## POST `/wallet/transfer`
Off-chain DPIP transfer over `ledgerService.transfer`. Body: `{ fromWalletId, toWalletId | toAddress | toUsername, amount, note?, reference? }`. `amount` is decimal DPIP (converted to integer minor units server-side). Idempotent on `reference`.

## Dependencies
- `src/lib/services/ledger` (`transfer`, `getStatement`), `src/lib/services/wallet` (`getOrCreateDefaultWallet`, `resolveRecipient`, `countUserWallets`)
- `src/lib/utils/kaleido` (`generateWallet`, `getBalance`, `generateNFT`, `getNFTs`) — lazy, never on the transfer critical path
- `src/lib/utils/money` (minor-unit conversion at the boundary)
- Prisma models: `Wallet`, `Transaction`, `LedgerEntry`, `User`

## Notes
- The legacy `POST /wallet/transfer` (Kaleido `sendTokens`, `pending` rows) is replaced by the off-chain ledger transfer. On-chain mirroring is opt-in via `/sync-onchain`.
- Reconciliation: `GET /api/cron/ledger-reconcile` (hourly) sweeps abandoned PENDING rows and verifies ledger invariants.
