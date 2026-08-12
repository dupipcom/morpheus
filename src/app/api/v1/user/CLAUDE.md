# User API

## Routes
- `GET /api/v1/user`
- `POST /api/v1/user`
- `POST /api/v1/user/login`

## Auth
Clerk auth.

## GET `/user`
Gets (or creates) the current user and syncs Clerk data:
- Ensures a `Profile` exists.
- Syncs username and profile picture from Clerk (with `P2034` conflict tolerance).
- Initializes budget fields (`recalculateUserBudget`) if `usedBudget` is null.
- Revalidates the public profile path when username changes.

Returns the internal `User` document.

## POST `/user`
Updates the current user. Handles these body fields:
- `availableBalance`: recalculates `equity` and updates today's `Day` balance snapshot.
- `withdrawStash`: moves stash to available/withdrawn and updates `Day`.
- `settings`: merges into `User.settings`.
- `consents`: merges into `User.consents`.

Returns the updated user.

## POST `/user/login`
Handles `session.created` webhook events OR direct authenticated requests.
- Updates `lastLogin`.
- Upserts the user if missing.
- Creates a default wallet (via `generateWallet`) if the user has none.

## Dependencies
- `src/lib/utils/budgetUtils`
- `src/lib/services/day`
- `src/lib/utils/kaleido`
- Prisma models: `User`, `Profile`, `Day`, `Wallet`
