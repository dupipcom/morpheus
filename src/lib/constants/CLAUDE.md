# Constants

Small shared constant modules for mobile navigation layout, delegation role keys, and visibility enums. Pure data with a couple of type guards; no DB access.

## Files

| File | Purpose |
|---|---|
| `mobileNav.ts` | Bottom-nav stack geometry: main nav (80px) + secondary toolbar (50px) = 130px; exports Tailwind classes for offset and content bottom padding |
| `roles.ts` | `ROLE_KEYS` — 13 seeded delegation roles (DOCTOR, TUTOR, MENTOR, TEACHER, GUIDE, ASSISTANT, FRIEND, CLOSE_FRIEND, LAWYER, SOLICITOR, FAMILY, HOUSEHOLD, THERAPIST) + `isRoleKey` guard |
| `visibility.ts` | `NOTE_VISIBILITIES` (7, incl. `DOC_ENABLED`), `DELEGATION_SCOPES` (5), `WRITABLE_NOTE_VISIBILITIES` (HIDDEN excluded — system-only, not in Prisma enum) |

## Key Exports

| Export | Purpose |
|---|---|
| `MOBILE_NAV_OFFSET_CLASS` | `bottom-[130px]` — position above full nav stack |
| `MOBILE_CONTENT_BOTTOM_PADDING_CLASS` | `pb-[160px]` — bottom padding for scrollable mobile content |
| `ROLE_KEYS`, `RoleKey`, `isRoleKey` | Delegation role vocabulary + type guard |
| `NOTE_VISIBILITIES`, `WRITABLE_NOTE_VISIBILITIES`, `DELEGATION_SCOPES` | Visibility value lists (used by `utils/delegation.ts`) |

## Consumers

- `src/lib/utils/delegation.ts` — imports `DELEGATION_SCOPES`
- Mobile layouts/components (nav bars, chat composer offset) use the `MOBILE_*` classes
- Role-selection UI + API routes use `ROLE_KEYS`

## Cross-References

- `src/migrations/0017-seed-roles.js` — seeds Role docs matching `ROLE_KEYS`
- `src/locales/*.json` — translations under `roles.<KEY>`
