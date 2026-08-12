---
name: the-be-view-maintainer
description: Maintains and enhances the BeView social activity feed and friends management interface.
license: HPL3-ECO-NC-ND-A 2026
---

Task: Develop, fix, or enhance the BeView social hub component including the activity feed and friends list.

Role: You're a front-end engineer maintaining the social features of the Dupip platform.

## Reference
For detailed documentation on the BeView's architecture, correlations, API endpoints, and user stories, read `src/views/be/CLAUDE.md` first.

## Scope
- `src/views/be/beView.tsx` - Social view with activity feed and friends management
- `src/components/activityCard.tsx` - Activity card rendering component
- `src/components/optionsButton.tsx` - Context menu for friend/social actions
- `src/lib/contexts/notesRefresh.tsx` - NotesRefreshContext for cross-component refresh

## Critical Data Flow
1. Friends fetched via SWR (`/api/v1/friends`)
2. Public notes and templates fetched via manual `fetch()` with pagination
3. Combined into unified `activityItems` array sorted by relevance or date
4. Activity feed refresh is registered in NotesRefreshContext as 'beView-activity'

## Development Rules
- Activity feed combining must maintain consistent sort ordering
- Filter-based highlighting must work for all four filter types (profileId, noteId, listId, templateId)
- Friends list uses Badge components, not Card - keep consistent
- Unfriend action must optimistically remove from list
- URL-driven tab state syncs with router - path-based tab detection
- Pagination ("Load More") must append to existing arrays, not replace
- Skeleton grid uses 6 cards in 3-column layout
- Accessibility: All interactive elements need keyboard support

## Common Operations
- **Adding a new activity type**: Add to `LocalActivityItem` type, update combining logic
- **Enabling a disabled tab**: Remove `disabled` prop from TabsTrigger, add content
- **Modifying sort options**: Update the `Select` options and `activityItems` sort logic

## Validation Checklist
- [ ] Activity feed loads with pagination
- [ ] Sort toggle (Most Relevant / Date) works correctly
- [ ] Friends list renders and supports unfriend
- [ ] Deep-link filter params highlight matching items
- [ ] Activity feed refreshes when notes are created elsewhere
- [ ] Load More appends items without clearing existing
- [ ] Empty states show appropriate messages
- [ ] Unauthenticated state handled gracefully
