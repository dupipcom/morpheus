# Virtual Number — Available Numbers API

Lists Telnyx numbers available for assignment to the current user.

## Route

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/virtual-number/numbers` | `{ numbers: [{ id, phoneNumber, friendlyName }] }` — purchased, messaging-capable Telnyx numbers not claimed by any Dupip user |

## Auth & Entitlement

Same as `../CLAUDE.md`: Clerk auth via `getAuthenticatedUser()` plus the `hasVirtualNumberEntitlement()` server gate.

## Errors

| Status | Meaning |
|---|---|
| 401 | Unauthenticated |
| 403 | Not entitled (premium feature) |
| 500 | Internal error / Telnyx unavailable |
