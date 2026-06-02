import { NoteVisibility } from '@/lib/hooks/useProfile'

const OWN_PROFILE_DEFAULT_VISIBILITY: NoteVisibility[] = ['PUBLIC']
const NON_OWN_PROFILE_DEFAULT_VISIBILITY: NoteVisibility[] = ['PUBLIC', 'FRIENDS', 'CLOSE_FRIENDS', 'PRIVATE', 'AI_ENABLED']

export function getDefaultProfileNotesVisibility(isOwnProfile: boolean): NoteVisibility[] {
  return isOwnProfile
    ? [...OWN_PROFILE_DEFAULT_VISIBILITY]
    : [...NON_OWN_PROFILE_DEFAULT_VISIBILITY]
}
