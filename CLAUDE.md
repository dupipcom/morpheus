# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Morpheus is Dupip's content presence website - a Next.js 15 application with internationalization support, Prisma ORM with MongoDB, Clerk authentication, and Payload CMS integration. The application is a productivity and personal management platform with social features, task tracking, mood logging, and blockchain wallet integration.

## Development Commands

### Setup
```bash
cp .env.public .env.local
nvm use v20
npm ci
```

### Development
```bash
npm run dev          # Start dev server with Turbopack and Prisma generation
npm run build        # Build for production (includes Prisma generation)
npm start            # Start production server
npm lint             # Run ESLint
```

### Prisma Commands
```bash
npx prisma generate  # Generate Prisma client to generated/prisma
npx prisma studio    # Open Prisma Studio for database management
npx prisma db push   # Push schema changes to MongoDB
```

## Architecture

### Internationalization (i18n)

The application supports 33 locales with automatic language detection:

- **Middleware**: Detects user's preferred language from `Accept-Language` header or `dpip_user_locale` cookie
- **Routing**: All routes are locale-prefixed (e.g., `/en/app/profile`, `/es/dashboard`)
- **Bot Handling**: Special handling for crawlers to prefer English metadata via `dpip_bot_en` cookie
- **Translation Files**: Located in `src/locales/` (e.g., `en.json`, `es.json`)
- **Context**: `useI18n()` hook provides `t()` function and `formatDate()` for locale-specific formatting
- **Task Localization**: Tasks have `localeKey` field for translation lookup; fallback to `name` if translation missing

Default locale: `en`

### Database & ORM

- **Database**: MongoDB
- **ORM**: Prisma (client generated to `generated/prisma/`)
- **Prisma Client**: Import from `@/generated/prisma` (aliased path)
- **Connection**: Singleton pattern in `src/lib/prisma.ts`

Key models:
- `User`: Auth + financial data (stash, profit, equity, withdrawn)
- `Profile`: Public user profiles with visibility controls
- `Day`: Daily activity tracking with mood, tasks, ticker
- `Task`: Embedded type in Day/List with categories, areas, status
- `List`/`Template`: Task organization with budget tracking
- `Note`, `Comment`, `Like`: Social features with visibility controls
- `Wallet`, `Transaction`: Blockchain integration
- `Person`, `Thing`, `Event`: Entity tracking

### Authentication

- **Provider**: Clerk (`@clerk/nextjs`)
- **Middleware**: Protected routes use `createRouteMatcher(['app/(.*)'])`
- **Redirects**:
  - `/` → `/{locale}/app/profile` (authenticated users)
  - `/{locale}` → `/{locale}/app/profile` (authenticated users)
  - `/@username` → `/{locale}/profile/{username}` (public profiles)

### Content Management

- **CMS**: Payload CMS (headless)
- **SDK**: `@payloadcms/sdk` initialized in `src/lib/payload.ts`
- **Collections**: `pages`, `posts` (articles/episodes)
- **Environment**: `PAYLOAD_API_URL` or `NEXT_PUBLIC_PAYLOAD_API_URL`
- **Rich Text**: Uses `@payloadcms/richtext-lexical`

### Routing Structure

```
src/app/
├── [locale]/           # Locale-prefixed routes
│   ├── app/           # Protected app routes (requires auth)
│   │   ├── profile/   # User profile
│   │   ├── do/        # Task management (Day/Week views redirect here)
│   │   ├── mood/      # Mood tracking
│   │   └── ...
│   ├── profile/       # Public profiles
│   ├── magazine/      # Content/articles
│   └── [[...page]]/   # Catch-all for CMS pages
└── api/
    └── v1/            # REST API endpoints
```

### Path Aliases

```typescript
"@/*": "./src/*"
"@/views/*": "./src/views/*"
```

### Components Organization

- `src/components/`: Reusable UI components (40+ components)
- `src/components/ui/`: shadcn/ui components
- `src/views/`: Feature-specific view components (dashboardView, doView, profileView, etc.)
- `src/views/forms/`: Form components

### State Management & Data Fetching

- **SWR**: For client-side data fetching (`swr` package)
- **Hooks**: Custom hooks in `src/lib/hooks/`
  - `useProfile`: User profile management
  - `useTaskHandlers`: Task CRUD operations
  - `useOptimisticUpdates`: Optimistic UI updates
  - `useTranslations`: i18n translations
  - `useDebounce`: Debounced values
  - `useFeatureFlag`: Feature flags

### Task System

Tasks are central to the application:

- **Areas**: `self`, `home`, `social`, `work` (enum)
- **Categories**: `body`, `spirituality`, `fun`, `clean`, `affection`, `maintenance`, `community`, `growth`, `work`, etc.
- **Cadence**: `daily`, `weekly`, `2-daily`, etc.
- **Status**: `open`, `completed`, etc.
- **Budget**: Tasks can have budget allocations
- **Completers**: Array tracking completion history with earnings/prizes
- **Predefined Tasks**: `DAILY_ACTIONS` and `WEEKLY_ACTIONS` in `src/app/constants.ts`

### Blockchain Integration

- **Provider**: Kaleido (blockchain-as-a-service)
- **Features**: NFT generation, wallet management, transactions
- **Components**: `nftGenerator.tsx`, wallet APIs
- **Environment Variables**: `KALEIDO_*` prefix (see `.env.public`)

### Styling

- **Framework**: Tailwind CSS 4
- **Plugins**: `@tailwindcss/postcss`, `tw-animate-css`
- **UI Library**: Radix UI primitives
- **Utilities**: `clsx`, `tailwind-merge`, `class-variance-authority`
- **Themes**: `next-themes` for dark mode support

### AI Integration

- **Provider**: OpenAI (via Vercel AI SDK)
- **Packages**: `ai`, `@ai-sdk/openai`, `@ai-sdk/react`, `@ai-sdk/rsc`
- **Component**: `agentChat.tsx` for AI interactions
- **Config**: `src/lib/openai.ts`

## Important Notes

### Build Configuration

- **TypeScript Errors**: Ignored during builds (`ignoreBuildErrors: true`)
- **ESLint Errors**: Ignored during builds (`ignoreDuringBuilds: true`)
- This is intentional for rapid development but should be addressed before production

### API Structure

- All API routes in `src/app/api/v1/`
- RESTful design with standard HTTP methods
- Authentication via Clerk middleware
- Examples: `/api/v1/user`, `/api/v1/days`, `/api/v1/tasks`, `/api/v1/notes`

### Visibility System

The application has a comprehensive visibility system:
- `PRIVATE`: Owner only
- `FRIENDS`: User's friends
- `CLOSE_FRIENDS`: Close friends subset
- `PUBLIC`: Everyone
- `HIDDEN`: Special hidden state
- `AI_ENABLED`: Available for AI processing (Notes only)

### Environments

- **Production**: https://www.dupip.com
- **Nightly**: https://beta.dupip.com

### Redirects & Rewrites

- `/episodes` → Mixcloud
- `/code` → GitHub
- `/app/day`, `/app/week` → `/app/do` (302 redirects)
- `/api/nexus/audio` → Radio stream proxy

### Image Configuration

- Remote patterns allow all HTTPS hosts and localhost HTTP
- Used for CMS images, user avatars, external content

### Migration Scripts

Located in `src/migrations/` - check `scripts/README-migration.md` for migration documentation.
