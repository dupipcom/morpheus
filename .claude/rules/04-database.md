# Database & Schema Rules

## Prisma with MongoDB

### Schema Conventions
```prisma
model Entity {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Required fields first
  name          String

  // Optional fields
  description   String?

  // Numeric fields (always Float for MongoDB compatibility)
  amount        Float?

  // Relations
  userId        String    @db.ObjectId
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Array fields
  tagIds        String[]  @default([]) @db.ObjectId

  // JSON fields for flexible data
  metadata      Json?

  // Visibility control
  visibility    Visibility @default(PRIVATE)

  // Compound unique constraints
  @@unique([userId, name])
}
```

### Field Types
- IDs: `String @id @default(auto()) @map("_id") @db.ObjectId`
- Foreign keys: `String @db.ObjectId`
- Timestamps: `DateTime @default(now())` / `DateTime @updatedAt`
- Numbers: Use `Float` (MongoDB doesn't distinguish int/float well)
- Arrays: `String[] @default([])` or `Type[]` for embedded
- Flexible data: `Json?`

### Relations
- Always use `@relation` with explicit field references
- Use `onDelete: Cascade` for child records
- Prefer embedded documents for tightly coupled data
- Use references for loosely coupled or shared data

## Embedded Types

### When to Embed
- Data always accessed together
- Data belongs exclusively to parent
- Limited array size (<100 items typically)
- No need for independent queries

### Embedded Type Pattern
```prisma
type EmbeddedTask {
  id          String
  name        String
  status      String
  categories  String[]
  completers  Completer[]
}

model List {
  tasks       EmbeddedTask[]
}
```

## Visibility System

### Visibility Enum
```prisma
enum Visibility {
  PRIVATE       // Owner only
  FRIENDS       // Owner's friends
  CLOSE_FRIENDS // Owner's close friends
  PUBLIC        // Everyone
  HIDDEN        // Special hidden state
}

enum NoteVisibility {
  PRIVATE
  FRIENDS
  CLOSE_FRIENDS
  PUBLIC
  HIDDEN
  AI_ENABLED    // Available for AI processing
}
```

### Visibility Query Patterns
```typescript
// Build visibility-aware where clause
const whereClause = {
  OR: [
    { visibility: 'PUBLIC' },
    { userId: currentUser.id }, // Own content
    {
      visibility: 'FRIENDS',
      userId: { in: currentUser.friends }
    },
    {
      visibility: 'CLOSE_FRIENDS',
      userId: { in: currentUser.closeFriends }
    }
  ]
}
```

## Query Patterns

### Efficient Queries
```typescript
// Use select to limit fields
const user = await prisma.user.findUnique({
  where: { userId },
  select: { id: true, email: true, profiles: true }
})

// Use include for relations
const note = await prisma.note.findUnique({
  where: { id },
  include: {
    user: { select: { id: true, profiles: true } },
    _count: { select: { comments: true, likes: true } }
  }
})

// Pagination
const items = await prisma.item.findMany({
  where: { userId },
  take: limit,
  skip: (page - 1) * limit,
  orderBy: { createdAt: 'desc' }
})
```

### Transactions
```typescript
// Use transactions for related operations
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.update({ ... })
  const profile = await tx.profile.update({ ... })
  return { user, profile }
})
```

## Data Integrity

### Required Validations
- Validate ObjectId format before queries
- Check entity exists before updates
- Verify user ownership before modifications
- Validate enum values against schema

### Soft Deletes (when applicable)
```prisma
model Entity {
  deletedAt     DateTime?
  isDeleted     Boolean   @default(false)
}

// Query non-deleted
where: { isDeleted: false }
```

## Migration Practices

### Schema Changes
- Test migrations in development first
- Use `prisma db push` for development
- Document breaking changes
- Provide data migration scripts when needed

### Data Migrations
- Place in `src/migrations/`
- Make idempotent (safe to run multiple times)
- Log progress for large migrations
- Handle errors gracefully
