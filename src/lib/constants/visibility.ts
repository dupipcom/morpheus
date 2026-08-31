export const NOTE_VISIBILITIES = ['PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS', 'PUBLIC', 'HIDDEN', 'AI_ENABLED', 'DOC_ENABLED'] as const
// Grantable delegation scopes. AI_ENABLED is deprecated (legacy rows still
// reference it, so it stays accepted); DOC_ENABLED is its successor in the UI.
export const DELEGATION_SCOPES = ['PRIVATE', 'AI_ENABLED', 'FRIENDS', 'CLOSE_FRIENDS', 'PUBLIC', 'DOC_ENABLED'] as const
// Visibilities users may write (HIDDEN is a system-only state, not in the Prisma enum)
export const WRITABLE_NOTE_VISIBILITIES = ['PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS', 'PUBLIC', 'AI_ENABLED', 'DOC_ENABLED'] as const
