# Task Collection Refactor

## Overview
Convert Task from an embedded type to a Prisma model collection, create a Jobs collection to replace task.completers, and refactor List to use task references with new wallet and history fields.

## Changes to Prisma Schema

### 1. Create Task Model (convert from type)
**File**: `prisma/schema.prisma`

- Convert `type Task` to `model Task`
- Add fields:
  - `candidates User[]` - Many-to-many relation with Users
  - `raised Transaction[]` - Many-to-many relation with Transactions
  - `status TaskStatus @default(OPEN)` - Enum with values: OPEN, IN_PROGRESS, STEADY, READY, DONE, IGNORED, SKIPPED
- Remove `completers Completer[]` field (replaced by Jobs collection)
- Keep all existing Task fields (name, categories, area, recurrence, etc.)
- Add relations:
  - `list List? @relation(fields: [listId], references: [id])`
  - `listId String? @db.ObjectId`
  - `jobs Job[]` - One-to-many relation with Jobs

### 2. Create TaskStatus Enum
**File**: `prisma/schema.prisma`

```prisma
enum TaskStatus {
  OPEN
  IN_PROGRESS
  STEADY
  READY
  DONE
  IGNORED
  SKIPPED
}
```

### 3. Create Job Model
**File**: `prisma/schema.prisma`

- Fields:
  - `selfReview Float?` - Range 0-5
  - `peerReview Float?` - Range 0-5
  - `managerReview Float?` - Range 0-5
  - `status JobStatus @default(REQUESTED)` - Enum
  - `reviewers User[]` - Many-to-many relation
  - `worker User @relation(fields: [workerId], references: [id])`
  - `workerId String @db.ObjectId`
  - `task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)`
  - `taskId String @db.ObjectId`
  - `list List @relation(fields: [listId], references: [id], onDelete: Cascade)`
  - `listId String @db.ObjectId`
- Standard fields: `id`, `createdAt`, `updatedAt`

### 4. Create JobStatus Enum
**File**: `prisma/schema.prisma`

```prisma
enum JobStatus {
  REQUESTED
  IN_PROGRESS
  VALIDATING
  ACCEPTED
  REJECTED
}
```

### 5. Update List Model
**File**: `prisma/schema.prisma`

- Change `tasks Task[]` to `taskIds String[] @default([]) @db.ObjectId` - Array of Task references
- Add `wallet Wallet? @relation(fields: [walletId], references: [id])`
- Add `walletId String? @db.ObjectId`
- Add `raised Transaction[]` - Many-to-many relation with Transactions
- Add `history ListHistoryEntry[]` - Array type for structured activity log
- Remove `ephemeralTasks Json?`
- Remove `completedTasks Json?`
- Add relation: `tasks Task[]` - One-to-many with Task collection
- Add relation: `jobs Job[]` - One-to-many with Job collection

### 6. Create ListHistoryEntry Type
**File**: `prisma/schema.prisma`

```prisma
type ListHistoryEntry {
  year Int
  date String  // YYYY-MM-DD format
  operation String  // e.g., 'completed', 'requested-validation'
  username String?
  userId String @db.ObjectId
}
```

### 7. Update Transaction Model
**File**: `prisma/schema.prisma`

- Add relation: `raisedByTasks Task[]` - Many-to-many relation (reverse of Task.raised)
- Add relation: `raisedByLists List[]` - Many-to-many relation (reverse of List.raised)

### 8. Update User Model
**File**: `prisma/schema.prisma`

- Add relation: `reviewerJobs Job[]` - Many-to-many relation for Jobs where user is a reviewer
- Add relation: `workerJobs Job[]` - One-to-many relation for Jobs where user is worker
- Add relation: `candidateTasks Task[]` - Many-to-many relation for Tasks where user is a candidate

### 9. Update Wallet Model
**File**: `prisma/schema.prisma`

- Add relation: `lists List[]` - One-to-many relation (wallets can be shared)

### 10. Keep Template.tasks as Embedded
**File**: `prisma/schema.prisma`

- Keep `templateTasks Task[]` as embedded type (templates are blueprints, not instances)
- This maintains backward compatibility for template cloning

## Migration Considerations

- Existing embedded tasks in `List.tasks` will need to be migrated to Task collection
- `List.completedTasks` and `List.ephemeralTasks` data will need to be migrated to new structure
- `task.completers` data will need to be migrated to Job collection
- Update all API routes and components that reference `List.tasks`, `List.completedTasks`, `List.ephemeralTasks`, and `task.completers`