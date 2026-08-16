# Virtual Number API

Premium Telnyx virtual phone numbers (Clerk feature `virtual_number`). Users can hold several numbers, bounded by their plan quota; a Telnyx number can be claimed by at most one Dupip user (`VirtualNumber.phoneNumber` unique) so inbound SMS can be routed later.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/virtual-number` | Current assignments + quota (`{ assignments: [...], quota: number }`) |
| POST | `/api/v1/virtual-number` | Assign one number (`{ phoneNumber: string }`; `null` clears all) |
| DELETE | `/api/v1/virtual-number?phoneNumber=...` | Unassign one number |
| GET | `/api/v1/virtual-number/numbers` | Available numbers (Telnyx list minus all assigned) |

## Auth & Entitlement

- Clerk auth via `getAuthenticatedUser()`.
- Best-effort server entitlement check `getVirtualNumberEntitlement()` returns `{ entitled, quota }`: sessionClaims plan feature `virtual_number` + plan slug quota, or internal org slug `dupip` (quota 5); client gating via `useFeatureFlag` is the primary mechanism.

## Quota

Quota comes from the Clerk plan slug read from session claims (`getPlanSlugFromClaims` in `src/lib/services/virtual-number/helpers.ts`):

| Plan slug (Clerk) | Virtual numbers |
|---|---|
| `dupip_pro` | 1 |
| `dupip_ultra` | 3 |
| `dupip_max` | 5 |

Entitled users with an unknown plan slug get quota 0 (fail closed); internal `dupip` org members get the max quota (5). Exceeding the quota returns 409 `LIMIT_REACHED`.

## Clerk Dashboard Requirements

The plans must exist in the Clerk dashboard with exactly these slugs and the `virtual_number` feature attached. Plan names, prices, and marketing copy live in Clerk only — the app mirrors just slugs and quotas (`VIRTUAL_NUMBER_QUOTA_BY_PLAN`). If a plan is renamed, update the helper.

## Errors

| Status | Meaning |
|---|---|
| 400 | Invalid body / phoneNumber not a string or null / invalid E.164 / missing query param |
| 401 | Unauthenticated |
| 403 | Not entitled (premium feature) |
| 404 | Number not found in the Telnyx account / not assigned to the user |
| 409 | Number already assigned to another user, or plan quota reached |
| 500 | Internal error / Telnyx unavailable |

## Dependencies

- `src/lib/services/virtual-number` (telnyxClient, virtualNumberService, entitlement)
- Prisma model: `VirtualNumber`
- Env: `TELNYX_API_KEY`
