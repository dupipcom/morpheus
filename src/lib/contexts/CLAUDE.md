# Contexts

React context providers for app-wide state: i18n translation access (`I18nProvider`) and cross-component SWR invalidation for notes (`NotesRefreshProvider`). Both are `'use client'` and expose hooks that throw/no-op when the provider is absent.

## Files

| File | Purpose |
|---|---|
| `i18n.tsx` | `I18nProvider` + `useI18n()` — wraps `useTranslations(locale)`; exposes `t`, `hasTranslation`, `formatDate`, `locale`, `isLoading`; throws outside provider |
| `notesRefresh.tsx` | `NotesRefreshProvider` + `useNotesRefresh()` — registry of `mutate` callbacks keyed by string; `refreshAll()` triggers all registered; returns no-op functions outside provider (backwards-compat) |

## Key Exports

| Export | Purpose |
|---|---|
| `I18nProvider` | Props: `{ children, locale }` |
| `useI18n` | `{ t, hasTranslation, formatDate, locale, isLoading }` |
| `NotesRefreshProvider` | Props: `{ children }` |
| `useNotesRefresh` | `{ registerMutate, unregisterMutate, refreshAll }` |

## Consumers

- `src/lib/clerkLocalization.ts` — `useI18n` for Clerk UI localization
- `src/lib/hooks/useInactivityTimer.ts` — optional `useI18n` with English fallback
- Layouts under `app/[locale]` mount both providers (via `appContent`/layouts)
- Notes components (`notesList`, `publicNotesViewer`, `publishNote`, chat sidebar) register/refresh note mutations

## Cross-References

- `src/lib/hooks/useTranslations.ts` — backing hook for I18nProvider
- `src/lib/i18n.ts` — `loadTranslations`/`loadTranslationsSync`/`t`/`formatDate` used by the hook
- `src/lib/contexts.ts` — the older `GlobalContext` (theme/session/dayData) lives at lib root, not here
