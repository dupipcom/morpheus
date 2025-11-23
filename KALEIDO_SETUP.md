# Kaleido.io Integration Setup Guide

This guide explains how to set up and configure the Kaleido.io blockchain integration in your application.

## Overview

The integration provides:
- Automatic wallet creation on user login
- Wallet management (create, delete, view)
- Wallet selector in balance component
- Token transfers between wallets
- NFT generation and listing (requires NFT contract deployment)
- Transaction history tracking

## Prerequisites

1. A Kaleido.io account and network
2. Kaleido API credentials and endpoints
3. DPIP token contract address
4. (Optional) NFT contract address and gateway if you want to generate NFTs

## Environment Variables

Add the following **required** environment variables to your `.env.local` file:

```bash
# Kaleido API Configuration (Required)
# Root API - used for account creation
KALEIDO_ROOT_API_KEY=your-kaleido-root-api-key               # Root API key for account creation

# Gateway API - used for balance checks and token transfers
KALEIDO_API_KEY=your-kaleido-api-key                        # API key for gateway operations
KALEIDO_API_SECRET=your-kaleido-api-secret                  # API secret for gateway operations

# API Endpoints
KALEIDO_ACCOUNTS_API=https://...kaleido.io/api/v1/consortia/.../eth/accounts  # Accounts API endpoint
KALEIDO_GATEWAY_BASE=https://...kaleido.io/gateways/kaleidoerc20mb  # Gateway base URL
SYMBOL_DPIP_ADDRESS=0x...  # DPIP token contract address

# Optional: NFT Configuration
KALEIDO_NFT_BASE=https://...kaleido.io/gateways/your-nft-gateway  # NFT Gateway base URL
SYMBOL_NFT_MINT_ADDRESS=0x...      # Your NFT contract address (if using NFTs)
KALEIDO_NFT_API_KEY=your-nft-api-key                        # API key for NFT gateway operations
KALEIDO_NFT_API_SECRET=your-nft-api-secret                  # API secret for NFT gateway operations
SYMBOL_NFT_SIGNER=0x...            # Optional: Address that will sign NFT mint transactions
```

### Getting Your Kaleido Endpoints

1. **KALEIDO_ACCOUNTS_API**: Found in your Kaleido console under your node's Ethereum accounts endpoint
   - Format: `https://console-eu1.kaleido.io/api/v1/consortia/{consortium}/environments/{environment}/nodes/{node}/eth/accounts`

2. **KALEIDO_GATEWAY_BASE**: Found in your Kaleido gateway connection details for ERC-20 token operations
   - Format: `https://{environment}-{node}-connect.{region}.kaleido.io/gateways/{gateway-name}`

3. **SYMBOL_DPIP_ADDRESS**: Your deployed DPIP ERC-20 token contract address

4. **KALEIDO_ROOT_API_KEY**: Your Kaleido root API key (found in Kaleido console settings) - used for account creation
   - Used with Bearer token authentication

5. **KALEIDO_API_KEY** and **KALEIDO_API_SECRET**: Your Kaleido gateway API credentials (found in gateway settings) - used for balance checks and token transfers
   - These are Base64 encoded as `KALEIDO_API_KEY:KALEIDO_API_SECRET` for Basic Auth

6. **KALEIDO_NFT_BASE**: Your NFT gateway base URL (similar format to KALEIDO_GATEWAY_BASE but for NFT operations)

7. **SYMBOL_NFT_MINT_ADDRESS**: Your deployed ERC-721 compatible NFT contract address

8. **KALEIDO_NFT_API_KEY** and **KALEIDO_NFT_API_SECRET**: Your NFT gateway API credentials (similar to gateway credentials but for NFT operations)

9. **SYMBOL_NFT_SIGNER**: (Optional) The Ethereum address that will sign NFT mint transactions. If not provided, the gateway will use its default signing account.

## Database Migration

The Wallet model is already defined in `prisma/schema.prisma`. After any schema changes, run:

```bash
npx prisma generate
npx prisma db push
```

Or if using migrations:

```bash
npx prisma migrate dev --name your_migration_name
```

## Security Considerations

### ⚠️ IMPORTANT: Private Key Storage

**The current implementation does NOT store private keys in the database.** Wallets are created through the Kaleido API, which manages the private keys server-side. Only wallet addresses are stored in the database.

This is a secure approach as:
- Private keys never leave Kaleido's secure environment
- Your application only stores public addresses
- No encryption/decryption of private keys is needed

If you need to implement wallet operations that require private keys (e.g., signing transactions locally), you would need to:
1. Store encrypted private keys in the database
2. Use a Key Management Service (KMS) like AWS KMS, Azure Key Vault, or HashiCorp Vault
3. Implement encryption libraries like `crypto` (Node.js built-in) or `@noble/ciphers`
4. Use environment-based encryption keys

## Features

### 1. Automatic Wallet Creation

When a user logs in for the first time, a default wallet is automatically created.

**Location:** `src/app/api/v1/user/login/route.ts`

The login endpoint checks if the user has any wallets, and if not, creates a "Default Wallet" automatically.

### 2. Wallet Management

Users can create and delete wallets through the Wallet Manager component. Each user can have up to 5 wallets.

**Component:** `src/components/walletManager.tsx`
**API Routes:**
- `GET /api/v1/wallet` - List all wallets with blockchain balances
- `GET /api/v1/wallet/[walletId]` - Get a specific wallet by ID
- `POST /api/v1/wallet` - Create a new wallet
- `DELETE /api/v1/wallet/[walletId]` - Delete a wallet

**Wallet Limit:** Maximum of 5 wallets per user

### 3. Wallet Selector in Balance Component

The balance component includes a wallet selector showing blockchain balances for each wallet.

**Component:** `src/components/balanceSection.tsx`

The selected wallet is persisted in localStorage using the key `dpip_selected_wallet`.

### 4. Token Transfers

Users can transfer tokens between wallets using the Kaleido gateway API.

**Component:** `src/components/tokenTransfer.tsx`
**API Route:** `POST /api/v1/wallet/transfer`

**Request Body:**
```json
{
  "fromWalletId": "wallet-id",
  "toAddress": "0x...",
  "amount": "1.5"
}
```

**Response:**
```json
{
  "success": true,
  "transactionHash": "transaction-hash"
}
```

Transactions are automatically recorded in the database with status "pending".

### 5. NFT Generation and Listing

Users can generate (mint) NFTs and view their NFT collection.

**Component:** `src/components/nftGenerator.tsx`
**API Routes:**
- `POST /api/v1/wallet/nft` - Mint an NFT to a wallet
- `GET /api/v1/wallet/nft/list?walletId=...` - Get all NFTs owned by a wallet

**NFT Minting Request:**
```json
{
  "walletId": "wallet-id"
}
```

**NFT Listing Response:**
```json
{
  "success": true,
  "walletId": "wallet-id",
  "address": "0x...",
  "nfts": [
    {
      "tokenId": "1234567890",
      "tokenURI": "https://www.dupip.com?nft=1234567890"
    }
  ],
  "count": 1
}
```

**Note:** NFT generation requires:
- An ERC-721 compatible NFT contract deployed on your Kaleido network
- The contract must implement `mintWithTokenURI(address to, uint256 tokenId, string tokenURI)`
- The contract address set in `SYMBOL_NFT_MINT_ADDRESS`
- NFT gateway credentials set in `KALEIDO_NFT_API_KEY` and `KALEIDO_NFT_API_SECRET`
- NFT gateway base URL set in `KALEIDO_NFT_BASE`

**Token URI Format:** NFTs are minted with token URIs in the format: `https://www.dupip.com?nft={tokenId}`

## Implementation Details

### Wallet Service

The core wallet service is located in `src/lib/kaleido.ts` and uses direct Kaleido API calls (not Viem or other blockchain SDKs).

**Key Functions:**
- `generateWallet()` - Creates a new wallet via Kaleido Accounts API, returns address
- `getBalance(address)` - Gets the token balance for an address using the gateway API
- `sendTokens(fromAddress, toAddress, amount)` - Sends tokens from one address to another
- `generateNFT(toAddress)` - Mints an NFT to an address with auto-generated token URI
- `getNFTs(address)` - Gets all NFTs owned by an address

### API Authentication

The integration uses three different authentication methods:

1. **Root API (Account Creation)**: Bearer token authentication with `KALEIDO_ROOT_API_KEY`
2. **Gateway API (Token Operations)**: Basic Auth with Base64 encoded `KALEIDO_API_KEY:KALEIDO_API_SECRET`
3. **NFT Gateway API (NFT Operations)**: Basic Auth with Base64 encoded `KALEIDO_NFT_API_KEY:KALEIDO_NFT_API_SECRET`

All API calls include the `x-kaleido-sync: true` header for synchronous operations.

### Balance Formatting

Token balances are stored and displayed with 18 decimal places (standard ERC-20 format). The balance is converted from wei (hex or decimal string) to ether (decimal number) for display.

### Transaction Records

When tokens are transferred, a transaction record is created in the database with:
- `type`: "transfer"
- `status`: "pending"
- `fromAddress`: Source wallet address
- `toAddress`: Destination address
- `amount`: Transfer amount
- `walletId`: Reference to the source wallet

## Testing

1. Set up your environment variables in `.env.local`
2. Run the database migration (if needed)
3. Start the development server: `npm run dev`
4. Log in to create your first wallet automatically
5. Navigate to the Invest view to see wallet management, transfers, and NFT generation

## Troubleshooting

### "KALEIDO_ACCOUNTS_API environment variable is required"

Make sure you've set all required environment variables in your `.env.local` file. Check that:
- `KALEIDO_ACCOUNTS_API` is set
- `KALEIDO_GATEWAY_BASE` is set
- `KALEIDO_ROOT_API_KEY` is set
- `KALEIDO_API_KEY` and `KALEIDO_API_SECRET` are set
- `SYMBOL_DPIP_ADDRESS` is set

### "Failed to fetch balance"

- Check that your gateway URL is correct and accessible
- Verify the contract address matches your deployed DPIP token
- Ensure the wallet address is valid
- Check that your gateway API credentials are correct

### "Transaction failed"

- Verify the sender wallet has sufficient balance
- Check that the recipient address is valid
- Ensure network connectivity to Kaleido
- Verify gateway API credentials are correct

### "Failed to mint NFT"

- Ensure all NFT-related environment variables are set:
  - `KALEIDO_NFT_BASE`
  - `SYMBOL_NFT_MINT_ADDRESS`
  - `KALEIDO_NFT_API_KEY`
  - `KALEIDO_NFT_API_SECRET`
- Verify the NFT contract is deployed and implements `mintWithTokenURI`
- Check that the NFT gateway is properly configured
- Ensure the signer address (if using `SYMBOL_NFT_SIGNER`) has permission to mint

### "Maximum wallet limit reached"

Each user can have a maximum of 5 wallets. Delete an existing wallet before creating a new one.

## API Endpoints Summary

### Wallet Endpoints
- `GET /api/v1/wallet` - List all wallets with balances
- `GET /api/v1/wallet/[walletId]` - Get specific wallet
- `POST /api/v1/wallet` - Create new wallet
- `DELETE /api/v1/wallet/[walletId]` - Delete wallet

### Transfer Endpoints
- `POST /api/v1/wallet/transfer` - Transfer tokens

### NFT Endpoints
- `POST /api/v1/wallet/nft` - Mint NFT
- `GET /api/v1/wallet/nft/list?walletId=...` - List NFTs

All endpoints require authentication via Clerk.

## Next Steps

1. **Implement transaction status polling** to update transaction records from "pending" to "completed" or "failed"
2. **Add transaction history viewing** in the UI
3. **Implement gas estimation** for better UX (if applicable)
4. **Add error handling** for network issues with retry logic
5. **Add wallet export/import** functionality (if needed)
6. **Implement batch transfers** for multiple recipients
7. **Add NFT metadata fetching** from token URIs for richer display

## Support

For Kaleido.io specific questions, refer to:
- [Kaleido Documentation](https://docs.kaleido.io/)
- [Kaleido API Reference](https://docs.kaleido.io/api-reference/)
