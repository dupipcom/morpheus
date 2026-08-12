# Debug API

## Route
`GET /api/v1/debug/task-state?taskId=&date=`

## Auth
Requires Clerk auth. This is a debugging helper, not a user-facing feature.

## Behavior
Loads a `Task` by `taskId`, includes its `Job`s (optionally filtered by `date`), and returns accepted-job aggregation:
- `task` summary
- `jobs` total/accepted/byDate/details
- `calculated.globalCount`, `dateCount`, `shouldBeCompleted`

## Errors
- `400`: missing `taskId`
- `401`: unauthorized
- `404`: task not found

## Dependencies
- Prisma models: `Task`, `Job`
