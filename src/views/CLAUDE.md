# Views

Feature-level view components under `src/views/`. Each view has its own `CLAUDE.md` with architecture, API dependencies, user stories, and behaviors.

## Index

| View | File | Purpose | Key API Dependencies |
|---|---|---|---|
| `BeView` | `be/beView.tsx` | Social activity feed, friends list, events browse/create/manage/publish | `/api/v1/friends`, `/api/v1/notes/public`, `/api/v1/templates/public`, `/api/v1/friends/unfriend`, `/api/v1/events`, `/api/v1/events/public`, `/api/v1/events/{id}`, `/api/v1/events/{id}/publish`, `/api/v1/orgs`, `/api/v1/attachments` |
| `ChatView` | `chat/chatView.tsx` | Real-time messaging (orgs, channels, DMs, threads) | `/api/v1/chat/*` (sidebar, messages, orgs, invites, read-state, token, dm-candidates, dms) |
| `DashboardView` | `dashboard/dashboardView.tsx` | Analytics charts (mood/productivity/money) | `/api/v1/user-dashboard-data`, `/api/v1/delegated-users`, `/api/v1/hint` |
| `DoView` | `do/doView.tsx` | Task management hub (forms + task grid + job workflow) | `/api/v1/tasks`, `/api/v1/jobs`, `/api/v1/tasklists`, `/api/v1/budgets`, `/api/v1/profiles/by-ids` |
| `InvestView` | `invest/investView.tsx` | Blockchain wallets, NFT, transfers, premium factors | `/api/v1/user` (direct), `/api/v1/wallet*` (via child components) |
| `MoodView` | `mood/moodView.tsx` | Mood tracking, notes, entities, delegation | `/api/v1/days`, `/api/v1/persons`, `/api/v1/things`, `/api/v1/events`, `/api/v1/notes`, `/api/v1/delegated-users` |
| `PricingView` | `pricing/pricingView.tsx` | Public pricing grid (Clerk PricingTable) + DPIP consent | Clerk dashboard plans (via `<PricingTable />`), `/api/v1/user` (consents) |
| `ProfileView` | `profile/profileView.tsx` | Public profile display (server-rendered) | No client calls; backed by `/api/v1/profile/{userName}` and `/api/v1/profile/{userName}/notes` |
| `SettingsView` | `settings/settingsView.tsx` | Currency + daily/weekly task templates | `/api/v1/user` (GET/POST) |
| `forms/` | `forms/*.tsx` | Task/list/template creation & editing forms | `/api/v1/tasklists`, `/api/v1/tasks`, `/api/v1/profiles/by-ids`, `/api/v1/templates` |

## Barrel Export

`src/views/index.ts` exports the public view components (`BeView`, `ChatView`, `DashboardView`, `DoView`, `InvestView`, `MoodView`, `ProfileView`, `SettingsView`).

## Cross-References

- The controller for these views lives under `src/app/api/v1` (see `src/app/api/v1/CLAUDE.md`).
- Data fetching follows SWR patterns (see `.claude/rules/03-frontend.md`) with local filtering preferred over refetch-on-query-change.
- `useUserData`, `useDayData`, `useHint`, and `handleSettingsSubmit` in `src/lib/utils/userUtils.ts` wrap the `/api/v1/user`, `/api/v1/days`, and `/api/v1/hint` endpoints.

## Owners

- Individual views are owned by their `*-view-maintainer` skills (e.g., `the-do-view-maintainer`, `the-mood-view-maintainer`).
- `the-api-maintainer` owns the endpoints these views consume.
