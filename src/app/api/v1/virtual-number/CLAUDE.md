# Virtual Number API

Premium Telnyx virtual phone numbers (Clerk feature `virtual_number`). One number per user (`VirtualNumber.userId` unique); a Telnyx number can be claimed by at most one Dupip user (`VirtualNumber.phoneNumber` unique) so inbound SMS can be routed later.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/virtual-number` | Current assignment (`{ assignment: {...} \| null }`) |
| POST | `/api/v1/virtual-number` | Assign/unassign (`{ phoneNumber: string \| null }`; null clears) |
| GET | `/api/v1/virtual-number/numbers` | Available numbers (Telnyx list minus all assigned) |

## Auth & Entitlement

- Clerk auth via `getAuthenticatedUser()`.
- Best-effort server entitlement check `hasVirtualNumberEntitlement()` (sessionClaims plan feature `virtual_number` + internal org slug `dupip`); client gating via `useFeatureFlag` is the primary mechanism.

## Errors

| Status | Meaning |
|---|---|
| 400 | Invalid body / phoneNumber not a string or null / invalid E.164 |
| 401 | Unauthenticated |
| 403 | Not entitled (premium feature) |
| 404 | Number not found in the Telnyx account |
| 409 | Number already assigned to another user |
| 500 | Internal error / Telnyx unavailable |

## Dependencies

- `src/lib/services/virtual-number` (telnyxClient, virtualNumberService, entitlement)
- Prisma model: `VirtualNumber`
- Env: `TELNYX_API_KEY`
