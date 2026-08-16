# API v1

Main REST API for the Dupip application. All routes are prefixed with `/api/v1`.

## Conventions

- **Auth**: Clerk via `await auth()` (or `getAuthenticatedUser()` / `getCurrentChatUser()`), then resolve internal `User`.
- **Authorization**: Ownership, list membership (OWNER/MANAGER/COLLABORATOR/FOLLOWER), and visibility enums are checked before mutations.
- **Errors**: `{ error: string }` with 400/401/403/404/409/500.
- **Sanitization**: `sanitizeText` / `sanitizeHTML` from `@/lib/utils/sanitize`.

## Endpoint Index

| Resource | Doc | Endpoints (methods) |
|---|---|---|
| Attachments | `attachments/CLAUDE.md` | `POST /attachments/presign`, `GET/POST /attachments`, `DELETE /attachments/{documentId}` |
| Budgets | `budgets/CLAUDE.md` | `GET/POST /budgets` (user's own budgets) |
| Auth webhook | `auth/CLAUDE.md` | `POST /api/v1/auth` (Clerk user.created/session.created/user.updated/user.deleted) |
| Chat | `chat/CLAUDE.md` | `POST /api/v1/chat`, `GET /chat/sidebar`, `POST /chat/token`, `GET /chat/unread-count`, `POST /chat/read-state`, `GET /chat/dm-candidates`, `GET/POST /chat/dms`, `GET/POST /chat/dms/{id}/messages`, `PATCH/DELETE /chat/channels/{id}`, `GET/POST /chat/channels/{id}/messages`, `PATCH/DELETE /chat/messages/{id}`, `GET /chat/messages/{id}/thread`, `GET/POST /chat/orgs`, `GET/POST /chat/orgs/{id}/channels`, `GET/POST /chat/orgs/{id}/invites`, `POST /chat/orgs/{id}/roles`, `DELETE /chat/invites/{id}`, `POST /chat/invites/{id}/accept` |
| Comments | `comments/CLAUDE.md` | `GET/POST /comments`, `PUT/DELETE /comments/{commentId}` |
| Contacts | `contacts/CLAUDE.md` | `PUT/DELETE /contacts/{id}` (legacy; see note) |
| Days | `days/CLAUDE.md` | `GET/POST /days` |
| Debug | `debug/CLAUDE.md` | `GET /debug/task-state` |
| Delegated users | `delegated-users/CLAUDE.md` | `GET/POST/DELETE /delegated-users` |
| Events | `events/CLAUDE.md` | `GET/POST /events`, `PUT/DELETE /events/{id}` |
| Friend request | `friend-request/CLAUDE.md` | `POST /friend-request`, `POST /friend-request/action` |
| Friend requests | `friend-requests/CLAUDE.md` | `GET /friend-requests` |
| Friends | `friends/CLAUDE.md` | `GET /friends`, `POST /friends/unfriend` |
| Friendship status | `friendship-status/CLAUDE.md` | `GET /friendship-status` |
| Hint (AI) | `hint/CLAUDE.md` | `GET /hint` |
| Jobs | `jobs/CLAUDE.md` | `GET/POST /jobs`, `GET/PUT/DELETE /jobs/{jobId}` |
| Likes | `likes/CLAUDE.md` | `GET/POST /likes` |
| Link preview | `link-preview/CLAUDE.md` | `GET /link-preview` |
| Magazine | `magazine/CLAUDE.md` | `GET /magazine` |
| Meet me | `meet-me/CLAUDE.md` | `POST /meet-me`, `GET /meet-me/availability` |
| Notes | `notes/CLAUDE.md` | `GET/POST /notes`, `PUT/PATCH/DELETE /notes/{noteId}`, `GET/POST /notes/{noteId}/comments`, `GET /notes/public` |
| Notifications | `notifications/CLAUDE.md` | `GET /notifications` (last 30 + unread), `POST /notifications` (mark read) |
| Persons | `persons/CLAUDE.md` | `GET/POST /persons`, `PUT/DELETE /persons/{id}` |
| Places | `places/CLAUDE.md` | `GET /places/autocomplete`, `GET /places/details`, `GET /places/staticmap` |
| Profile | `profile/CLAUDE.md` | `GET/POST /profile`, `GET /profile/{userName}`, `GET /profile/{userName}/notes` |
| Profiles | `profiles/CLAUDE.md` | `GET /profiles`, `GET /profiles/by-ids` |
| Search | `search/CLAUDE.md` | `GET /search` |
| SMS | `sms/CLAUDE.md` | `GET /sms/conversations`, `GET/POST /sms/conversations/{id}/messages`, `POST /sms/conversations/{id}/read` |
| Task lists | `tasklists/CLAUDE.md` | `GET/POST /tasklists`, `GET/PUT/DELETE /tasklists/{taskListId}`, `POST /tasklists/{taskListId}/clone` |
| Tasks | `tasks/CLAUDE.md` | `GET/POST /tasks`, `GET/PUT/DELETE /tasks/{taskId}` (DELETE with scope), `GET/POST /tasks/migrate` (deprecated no-op) |
| Templates | `templates/CLAUDE.md` | `GET/POST /templates`, `POST /templates/{templateId}/clone`, `GET /templates/public` |
| Telnyx webhook | `telnyx/CLAUDE.md` | `POST /telnyx/webhook` (Ed25519 + 5-min timestamp) |
| Things | `things/CLAUDE.md` | `GET/POST /things` |
| User | `user/CLAUDE.md` | `GET/POST /user`, `POST /user/login` |
| User dashboard data | `user-dashboard-data/CLAUDE.md` | `GET /user-dashboard-data` |
| Virtual number | `virtual-number/CLAUDE.md` | `GET/POST /virtual-number`, `GET /virtual-number/numbers` |
| Wallet | `wallet/CLAUDE.md` | `GET/POST /wallet`, `GET/DELETE /wallet/{walletId}`, `POST /wallet/nft`, `GET /wallet/nft/list`, `POST /wallet/transfer` |

## Notable Cross-Cutting Behaviors

- **Visibility filtering**: public note/template/profile feeds use shared services in `src/lib/services/visibility` and `src/lib/utils/profileUtils` to enforce `PUBLIC` / `FRIENDS` / `CLOSE_FRIENDS`.
- **Delegation**: `/delegated-users`, `/hint`, `/user-dashboard-data`, and recipient-scoped notes honor third-party analyst delegation scopes (`PRIVATE`, `AI_ENABLED`, `PUBLIC`, `FRIENDS`, `CLOSE_FRIENDS`).
- **Financial integrity**: job acceptance/cancellation and task completion recalculate earnings, stash, profit, equity, and `Day` progress server-side (never trust client numbers).
- **Realtime**: chat mutation endpoints publish Ably events and invalidate sidebar/unread state for participants.

## OpenAPI

The machine-readable contract is at `src/app/api/openapi.yaml`.
