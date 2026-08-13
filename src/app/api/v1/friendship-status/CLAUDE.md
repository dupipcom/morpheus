# Friendship Status API

## Route
`GET /api/v1/friendship-status?targetUserName=`

## Auth
Requires Clerk auth.

## Behavior
Given a `targetUserName`, looks up the target by root-level `Profile.username` and returns the relationship between the current user and target.

## Response
```json
{
  "isFriend": false,
  "isCloseFriend": false,
  "hasPendingRequest": false,
  "friendshipStatus": "close_friend" | "friend" | "pending" | "none"
}
```

## Dependencies
- Prisma models: `User`, `Profile`
