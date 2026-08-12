# Delegated Users API

## Routes
- `GET /api/v1/delegated-users`
- `POST /api/v1/delegated-users`
- `DELETE /api/v1/delegated-users`

## Auth
Uses `getAuthenticatedUser()`.

## Purpose
Manages third-party analyst delegations (data-sharing grants) and returns friend suggestions.

## GET
Returns `{ outgoingDelegations, incomingDelegations, friendSuggestions }`. Each delegation includes resolved `scopes` and a user summary.

## POST
Creates or updates a delegation. Body: `{ identifier, scopes? }` (or `scope`).
- `identifier`: internal userId, Clerk userId, email, or username.
- If the identifier is an unknown email, returns `202` with an invitation draft instead of creating a delegation.
- Rejects delegating to self.
- Upserts `Delegation` keyed on `delegatorId`+`delegatedId`.

## DELETE
Removes an outgoing delegation. Body: `{ delegationId }`.

## Dependencies
- `src/lib/constants/visibility` (`DELEGATION_SCOPES`)
- `src/lib/utils/delegation`
- `src/lib/utils/invitations`
- Prisma models: `Delegation`, `User`, `Profile`

## Scopes
`PRIVATE`, `AI_ENABLED`, `PUBLIC`, `FRIENDS`, `CLOSE_FRIENDS`. Defaults to `AI_ENABLED`.
