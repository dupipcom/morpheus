# Common Patterns & Anti-Patterns

## Recommended Patterns

### API Route Pattern
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // 1. Authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Get internal user
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 3. Parse parameters
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    // 4. Call service layer
    const result = await myService.getData(user.id, { page, limit })

    // 5. Return response
    return NextResponse.json(result)

  } catch (error) {
    console.error('Error in GET /api/v1/resource:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Service Layer Pattern
```typescript
// src/lib/services/feature/featureService.ts
import prisma from '@/lib/prisma'
import type { Feature, CreateFeatureInput } from './types'

export async function getFeatures(
  userId: string,
  options: { page: number; limit: number }
): Promise<{ features: Feature[]; total: number }> {
  const [features, total] = await Promise.all([
    prisma.feature.findMany({
      where: { userId },
      take: options.limit,
      skip: (options.page - 1) * options.limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.feature.count({ where: { userId } })
  ])

  return { features, total }
}

export async function createFeature(
  userId: string,
  input: CreateFeatureInput
): Promise<Feature> {
  // Validate input
  if (!input.name?.trim()) {
    throw new Error('Name is required')
  }

  return prisma.feature.create({
    data: {
      ...input,
      userId
    }
  })
}
```

### Visibility-Aware Query Pattern
```typescript
function buildVisibilityWhereClause(currentUser: { id: string; friends: string[]; closeFriends: string[] }) {
  return {
    OR: [
      { visibility: 'PUBLIC' },
      { userId: currentUser.id },
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
}
```

### Optimistic Update Pattern (Frontend)
```typescript
import useSWR from 'swr'

function useFeature(id: string) {
  const { data, mutate } = useSWR(`/api/v1/features/${id}`)

  const updateFeature = async (updates: Partial<Feature>) => {
    // Optimistic update
    mutate(
      { ...data, ...updates },
      false // Don't revalidate yet
    )

    try {
      await fetch(`/api/v1/features/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      })
      mutate() // Revalidate after success
    } catch (error) {
      mutate() // Rollback on error
      throw error
    }
  }

  return { feature: data, updateFeature }
}
```

## Anti-Patterns to Avoid

### Never Trust Client Data
```typescript
// BAD - trusting client-provided userId
const { userId, amount } = await request.json()
await prisma.transaction.create({
  data: { userId, amount }
})

// GOOD - derive userId from auth
const { userId: clerkUserId } = await auth()
const user = await prisma.user.findUnique({ where: { userId: clerkUserId } })
const { amount } = await request.json()
await prisma.transaction.create({
  data: { userId: user.id, amount }
})
```

### Avoid N+1 Queries
```typescript
// BAD - N+1 queries
const notes = await prisma.note.findMany()
for (const note of notes) {
  note.author = await prisma.user.findUnique({ where: { id: note.userId } })
}

// GOOD - single query with include
const notes = await prisma.note.findMany({
  include: { user: { select: { id: true, profiles: true } } }
})
```

### Don't Expose Internal Errors
```typescript
// BAD - exposes internal details
catch (error) {
  return NextResponse.json({ error: error.message }, { status: 500 })
}

// GOOD - generic message
catch (error) {
  console.error('Internal error:', error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```

### Avoid Over-Fetching
```typescript
// BAD - fetches entire user with all relations
const user = await prisma.user.findUnique({
  where: { id },
  include: { profiles: true, notes: true, tasks: true, friends: true }
})

// GOOD - only what's needed
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, profiles: { select: { data: true } } }
})
```

### Don't Hardcode Strings
```typescript
// BAD - hardcoded visibility
if (note.visibility === 'PUBLIC') { ... }

// GOOD - use enum or constant
import { Visibility } from '@/lib/types'
if (note.visibility === Visibility.PUBLIC) { ... }
```

### Avoid Massive Files
```typescript
// BAD - 2000+ line file with everything
// src/app/api/v1/tasks/route.ts (2000 lines)

// GOOD - split into service layer
// src/app/api/v1/tasks/route.ts (< 200 lines)
// src/lib/services/tasks/taskService.ts
// src/lib/services/tasks/completionService.ts
// src/lib/services/tasks/types.ts
```
