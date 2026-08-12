# User Dashboard Data API

## Route
`GET /api/v1/user-dashboard-data?userId=&year=&startDate=&endDate=`

## Auth
Uses `getAuthenticatedUser()`.

## Purpose
Provides analytics day data for the dashboard charts, including delegated-user access.

## Behavior
- `userId` defaults to the current user's internal id.
- If a different `userId` is requested, validates a `Delegation` from the target to the current user and resolves its effective scope.
- `year` filters by year; `startDate`+`endDate` filter by range.
- Applies a visibility allow-list for restricted delegation scopes.
- Transforms each day via `transformDayForAnalytics`.

## Response
`{ userId, delegationScope, delegationScopes, days: [...] }`.

## Dependencies
- `src/lib/services/day`
- `src/lib/utils/delegation`
- Prisma models: `Day`, `Delegation`, `User`
