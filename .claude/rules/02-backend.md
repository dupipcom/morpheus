# Backend & API Rules

## Next.js 15 App Router

### API Routes (`src/app/api/`)
```typescript
// Standard structure for API routes
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // ... handler logic
  } catch (error) {
    console.error('Error description:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Route Handler Patterns
- Always authenticate with `await auth()` from `@clerk/nextjs/server`
- Validate required parameters early and return 400 for missing params
- Use service layer for business logic; keep routes thin
- Return consistent response shapes: `{ data }` or `{ error, status }`
- Parse numbers explicitly: `parseFloat()`, `parseInt()`

### Server Components
- Default to server components; use `'use client'` only when needed
- Fetch data directly in server components using Prisma
- Pass serializable props to client components
- Use `cookies()` and `headers()` from `next/headers` for request context

### Server Actions
- Place in `actions.ts` files within feature directories
- Use `'use server'` directive at top of file
- Validate all inputs; never trust client data
- Revalidate cache with `revalidatePath()` or `revalidateTag()`

## Service Layer Architecture

### Service Structure
```
src/lib/services/{feature}/
├── index.ts           # Public exports
├── types.ts           # TypeScript interfaces
├── helpers.ts         # Pure utility functions
├── {feature}Service.ts # Main business logic
└── {sub}Service.ts    # Sub-domain logic
```

### Service Patterns
- Services are stateless; pass dependencies as parameters
- Return typed results, not Prisma models directly
- Handle errors gracefully; throw only for truly exceptional cases
- Use transactions for multi-step operations

## Database Operations

### Prisma Best Practices
- Import from `@/lib/prisma` (singleton pattern)
- Use `select` to limit fields returned
- Use `include` sparingly; prefer separate queries for complex relations
- Always handle potential null returns
- Use transactions for related writes: `prisma.$transaction()`

### Query Optimization
- Add indexes for frequently queried fields
- Use pagination (`take`, `skip`) for large result sets
- Avoid N+1 queries; use `include` or batch queries
- Use `findFirst` + `@@unique` instead of `findUnique` where applicable

## Authentication & Authorization

### Clerk Integration
```typescript
import { auth } from '@clerk/nextjs/server'

// In API routes
const { userId } = await auth()
if (!userId) return unauthorized()

// Get internal user
const user = await prisma.user.findUnique({
  where: { userId: userId } // userId is Clerk's user ID
})
```

### Authorization Patterns
- Check ownership: `resource.userId === user.id`
- Check membership: `resource.users.some(u => u.userId === user.id)`
- Check visibility: PUBLIC, FRIENDS, CLOSE_FRIENDS, PRIVATE
- Never expose other users' PRIVATE data

## Input Validation

### Required Validations
- Validate presence of required fields
- Validate data types (string, number, boolean)
- Validate enum values against allowed list
- Sanitize strings to prevent injection
- Validate IDs are valid ObjectId format

### Sensitive Field Handling
- Never log passwords, tokens, or API keys
- Never return sensitive fields in responses
- Mask or truncate PII in logs
- Use `select` to explicitly choose returned fields
