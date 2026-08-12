---
name: the-mood-view-maintainer
description: Maintains and enhances the MoodView for daily mood tracking, journaling, and third-party delegation.
license: HPL3-ECO-NC-ND-A 2026
---

Task: Develop, fix, or enhance the MoodView component for mood tracking, notes, details, and delegation management.

Role: You're a front-end engineer maintaining the emotional wellness and journaling features.

## Reference
For detailed documentation on the MoodView's architecture, debounced writes, slider UI, and user stories, read `src/views/mood/CLAUDE.md` first.

## Scope
- `src/views/mood/moodView.tsx` - Mood tracking and journaling interface
- `src/components/notesList.tsx` - Notes display component
- `src/components/ui/contactCombobox.tsx` - Person combobox
- `src/components/ui/thingCombobox.tsx` - Thing combobox
- `src/components/ui/lifeEventCombobox.tsx` - Life event combobox
- `src/components/ui/slider.tsx` - Slider UI component
- `src/lib/contexts/notesRefresh.tsx` - Notes refresh context
- `src/lib/hooks/useDebounce.ts` - Debounce utility
- `src/lib/utils/userUtils.ts` - `useDayData` and `generateInsight`
- `src/lib/utils/delegation.ts` - Delegation scope normalization

## Critical Data Flow
1. Day data loaded via `useDayData(date)` → `serverMood`, `serverMoodContacts`, etc.
2. Individual SWR calls for contacts, things, life events, notes, delegations
3. Mood slider changes: immediate local update + 5s batched debounced save
4. Date sync: two-way between local `fullDay` and `GlobalContext.selectedDate`
5. Notes refresh registered via `registerMutate('moodView-notes', ...)`

## Debounce Architecture
```
Slider change → setMood(prev => ({...prev, [field]: value}))
             → debouncedSaveMood({ [field]: value })
             → collect changes for 5 seconds
             → saveDayData(moodUpdates, undefined, undefined, undefined)
```
Important: `debouncedSaveMood` uses `{ batched: true }` - accumulates all field changes within 5s window.

## Development Rules
- Mood sliders use 0-5 scale with 0.5 step
- Debounced saves use 5-second window (configurable in useDebounce)
- Contacts/things/lifeEvents use `{ batched: false }` (send latest full array)
- Date format: YYYY-MM-DD using local timezone conversion
- Two-way date sync with GlobalContext must prevent infinite loops via `isUpdatingFromContext` ref
- Delegation scopes: at least one must remain selected (minimum one scope enforced)
- Friend suggestions use `Command` component for accessible autocomplete
- URL-driven tab state: path determines active tab

## Common Operations
- **Adding a new mood dimension**: Add slider to Mood tab, update serverMood, update Dashboard chart config
- **Adding a new detail type**: Add combobox section to Details tab, add SWR fetch, add save handler
- **Modifying delegation flow**: Update scopes, identifier input, or suggestions logic

## Validation Checklist
- [ ] Mood sliders respond immediately with visual feedback
- [ ] 5-second debounce batches multiple slider changes
- [ ] Date navigation syncs both directions (context and URL)
- [ ] Notes filter by visibility correctly
- [ ] Contacts/things/life events combobox allow add and remove
- [ ] Quality sliders for selected items save correctly
- [ ] Third-party delegation creates and removes as expected
- [ ] Friend suggestion dropdown filters by input
- [ ] Scope dropdown enforces minimum-one constraint
- [ ] AI insights text renders for each mood dimension
