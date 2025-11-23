# Kaleido.io Integration Setup Guide

This guide explains how to set up and configure the Kaleido.io blockchain integration in your application.

## Overview

The integration provides:
- Automatic wallet creation on user login
- Wallet management (create, delete, view)
- Wallet selector in balance component
- Token transfers between wallets
- NFT generation (requires NFT contract deployment)

## Prerequisites

1. A Kaleido.io account and network
2. Kaleido API credentials and endpoints
3. DPIP token contract address
4. (Optional) NFT contract address if you want to generate NFTs

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
KALEIDO_ACCOUNTS_API=https://console-eu1.kaleido.io/api/v1/consortia/.../eth/accounts  # Accounts API endpoint
KALEIDO_GATEWAY_BASE=https://...-connect.eu1-azure.kaleido.io/gateways/kaleidoerc20mb  # Gateway base URL
SYMBOL_DPIP_ADDRESS=0xd440ab5ab62c03c38ed35056d0090a0a20115dba  # DPIP token contract address

# Optional: NFT Configuration
KALEIDO_NFT_CONTRACT_ADDRESS=0x...  # Your NFT contract address (if using NFTs)
KALEIDO_MINT_PRIVATE_KEY=0x...      # Private key for minting NFTs (if using NFTs)
```

### Getting Your Kaleido Endpoints

1. **KALEIDO_ACCOUNTS_API**: Found in your Kaleido console under your node's Ethereum accounts endpoint
   - Format: `https://console-eu1.kaleido.io/api/v1/consortia/{consortium}/environments/{environment}/nodes/{node}/eth/accounts`

2. **KALEIDO_GATEWAY_BASE**: Found in your Kaleido gateway connection details
   - Format: `https://{environment}-{node}-connect.{region}.kaleido.io/gateways/{gateway-name}`

3. **SYMBOL_DPIP_ADDRESS**: Your deployed DPIP ERC-20 token contract address

4. **KALEIDO_ROOT_API_KEY**: Your Kaleido root API key (found in Kaleido console settings) - used for account creation

5. **KALEIDO_API_KEY** and **KALEIDO_API_SECRET**: Your Kaleido gateway API credentials (found in gateway settings) - used for balance checks and token transfers. These are Base64 encoded as `KALEIDO_API_KEY:KALEIDO_API_SECRET` for Basic Auth.

## Database Migration

After updating the Wallet model in `prisma/schema.prisma`, run:

```bash
npx prisma generate
npx prisma db push
```

Or if using migrations:

```bash
npx prisma migrate dev --name add_wallet_private_key
```

## Security Considerations

### ⚠️ IMPORTANT: Private Key Storage

**The current implementation stores private keys in plain text in the database. This is NOT secure for production.**

Before deploying to production, you MUST:

1. **Encrypt private keys** before storing them in the database
2. **Decrypt private keys** only when needed (in memory, never log them)
3. Consider using:
   - A Key Management Service (KMS) like AWS KMS, Azure Key Vault, or HashiCorp Vault
   - Encryption libraries like `crypto` (Node.js built-in) or `@noble/ciphers`
   - Environment-based encryption keys

### Example Encryption (Not Implemented - Add This)

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY!; // 32 bytes key
const IV_LENGTH = 16; // For AES, this is always 16

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
```

Then update:
- `src/app/api/v1/wallet/route.ts` - Encrypt before storing
- `src/app/api/v1/wallet/transfer/route.ts` - Decrypt when retrieving

## Features

### 1. Automatic Wallet Creation

When a user logs in for the first time, a default wallet is automatically created.

**Location:** `src/app/api/v1/user/login/route.ts`

### 2. Wallet Management

Users can create and delete wallets through the Wallet Manager component.

**Component:** `src/components/walletManager.tsx`
**API Routes:**
- `GET /api/v1/wallet` - List all wallets
- `POST /api/v1/wallet` - Create a new wallet
- `DELETE /api/v1/wallet/[walletId]` - Delete a wallet

### 3. Wallet Selector in Balance Component

The balance component now includes a wallet selector showing blockchain balances.

**Component:** `src/components/balanceSection.tsx`

### 4. Token Transfers

Users can transfer tokens between wallets.

**Component:** `src/components/tokenTransfer.tsx`
**API Route:** `POST /api/v1/wallet/transfer`

### 5. NFT Generation

Users can generate NFTs (requires NFT contract deployment).

**Component:** `src/components/nftGenerator.tsx`
**API Route:** `POST /api/v1/wallet/nft`

**Note:** NFT generation requires:
- An ERC-721 compatible NFT contract deployed on your Kaleido network
- The contract address set in `KALEIDO_NFT_CONTRACT_ADDRESS`
- Implementation of the mint function call in `src/lib/kaleido.ts`

## Implementation Details

### Wallet Service

The core wallet service is located in `src/lib/kaleido.ts` and uses Viem for blockchain interactions.

**Key Functions:**
- `generateWallet()` - Creates a new wallet with private key and address
- `getBalance()` - Gets the balance for an address
- `sendTokens()` - Sends tokens from one address to another
- `generateNFT()` - Mints an NFT (requires contract implementation)

### Using Viem

The integration uses [Viem](https://viem.sh/) as the SDK for blockchain operations. Viem provides:
- Type-safe blockchain interactions
- Support for custom chains (like Kaleido)
- Wallet client for signing transactions
- Public client for reading blockchain data

## Testing

1. Set up your environment variables
2. Run the database migration
3. Start the development server: `npm run dev`
4. Log in to create your first wallet
5. Navigate to the Invest view to see wallet management

## Troubleshooting

### "KALEIDO_RPC_URL environment variable is required"

Make sure you've set `KALEIDO_RPC_URL` in your `.env.local` file.

### "Failed to fetch balance"

- Check that your RPC URL is correct and accessible
- Verify the chain ID matches your Kaleido network
- Ensure the wallet address is valid

### "Transaction failed"

- Verify the sender wallet has sufficient balance
- Check that the recipient address is valid
- Ensure network connectivity to Kaleido

## Next Steps

1. **Implement encryption** for private keys (see Security Considerations above)
2. **Deploy an NFT contract** if you want NFT generation functionality
3. **Add transaction history** viewing
4. **Implement gas estimation** for better UX
5. **Add error handling** for network issues
6. **Add transaction status polling** to show pending/completed states

## Support

For Kaleido.io specific questions, refer to:
- [Kaleido Documentation](https://docs.kaleido.io/)
- [Viem Documentation](https://viem.sh/docs)

