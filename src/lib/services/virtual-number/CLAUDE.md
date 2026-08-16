# Virtual-Number Service

## Purpose

Premium Telnyx virtual phone numbers gated by the Clerk `virtual_number` plan feature. Users may hold several numbers bounded by plan quota (dupip_pro/ultra/max → 1/3/5); `VirtualNumber.phoneNumber` is unique so inbound SMS routes to the right account. The server entitlement gate is best-effort parity with the client `useFeatureFlag` gate and fails closed (deny on any error).

## Files

- `index.ts` — barrel re-exporting types, helpers, telnyxClient, service, entitlement
- `helpers.ts` — pure helpers: E.164 validation, Telnyx DTO mapping, claims parsing, quota tables (unit-tested)
- `telnyxClient.ts` — server-only Telnyx v2 HTTP client (list numbers, send message)
- `virtualNumberService.ts` — assignment business logic (get/list/assign/disable)
- `entitlement.ts` — server-side entitlement check (claims → internal org → fail closed)
- `types.ts` — DTOs, `VirtualNumberErrorCode`, `VirtualNumberError` class
- `__tests__/entitlement.test.ts`, `__tests__/telnyxClient.test.ts`, `__tests__/virtualNumberService.test.ts`

## Key Exports

| Export | Purpose |
|---|---|
| `getVirtualNumbers` | User's assignments (oldest first); enabled = has messaging profile |
| `getAvailableNumbers` | Telnyx numbers messaging-capable and unclaimed by any user |
| `assignNumber` | Assign / disable-all; enforces quota, E.164, ownership; P2002 race → NUMBER_TAKEN |
| `disableNumber` | Disable one assignment (keeps the Telnyx number held) |
| `listPhoneNumbers` / `sendTelnyxMessage` | Telnyx v2 client (JSON:API pagination, 5-page cap with truncation warning) |
| `getVirtualNumberEntitlement` / `hasVirtualNumberEntitlement` | Claims gate → `dupip` org membership → max quota; denies on error |
| `claimsAllowVirtualNumber` / `getPlanSlugFromClaims` / `getVirtualNumberQuota` | Defensive sessionClaims parsing across Clerk claim shapes; quota `dupip_pro/ultra/max → 1/3/5`, unknown slug → 0 |
| `isWithinQuota` / `isValidE164` / `isMessagingCapable` / `filterAvailableNumbers` | Pure predicates used by the service |
| `VirtualNumberError` | Typed error mapped to HTTP status by the routes |

## Consumers

- API: `src/app/api/v1/virtual-number/route.ts` (assign/disable/get), `src/app/api/v1/virtual-number/numbers/route.ts` (available numbers + entitlement)
- Sibling: `src/lib/services/sms/smsService.ts` uses `sendTelnyxMessage`

## Cross-References

- `src/app/api/v1/virtual-number/CLAUDE.md`, `src/app/api/v1/virtual-number/numbers/CLAUDE.md`, `src/app/api/v1/telnyx/CLAUDE.md`
- `src/lib/services/sms` (webhook ingress + conversations)
- `src/lib/services/CLAUDE.md`
