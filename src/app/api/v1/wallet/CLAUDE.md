# Wallet API

## Routes
- `GET /api/v1/wallet`
- `POST /api/v1/wallet`
- `GET /api/v1/wallet/[walletId]`
- `DELETE /api/v1/wallet/[walletId]`
- `POST /api/v1/wallet/nft`
- `GET /api/v1/wallet/nft/list`
- `POST /api/v1/wallet/transfer`

## Auth
All routes require Clerk auth and verify the wallet belongs to the internal `User`.

## GET `/wallet`
Lists the user's wallets, enriching each with a blockchain balance from Kaleido.

## POST `/wallet`
Creates a wallet (max 5 per user). Generates an address via `generateWallet`. Body: `{ name? }`.

## GET `/wallet/[walletId]`
Returns a single owned wallet with blockchain balance.

## DELETE `/wallet/[walletId]`
Deletes an owned wallet.

## POST `/wallet/nft`
Mints an NFT to an owned wallet. Body: `{ walletId }`. Uses `generateNFT`.

## GET `/wallet/nft/list?walletId=`
Lists NFTs for an owned wallet address via `getNFTs`.

## POST `/wallet/transfer`
Transfers tokens from an owned wallet. Body: `{ fromWalletId, toAddress, amount }`. Uses `sendTokens` and records a `Transaction` with status `pending`.

## Dependencies
- `src/lib/utils/kaleido` (`generateWallet`, `getBalance`, `generateNFT`, `getNFTs`, `sendTokens`)
- Prisma models: `Wallet`, `Transaction`, `User`
