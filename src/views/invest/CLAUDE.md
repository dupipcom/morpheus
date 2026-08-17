# InvestView - Blockchain & Financial View

## Purpose

The InvestView provides the blockchain and financial investment interface. It manages wallet operations, NFT generation, token transfers, and premium factor configuration for earnings calculations. Access requires explicit user consent via a checkbox confirmation modal.

## File: `investView.tsx`

## Component Architecture

```
InvestView
├── Warning Banner (Always visible)
├── Premium Factors Card
│   ├── Daily Premium Factor input
│   ├── Weekly Premium Factor input
│   ├── Global Premium Factor input
│   └── Save button
├── Wallet Manager (WalletManager component)
├── Token Transfer (TokenTransfer component)
└── NFT Generator (NFTGenerator component)
```

## State Management

### GlobalContext Integration
- Reads `session` from `GlobalContext` to check auth state and consents

### Consent System
- Checks `user.consents.doInvestDemo.consentedOn` for prior consent
- Presents `AlertDialog` with checkbox for first-time visitors
- Stores consent via `POST /api/v1/user` with `consents.doInvestDemo` field
- Content is blurred and interaction-blocked until consent is given

### User Data
- Uses `useUserData()` for `refreshUser()` and `isLoading` state
- Premium factors loaded from `user.settings` (dailyPremiumFactor, weeklyPremiumFactor, globalPremiumFactor)
- Falls back to defaults from `earningsUtils`
- Saves factors via `POST /api/v1/user` with `settings` field

## Correlations

| Related To | Relationship |
|---|---|
| **WalletManager** | Wallet creation and management component |
| **NFTGenerator** | NFT minting component |
| **TokenTransfer** | Token transfer component |
| **useUserData** | User data refresh after settings save |
| **earningsUtils** | Default premium factor values |
| **Kaleido** | Blockchain-as-a-service provider |

## User Stories

1. **As a user**, I must acknowledge the investment disclaimer before accessing features
2. **As a user**, I can view and manage my blockchain wallet
3. **As a user**, I can adjust premium factors that control earnings calculations
4. **As a user**, I can generate NFTs from my wallet
5. **As a user**, I can transfer tokens from my wallet
6. **As a user**, I can see a warning about the demo/educational nature of the platform

## API Endpoints

| Endpoint | Method | Why / How |
|---|---|---|
| `/api/v1/user` | POST | InvestView directly posts premium factor settings and `consents.doInvestDemo` (see `savePremiumFactors` and consent flow). |
| `/api/v1/user` | GET | `useUserData()` reads the current user's settings/consents on mount. |
| `/api/v1/wallet` | GET/POST | `WalletManager` child component lists/creates wallets. |
| `/api/v1/wallet/{walletId}` | GET/DELETE | `WalletManager` reads/deletes a selected wallet. |
| `/api/v1/wallet/nft` | POST | `NFTGenerator` child component mints an NFT. |
| `/api/v1/wallet/nft/list?walletId=` | GET | `NFTGenerator` lists NFTs for a wallet. |
| `/api/v1/wallet/transfer` | POST | `TokenTransfer` child component sends tokens. |

Integration details:
- InvestView itself is consent-gated and only writes `/api/v1/user`; the wallet/NFT/transfer endpoints are consumed by the child components it renders (`WalletManager`, `NFTGenerator`, `TokenTransfer`).

## Loading States

- Components silently unavailable while `isLoading` is true
- Consent modal uses `isSubmitting` for button loading state
- Premium factors use `isSavingFactors` for save button loading

## Key Behaviors

- **Consent-gated**: Entire view is blurred and non-interactive until consent checkbox is confirmed
- **Consent check**: `hasConsented = user?.consents?.doInvestDemo?.consentedOn != null`
- **Modal overlay fix**: Bottom nav stays interactive while the consent AlertDialog is open via the `.bottom-nav-interactive` class (`pointer-events: auto !important`); `<body>` restoration is handled by `ModalSurfaceGuard` in the dialog wrapper (no body style overrides here)
- **Factor minimums**: Premium factors cannot go below `MIN_PREMIUM_FACTOR` (enforced client-side)
- **Save feedback**: Settings are saved to user profile via `POST /api/v1/user`
