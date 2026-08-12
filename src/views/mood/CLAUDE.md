# MoodView - Daily Mood, Notes & Delegation View

## Purpose

The MoodView is the emotional wellness tracking hub. It allows users to log daily mood metrics (gratitude, optimism, restedness, tolerance, self-esteem, trust) via sliders, write journal notes, track influencing factors (people, things, life events), and manage third-party analysts (delegation). It also provides AI-generated insights for each mood dimension.

## File: `moodView.tsx`

## Component Architecture

```
MoodView
├── Tabs (mood | notes | details | third-party)
│   ├── Mood Tab
│   │   ├── Insight paragraphs (AI-generated analysis)
│   │   └── 6x Slider (gratitude, optimism, restedness, tolerance, selfEsteem, trust)
│   ├── Notes Tab
│   │   ├── Visibility filter dropdown
│   │   └── NotesList component
│   ├── Details Tab
│   │   ├── Life Events (LifeEventCombobox + quality sliders)
│   │   ├── People (ContactCombobox + quality sliders)
│   │   └── Things (ThingCombobox + quality sliders)
│   └── Third-Party Tab
│       ├── Friend suggestion combobox (username/email search)
│       ├── Scope selection dropdown (visibility scopes to delegate)
│       ├── Add delegation button
│       └── Active delegations list (with remove)
```

## State Management

### Day Data (useDayData)
- Primary data source via `useDayData(date, isAuthed)` - fetches day's mood, contacts, things, life events
- Optimistic updates on slider change (immediate UI, debounced save)

### Data Fetching (SWR)
- **Contacts**: `useSWR(/api/v1/persons)` - all user's contacts
- **Things**: `useSWR(/api/v1/things)` - all user's things
- **Life events**: `useSWR(/api/v1/events)` - all user's life events
- **Notes**: `useSWR(/api/v1/notes?visibility=X)` - notes for the date
- **Delegations**: `useSWR(/api/v1/delegated-users)` - outgoing delegations

### GlobalContext Integration
- Reads/writes `selectedDate` (date synchronization with other views)
- Two-way sync: `contextSelectedDate` → `fullDay` (local) and vice versa

### NotesRefreshContext
- Registers `mutateNotes` for cross-component refresh

### Debounced Writes (5-second batched debounce)
- **Mood**: `debouncedSaveMood` - batched mode (accumulates changes)
- **Contacts**: `debouncedSaveContacts` - sends latest full array
- **Things**: `debouncedSaveThings` - sends latest full array
- **Life events**: `debouncedSaveLifeEvents` - sends latest full array

### Props
```typescript
{
  timeframe?: string              // "day" or "week"
  date?: string | null            // YYYY-MM-DD date string
  defaultTab?: 'mood' | 'notes' | 'details' | 'third-party'
  filterNoteId?: string           // Deep-link to specific note
}
```

## Correlations

| Related To | Relationship |
|---|---|
| **DashboardView** | Mood data appears in Dashboard charts |
| **NotesList** | Renders notes in the Notes tab |
| **ContactCombobox** | Person selection for mood influence tracking |
| **ThingCombobox** | Thing selection for mood influence tracking |
| **LifeEventCombobox** | Life event selection for mood influence tracking |
| **useDayData** | Shared hook for day data (also used by day server component) |
| **useDebounce** | 5-second batched debounced saves to reduce API calls |
| **Delegation system** | Creates/removes third-party analyst delegations |

## User Stories

1. **As a user**, I can log my mood across 6 dimensions using sliders (0-5 scale)
2. **As a user**, I can see AI-generated insight text for each mood dimension
3. **As a user**, I can write journal notes for the current day
4. **As a user**, I can filter notes by visibility (private, friends, public, etc.)
5. **As a user**, I can tag people who influenced my mood and rate interaction quality
6. **As a user**, I can tag things that influenced my mood and rate their quality
7. **As a user**, I can tag life events that influenced my mood and rate impact
8. **As a user**, I can add new life events on the fly
9. **As a user**, I can create new contacts and things through comboboxes
10. **As a user**, I can delegate analysis access to friends or email contacts
11. **As a user**, I can manage (view/remove) my active delegations
12. **As a user**, I can navigate between dates using GlobalContext's selectedDate

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/days` | POST | Save day mood data (partial updates supported) |
| `/api/v1/persons` | GET | Fetch user's contacts |
| `/api/v1/things` | GET | Fetch user's things |
| `/api/v1/events` | GET/POST | Fetch/create life events |
| `/api/v1/notes?visibility=...` | GET | Fetch notes with visibility filter |
| `/api/v1/delegated-users` | GET/POST/DELETE | Manage third-party delegations |

## Loading States

- **Day data loading** (`dayLoading`): Shows `MoodViewSkeleton`
- **Content loading**: Wrapped in `ContentLoadingWrapper`

## Key Behaviors

- **Optimistic mood**: Slider changes are immediately reflected in UI, saved with 5s debounce
- **Date synchronization**: Two-way sync with `GlobalContext.selectedDate`
- **URL-driven tabs**: Active tab syncs with URL path (`/feel/mood`, `/feel/notes`, etc.)
- **Visibility filtering**: Notes tab has dropdown to filter by note visibility
- **Scope enforcement**: Delegations require at least one scope selected
- **Friend suggestions**: Autocomplete dropdown for friend-based delegation
