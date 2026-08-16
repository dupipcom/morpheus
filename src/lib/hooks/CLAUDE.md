# Hooks

Custom React hooks: SWR data fetching with local filtering, optimistic task updates, debouncing, feature flags, inactivity/session timer, and i18n translation loading. Mostly consumed by Do/Be views, task components, and chat/profile components.

## Files

| File | Purpose |
|---|---|
| `useDebounce.ts` | Debounce wrapper for arbitrary functions (e.g. search input handlers) |
| `useFeatureFlag.ts` | Clerk-based flags: `isPremium` (membership in internal org slug `dupip`), `isAgentChatEnabled` (`ai_assistant` feature), `isVirtualNumberEnabled` (`virtual_number` feature) |
| `useFriendProfiles.ts` | SWR `/api/v1/profiles` (refreshInterval 10s) + local name/username filtering by query |
| `useInactivityTimer.ts` | 15-min inactivity timeout with 5-min warning toasts; extends session via POST `/api/v1/user/login` |
| `useListEarnings.ts` | SWR `/api/v1/jobs?listId&workerId&status=ACCEPTED` (+ `date` for daily lists, `dateStart`/`dateEnd` week range for weekly lists) |
| `useOptimisticUpdates.ts` | Refs for pending completions/status updates/task creations (no API — feeds optimistic UI state) |
| `useProfile.ts` | SWR `/api/v1/profile/{userName}`; `useProfileNotes` → `/api/v1/profile/{userName}/notes?visibility&sort&order` |
| `useSearch.ts` | SWR `/api/v1/search?q=` (disabled when query empty) |
| `useTaskHandlers.ts` | Task/job CRUD against `/api/v1/tasks` and `/api/v1/jobs` (create, complete, increment/decrement, toggle redacted, update job) |
| `useTaskLists.ts` | SWR `/api/v1/tasklists` — user's task lists/templates |
| `useTaskStatuses.ts` | Derives task status map from `taskUtils.getTaskKey`/`getTaskStatus` with optimistic status overrides (no fetch) |
| `useTranslations.ts` | Loads locale JSON via `loadTranslations`/`loadTranslationsSync` from `@/lib/i18n`; exposes `t`, `formatDate`, `hasTranslation` |

## Key Exports

| Export | Purpose |
|---|---|
| `useDebounce` | Debounced function wrapper |
| `useFeatureFlag` | `{ isPremium, isAgentChatEnabled, isVirtualNumberEnabled, isLoaded, isSignedIn }` |
| `useFriendProfiles` | `{ profiles, isLoading, error, mutate }` with local query filter |
| `useInactivityTimer` | Timer state; options `{ timeout, warningTime, enabled, onLogout }` |
| `useListEarnings` | `{ data, isLoading }` — ACCEPTED jobs earnings per list/date range |
| `useOptimisticUpdates` | `{ pendingCompletionsRef, pendingStatusUpdatesRef, pendingTaskCreationsRef }` |
| `useProfile` / `useProfileNotes` | Profile + notes with `refreshNotes` callback |
| `useSearch` | `{ data, error, isLoading, mutate }` on `/api/v1/search` |
| `useTaskHandlers` | `handleTaskClick, handleStatusChange, handleIncrementTimes, handleDecrementTimes, handleDecrementCount, handleToggleRedacted, updateJob` |
| `useTaskLists` | `{ lists, isLoading, error, mutate }` |
| `useTaskStatuses` | `{ taskStatuses, setTaskStatuses }` |
| `useTranslations` | `{ t, hasTranslation, formatDate, isLoading }` |

## Consumers

- `src/lib/contexts/i18n.tsx` — `useTranslations` (I18nProvider)
- `src/lib/utils/userUtils.ts` — `useDebounce`, `useOptimisticUpdates`
- Views: `do`, `be`, `mood`, `dashboard`, `chat`, `forms`
- Components: `taskGrid`, `doToolbar`, `searchPopover`, `publicNotesViewer`, `authWrapper`, `chatSidebar`, `chatNavButton`

## Cross-References

- `src/lib/utils/taskUtils.ts` — `useTaskStatuses`/`useTaskHandlers` rely on task keys/statuses
- `src/lib/contexts/i18n.tsx` — I18nProvider built on `useTranslations`
- `src/views/chat/CLAUDE.md`, `src/views/do/CLAUDE.md` — primary hook consumers
- SWR patterns: `.claude/rules/03-frontend.md`
