# Budgets API

## Routes
- `GET /api/v1/budgets`
- `POST /api/v1/budgets`

## Auth
Clerk auth; derives internal `User`.

## GET `/budgets`
Lists the authenticated user's budgets (ordered newest first).

## POST `/budgets`
Creates a simple budget. Body: `{ name, totalAmount, description? }`.
- `name` required (sanitized); `totalAmount` must be a positive number.
- `remainingAmount` starts equal to `totalAmount`.

## Notes
Budgets are the user-level funding sources that lists draw from via
`List.budgetSourceIds` (list budgetType = PERCENT).

## Dependencies
- Prisma model: `Budget`, `User`
