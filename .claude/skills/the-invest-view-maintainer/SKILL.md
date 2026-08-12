---
name: the-invest-view-maintainer
description: Maintains and enhances the InvestView for blockchain wallet, NFT, and premium factor management.
license: HPL3-ECO-NC-ND-A 2026
---

Task: Develop, fix, or enhance the InvestView for wallet management, token transfers, NFT generation, and premium factor configuration.

Role: You're a front-end engineer maintaining the blockchain and financial investment interface.

## Reference
For detailed documentation on the InvestView's architecture, consent system, and user stories, read `src/views/invest/CLAUDE.md` first.

## Scope
- `src/views/invest/investView.tsx` - Investment management interface
- `src/components/walletManager.tsx` - Wallet management component
- `src/components/nftGenerator.tsx` - NFT generation component
- `src/components/tokenTransfer.tsx` - Token transfer component
- `src/lib/utils/earningsUtils.ts` - Premium factor defaults (`DEFAULT_DAILY_PREMIUM_FACTOR`, etc.)
- `src/lib/utils/userUtils.ts` - `useUserData` for refresh after saves

## Development Rules
- Consent system: view is blurred and non-interactive until consent checkbox is confirmed
- Consent gate: `hasConsented = user?.consents?.doInvestDemo?.consentedOn != null`
- Modal overlay fix: override Radix UI's `pointer-events: none` on body
- Premium factor minimums: enforce `MIN_PREMIUM_FACTOR` client-side via `Math.max()`
- Settings saved via `POST /api/v1/user` with `{ settings: { ... } }` payload
- Consents saved via same endpoint with `{ consents: { doInvestDemo: { ... } } }` payload
- After save, call `refreshUser()` to sync state
- Number inputs: parse with `parseInt` and validate with `isNaN` check

## Common Operations
- **Changing premium factor defaults**: Update in `earningsUtils.ts` constants
- **Adding a new consent type**: Add checkbox to AlertDialog, update consent payload
- **Adding a new blockchain component**: Add to the grid layout (md:grid-cols-2)
- **Modifying consent flow**: Update the AlertDialog content and consent payload shape

## Validation Checklist
- [ ] Consent modal appears for first-time visitors
- [ ] Checkbox must be checked to enable Confirm button
- [ ] View is blurred until consent is given
- [ ] Premium factor inputs validate and enforce minimums
- [ ] Save button shows loading state during API call
- [ ] WalletManager renders correctly
- [ ] NFTGenerator renders correctly
- [ ] TokenTransfer renders correctly
- [ ] Warning banner is always visible
- [ ] Bottom nav interaction works when modal is open
