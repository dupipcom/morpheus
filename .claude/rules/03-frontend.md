# Frontend & React Rules

## React & Next.js Patterns

### Component Structure
```typescript
// Standard component structure
'use client' // Only if needed

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import type { ComponentProps } from './types'

export function MyComponent({ prop1, prop2 }: ComponentProps) {
  const { t } = useI18n()
  // hooks first
  // derived state
  // handlers
  // render
}
```

### Client vs Server Components
**Use Server Components (default) for:**
- Static content
- Data fetching
- SEO-critical content
- Components without interactivity

**Use Client Components (`'use client'`) for:**
- Event handlers (onClick, onChange)
- React hooks (useState, useEffect)
- Browser APIs
- Third-party client libraries

### Hooks Patterns
- Use custom hooks from `src/lib/hooks/`
- `useProfile()` for user profile data
- `useFriendProfiles()` for friend/collaborator profile suggestions (SWR-based)
- `useTaskHandlers()` for task CRUD
- `useOptimisticUpdates()` for optimistic UI
- `useTranslations()` for i18n
- `useDebounce()` for debounced values

## Shadcn/UI Components

### Usage Guidelines
- Import from `@/components/ui/`
- Use existing variants before creating custom styles
- Compose components rather than modifying base components
- Follow accessibility patterns built into shadcn

### Common Components
```typescript
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select'
```

### Form Patterns
- Use controlled components with useState
- Validate on blur and submit
- Show inline error messages
- Disable submit during loading
- Use aria-labels for accessibility

## Styling

### Tailwind CSS 4
- Use utility classes directly
- Use `cn()` utility for conditional classes
- Prefer semantic color classes (bg-primary, text-muted-foreground)
- Use responsive prefixes: `sm:`, `md:`, `lg:`, `xl:`

### Class Organization
```typescript
// Order: layout, spacing, sizing, colors, effects, states
className="flex items-center gap-2 p-4 w-full bg-card rounded-lg shadow-sm hover:shadow-md"
```

### Dark Mode
- Use `next-themes` for theme switching
- Use CSS variables for colors (defined in globals.css)
- Test both light and dark modes
- Use `dark:` prefix for dark-specific styles

## Internationalization (i18n)

### Translation Usage
```typescript
import { useI18n } from '@/lib/i18n'

function MyComponent() {
  const { t, formatDate } = useI18n()

  return (
    <div>
      <h1>{t('page.title')}</h1>
      <p>{formatDate(date)}</p>
    </div>
  )
}
```

### Translation Files
- Located in `src/locales/{locale}.json`
- Use dot notation for nested keys
- Provide fallbacks for missing translations
- Never hardcode user-facing text

## State Management

### Local State
- Use `useState` for component-local state
- Use `useReducer` for complex state logic
- Lift state only when necessary

### Server State (SWR)
**Always use SWR hooks for fetching server data.** This provides automatic caching, deduplication, and revalidation.

```typescript
import useSWR from 'swr'
import { jsonFetcher } from '@/lib/utils/utils'

const { data, error, isLoading, mutate } = useSWR('/api/v1/endpoint', jsonFetcher, {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
  dedupingInterval: 5000,
})
```

**SWR Best Practices:**
- Create custom hooks in `src/lib/hooks/` for reusable data fetching (e.g., `useFriendProfiles`, `useProfile`)
- Use `null` as the key to disable fetching conditionally
- Pass query parameters in the URL to leverage SWR's caching by key
- Use `useMemo` for computed keys to prevent unnecessary re-fetches

**Example: Conditional fetching with search query**
```typescript
// Memoize to prevent unnecessary re-fetches
const trimmedQuery = useMemo(() => query.trim(), [query])

// Pass null to disable fetching when query is empty
const { profiles } = useFriendProfiles(trimmedQuery || null)
```

**Anti-pattern: Manual fetch in useEffect**
```typescript
// ❌ BAD - manual fetch causes excessive requests and no caching
useEffect(() => {
  fetch('/api/v1/profiles').then(...)
}, [dependency])

// ✅ GOOD - SWR handles caching, deduplication, and revalidation
const { data } = useSWR('/api/v1/profiles', jsonFetcher)
```

### Optimistic Updates
- Use `mutate` with optimistic data for immediate UI feedback
- Rollback on error
- Show loading indicators for async operations

## Accessibility

### Required Practices
- All interactive elements must be keyboard accessible
- Use semantic HTML elements
- Provide aria-labels for icon-only buttons
- Ensure sufficient color contrast
- Support screen readers

### Form Accessibility
```typescript
<label htmlFor="email">Email</label>
<Input
  id="email"
  type="email"
  aria-describedby="email-error"
  aria-invalid={!!error}
/>
{error && <p id="email-error" role="alert">{error}</p>}
```
