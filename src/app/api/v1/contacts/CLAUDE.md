# Contacts API

## Routes
- `PUT /api/v1/contacts/[id]`
- `DELETE /api/v1/contacts/[id]`

## Auth
Requires Clerk auth; derives internal `User` by `userId`.

## Behavior
- `PUT`: updates a contact's `name`, `email`, `phone`, `notes`, `interactionQuality`. Requires `name`. Uses `prisma.contact.update({ where: { id, userId } })`.
- `DELETE`: deletes a contact via `prisma.contact.delete({ where: { id, userId } })`.

## Note
⚠️ This route references `prisma.contact`, which is not defined in the current `prisma/schema.prisma`. The `Person` model is the actual contacts entity. Prefer `/api/v1/persons` and treat this route as legacy/dead until the schema is reconciled.
