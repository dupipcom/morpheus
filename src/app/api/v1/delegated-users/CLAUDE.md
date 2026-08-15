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
Returns `{ outgoingDelegations, incomingDelegations, friendSuggestions }`. Each delegation includes resolved `scopes`, resolved `roles` (role keys) and a user summary.

## POST
Creates or updates a delegation. Body: `{ identifier, scopes?, roleKeys? }` (or `scope`).
- `identifier`: internal userId, Clerk userId, email, or username.
- `roleKeys`: optional relationship labels (`DOCTOR`, `TUTOR`, `MENTOR`, `TEACHER`, `GUIDE`, `ASSISTANT`, `FRIEND`, `CLOSE_FRIEND`, `LAWYER`, `SOLICITOR`, `FAMILY`, `HOUSEHOLD`, `THERAPIST`) resolved against the seeded `Role` collection.
- If the identifier is an unknown email, returns `202` with an invitation draft instead of creating a delegation.
- Rejects delegating to self.
- Upserts `Delegation` keyed on `delegatorId`+`delegatedId`.

## DELETE
Removes an outgoing delegation. Body: `{ delegationId }`.

## Dependencies
- `src/lib/constants/visibility` (`DELEGATION_SCOPES`)
- `src/lib/constants/roles` (`isRoleKey`)
- `src/lib/utils/delegation`
- `src/lib/utils/invitations`
- Prisma models: `Delegation`, `User`, `Profile`, `Role`

## Scopes
`PRIVATE`, `AI_ENABLED`, `PUBLIC`, `FRIENDS`, `CLOSE_FRIENDS`. Defaults to `AI_ENABLED`. `DOC_ENABLED` is a note visibility, not a grantable scope — any delegation unlocks `DOC_ENABLED` notes.
