# Templates API

## Routes
- `GET /api/v1/templates`
- `POST /api/v1/templates`
- `POST /api/v1/templates/[templateId]/clone`
- `GET /api/v1/templates/public`

## Auth
`/templates` GET/POST require Clerk auth. `/templates/public` is public but visibility-aware. `clone` requires Clerk auth.

## GET `/templates`
Returns templates owned by the current user plus public templates.

## POST `/templates`
Creates a template. Body: `{ name?, tasks?, visibility? }`. Owner is set to the current user.

## POST `/templates/[templateId]/clone`
Clones a public or owned template into a new private task list, copies `templateTasks`, links `templateId`, and records the cloning user in `Template.clonedBy`.

## GET `/templates/public`
Paginated visibility-aware public templates. Supports `page`, `limit`, `templateId`/`listId`, `profileId`. Uses `buildVisibilityWhereClauseForUserArray`, sorts comments, and batch-enriches owner profiles.

## Dependencies
- `src/lib/services/visibility`
- `src/lib/utils/profileUtils`
- Prisma models: `Template`, `List`, `User`
