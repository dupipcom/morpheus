**Purpose**
- This file explains how to be productive in the Morpheus repo: key architecture, developer workflows, conventions, and integration points.

**Big Picture**
- **Framework**: Next.js (App Router) application located under `src/app`. UI components live in `src/components` and shared logic in `src/lib`.
- **Data / Backend**: Uses `Prisma` with schema in `prisma/schema.prisma`. The generated client is under `generated/` — do not edit generated files; run `npx prisma generate` when schema changes.
- **Headless CMS**: Payload CMS is used; API endpoints configured via `PAYLOAD_API_URL` / `NEXT_PUBLIC_PAYLOAD_URL` environment variables. Scripts in `scripts/` perform migration and sync tasks.
- **Auth & Edge services**: Clerk handles authentication (`CLERK_*` vars). Kaleido keys and addresses are present for blockchain/NFT integrations (environment variables prefixed `KALEIDO_` and `SYMBOL_*`).

**Important Files to Inspect**
- `src/app/layout.tsx` — global layout, Providers and locale resolution.
- `src/app/constants.ts` — canonical `locales` list and `defaultLocale` used across the app.
- `src/locales/*.json` — translation files; `scripts/generate-locales.js` shows how locale files are produced.
- `scripts/` — migration, localization and sync scripts (e.g., `generate-locales.js`, `sync-locales-from-en.js`, `translate-new-keys.js`).
- `prisma/schema.prisma` and `generated/` — database schema and generated client.
- `next.config.ts` and `package.json` — Next.js and build scripts.

**Developer Workflows (commands & examples)**
- Local dev (recommended):
  - Copy env: `cp .env.public .env.local` (project README suggests this).
  - Use Node v20: `nvm use v20`.
  - Install: `npm ci`.
  - Run dev server (also runs Prisma generate): `npm run dev` (expands to `npx prisma generate && next dev --turbopack`).
- Build & start:
  - `npm run build` (runs `npx prisma generate && next build`).
  - `npm start` to run the production server.
- Prisma: after any `prisma/schema.prisma` change run `npx prisma generate` and apply migrations as your workflow requires.

**Localization & i18n specifics**
- Canonical locales list is in `src/app/constants.ts`. `defaultLocale` is `en`.
- Locale JSON files live in `src/locales/*.json`. Scripts like `scripts/generate-locales.js` copy the English template into other locale files — translations are manual or via provided translation scripts.
- Locale resolution is handled in `src/app/layout.tsx` (functions: `getLocaleFromPath`, `getLocaleCookie`). Be careful when changing URL structure; layout logic redirects between cookie and path locale.

**Patterns & Conventions to Follow**
- TypeScript-first codebase: prefer typed shapes and `zod` validation where present.
- Components use Next.js App Router conventions: `use client` at top for client components. Check `src/components/*` for examples.
- Global state and providers are in `src/lib/contexts` and `src/components/providers` — update both when adding app-wide state.
- Avoid editing files in `generated/` and other build outputs.

**Integration Points & Secrets**
- Payload CMS: `PAYLOAD_API_URL` and `NEXT_PUBLIC_PAYLOAD_URL` (check `.env` and `scripts/`).
- Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` used for auth.
- Kaleido & blockchain: environment variables `KALEIDO_*` and `SYMBOL_*` are referenced by NFT/minting code (search `KALEIDO_` and `SYMBOL_` when modifying related modules).

**Where to update translations / migrate content**
- Use `scripts/translate-new-keys.js`, `scripts/generate-locales.js`, and `apply_translations.js` for localization tasks. `update_locales.sh` orchestrates some flows — inspect before running.

**Testing & Linting**
- No test runner configured in `package.json`. `lint` runs `next lint`.

**Quick troubleshooting notes**
- If pages fail to build due to Prisma: run `npx prisma generate` and ensure `DATABASE_URL` is set in env.
- If locale redirects behave unexpectedly: inspect `getLocaleCookie()` and `getLocaleFromPath()` implementations and `defaultLocale` in `src/app/constants.ts`.

**When editing large features**
- Update `prisma/schema.prisma`, run `npx prisma generate`, and ensure generated client changes are not hand-edited.
- Add new public-facing copy to `src/locales/en.json` and run `scripts/translate-new-keys.js` (or follow the repo's localization scripts) to propagate keys.

**Contacts & Notes**
- The project README (`README.md`) contains minimal onboarding steps. When in doubt about migration scripts or Payload usage, inspect `scripts/README.md` and `scripts/*` files for context.

Please review this and tell me if you want more detail in any section (e.g., exact places that reference Kaleido, specific Provider implementation, or examples of component patterns).
