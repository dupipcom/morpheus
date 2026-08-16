# Utils

Shared pure helpers and a few thin data hooks for the whole app: financial/earnings math, chart safety, i18n/sanitization, social/profile logic, task/recurrence helpers, and session/cookie management. Heavily consumed by API routes, `components/ui`, and all views.

## Files

### Financials

| File | Purpose |
|---|---|
| `budgetUtils.ts` | Recalculates user budget allocation from owned PERCENT-budget lists; remaining budget + allocation validation (DB via prisma) |
| `chartUtils.ts` | Safe chart math: `safeNumber`, `safePercentage`, `safeAverage`, mood data validation, progress percentage |
| `earningsUtils.ts` | Premium-factor earnings engine: per-task/per-completer earnings, prize pools, stash/profit deltas, budget consumption |
| `kaleido.ts` | Kaleido blockchain client (server-only): wallet generation, balance, token transfer, NFT minting via KALEIDO_* env vars |

### i18n / Sanitize

| File | Purpose |
|---|---|
| `htmlEntities.ts` | `decodeHtmlEntities` — named + numeric entity decoding, handles double-encoded, 3-iteration cap |
| `localeUtils.ts` | Locale names list, locale cookie get/set, cookie-header parsing |
| `sanitize.ts` | XSS defense: `sanitizeText` (strips HTML), `sanitizeHTML` (allows safe tags), `sanitizeObject`, `sanitizeEmail`, `sanitizeURL` |
| `rruleUtils.ts` | RFC-5545 RRULE builders: legacy recurrence → RRULE, role-prefix default, `slugifyList` (wraps `@/lib/public/slug`) |
| `date.ts` | ISO week number (returns `{week, year}` for rollover), UTC date-key conversion, `formatDateForLocale`, `isSameDateKey` — single home for date helpers shared across Do, Be, and views |

### Social

| File | Purpose |
|---|---|
| `invitations.ts` | Email-identifier validation + Dupip invitation draft builder |
| `linkPreview.ts` | URL extraction + media embed config for YouTube, SoundCloud, Vimeo, Mixcloud, Spotify, Tidal, Apple Music |
| `noteRelevance.ts` | Relevance scoring for notes (friend/close-friend interactions, recency, self-interaction exclusion) + sort helpers |
| `profileNotesVisibility.ts` | `getDefaultProfileNotesVisibility` — default note visibility per own vs other profile |
| `profileUtils.ts` | Public profile chart data generation, PII sanitization for public views, field visibility filtering, social link defaults |
| `delegation.ts` | Delegation scope normalization/validation against `DELEGATION_SCOPES` |

### Misc

| File | Purpose |
|---|---|
| `cookieManager.ts` | Clerk cookie cleanup, inactivity/session timer (15 min), session-expiry detection, login-time storage |
| `dayHistory.ts` | Groups historical day records into year → week → day buckets (`buildHistoricalEntriesByYear`) |
| `taskUtils.ts` | Task status vocabulary (`STATUS_OPTIONS`), status colors, task-key derivation |
| `userUtils.ts` | User session SWR hooks (`/api/v1/user`, `/api/v1/days?date=`, `/api/v1/wallet`, `/api/v1/hint`) + submit handlers for mood/settings/dates |
| `utils.ts` | `cn` (clsx+tailwind-merge) and `fetcher` / `jsonFetcher` used by every SWR hook |

## Key Exports

| Export | Purpose |
|---|---|
| `recalculateUserBudget`, `getRemainingBudget`, `validateBudgetAllocation` | Budget math over owned task lists |
| `calculateTaskEarnings`, `getPerCompleterEarnings`, `getEarningsPerTask`, `calculateStashAndEarningsDeltas`, `calculateUpdatedUserValues` | Earnings/premium engine |
| `generateWallet`, `getBalance`, `sendTokens`, `generateNFT`, `getNFTs` | Kaleido blockchain ops (server-only) |
| `decodeHtmlEntities` | HTML entity decoding |
| `extractUrls`, `getMediaEmbedConfig` | Media URL detection/embedding |
| `calculateNoteRelevanceScore`, `sortNotes`, `normalizeNoteSortBy` | Note relevance ranking |
| `generatePublicChartsData`, `sanitizeUserEntriesForPublic`, `isFieldVisible`, `filterProfileFields` | Public profile sanitization |
| `buildRRuleFromLegacy`, `rruleFromListRole` | RRULE generation for cadences |
| `sanitizeText`, `sanitizeHTML`, `sanitizeEmail`, `sanitizeURL` | XSS/input sanitization |
| `getStatusColor`, `getTaskKey`, `getTaskStatus`, `calculateTaskStatus`, `mapStatusToEnum` | Task status helpers |
| `useUserData`, `useDayData`, `useWallets`, `useHint`, `submitUserData`, `handleMoodSubmit` | Session/day/wallet SWR + submission |
| `cn`, `fetcher`, `jsonFetcher` | UI class merge + fetch helpers |
| `setupInactivityTimer`, `isSessionExpired`, `shouldLogoutDueToInactivity` | Session inactivity lifecycle |

## Consumers

~110 importing files across `app/api` (37), `app/[locale]` (11), `components/ui` (36, mostly `cn`), `lib/services` (11), `lib/hooks` (8), and all views.

## Tests

`__tests__/` (node:test): `htmlEntities`, `linkPreview`, `noteRelevance`, `profileNotesVisibility`, `sanitize`.

## Cross-References

- `src/app/constants.ts` — `DAILY_ACTIONS`/`WEEKLY_ACTIONS`, `locales` (taskUtils, localeUtils depend on it)
- `src/lib/public/slug.ts` — `slugify` used by `rruleUtils.slugifyList`
- `src/lib/prisma.ts` — budgetUtils, userUtils, dayHistory DB access
- `src/lib/hooks/CLAUDE.md` — hooks build on `jsonFetcher`/`cn`
- Sanitization requirements: `.claude/rules/05-security-compliance.md`
