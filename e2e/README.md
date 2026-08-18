# E2E Tests (Playwright)

Two specs, run serially against one app server + one database:

| Spec | Scope |
|---|---|
| `user-journey.spec.ts` | Browser journey: sign-up → log mood → write note → default daily/weekly lists in locale → complete a list item → public note in the be feed → view + edit profile → invest consent gate → ledger balance → transfer updates it |
| `stack-smoke.spec.ts` | API-level whole-stack smoke (plan step 3): signup default wallet → treasury credit → transfer + idempotent replay → org create (org wallet) → org list publish → job apply/accept (409 on double apply) → event create/publish/RSVP/list-link → life-events vs events split → ledger invariants |

## Requirements

- **Clerk development instance** with `CLERK_SECRET_KEY` (used to create test
  users + sessions; the tests place a Backend-API session token in the
  `__session` cookie). Production instances reject sessions for unverified
  test users.
- **A MongoDB replica set.** Prisma opens a transaction for any nested write,
  so a standalone `mongod` fails with `P2031` and no `User` row is ever
  created — every request then 404s with `User not found`. A single node is
  enough. If your local Docker Mongo is standalone, restart it as a one-node
  replica set:

  ```bash
  docker run -d --name mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
  docker exec mongo mongosh --quiet --eval \
    'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })'
  ```

  and point `DATABASE_URL` at it **with the `replicaSet` parameter** — without
  it the driver still sees a standalone topology:

  ```
  DATABASE_URL=mongodb://localhost:27017/dpip?replicaSet=rs0
  ```

  This is also what CI does, so the ledger takes the same single interactive
  `prisma.$transaction` path as production rather than the standalone
  sequential fallback.
- A database with the Phase 5–8 schema pushed. CI starts from a fresh Mongo
  container, so `npx prisma db push` alone is enough there — the 0021–0028
  data migrations are no-ops on an empty DB. Local runs reuse your dev DB;
  apply the data migrations to it once, in order:

  ```bash
  node src/migrations/0021-create-default-wallets.js   # + 0022 → 0028, in order
  # 0022 backfills Transaction.reference BEFORE the unique index is pushed
  npx prisma db push
  ```

  The harness self-seeds the treasury wallet and cleans up its test users, so
  it tolerates an already-migrated dev DB.

## Running

```bash
npx prisma generate
npm run test:e2e            # starts the dev server automatically
npx playwright test --project=chromium --grep "stack smoke"
```

Local runs use `npm run dev` (reuses an already-running server); CI builds
first and serves `npm run start`.

## Known UI timing

- Mood saves are **5s debounced** (`POST /api/v1/days`) — the test waits on
  the response, not on a toast.
- Profile edits are **1s debounced** (`POST /api/v1/profile`).
- Task completion by the OWNER is a single tap (`POST /api/v1/jobs` ACCEPTED)
  with no dialog.
- The invest view is blurred behind a consent dialog on first visit.
- The be feed only shows PUBLIC notes.
