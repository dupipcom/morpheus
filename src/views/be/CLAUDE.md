# BeView - Social Activity & Friends View

## Purpose

The BeView is the social hub of the application. It displays a combined activity feed of public notes and templates, a friends list with unfriend capability, and placeholder tabs for future social features (events, spaces, organizations). It serves as the primary interface for discovering and engaging with community content.

## File: `beView.tsx`

## Component Architecture

```
BeView
├── Tabs (activity | friends | events | spaces | organizations)
│   ├── Activity Tab
│   │   ├── Sort selector (Most Relevant / Date)
│   │   └── ActivityCard grid (notes + templates)
│   ├── Friends Tab
│   │   ├── Friend badge grid
│   │   └── OptionsButton (view profile, unfriend)
│   ├── Events Tab (disabled, coming soon)
│   ├── Spaces Tab (disabled, coming soon)
│   └── Organizations Tab (disabled, coming soon)
```

## State Management

### Data Fetching (SWR)
- **Friends**: `useSWR(/api/v1/friends)` - fetches friend list
- **Public Notes**: Manual fetch via `fetchPublicNotes(page, append)`
- **Public Templates**: Manual fetch via `fetchPublicTemplates(page, append)`

### GlobalContext Integration
- Reads `session` from `GlobalContext` for auth state and theme
- Uses `useI18n()` for translations

### NotesRefreshContext Integration
- Registers `refreshActivityFeed` callback via `registerMutate('beView-activity', ...)`
- Allows other parts of the app to trigger activity feed refresh

### Filter/Sort Props
```typescript
{
  filterProfileId?: string      // Highlight/filter by specific profile
  filterNoteId?: string         // Highlight/filter by specific note
  filterListId?: string         // Highlight/filter by specific list
  filterTemplateId?: string     // Highlight/filter by specific template
  defaultTab?: 'activity' | 'friends' | 'events' | 'spaces' | 'organizations'
}
```

## Correlations

| Related To | Relationship |
|---|---|
| **ActivityCard** | Renders each note/template in the activity feed |
| **NotesRefreshContext** | Registers refresh callback for cross-component updates |
| **GlobalContext** | Reads session for auth state |
| **ChatView** | Deep links to DMs can originate from profile cards |
| **ProfileView** | Links to user profiles from activity items |

## User Stories

1. **As a user**, I can see a feed of public notes and templates from the community
2. **As a user**, I can sort the activity feed by relevance or date
3. **As a user**, I can view and manage my friends list
4. **As a user**, I can unfriend someone from the friends tab
5. **As a user**, I can navigate to a friend's profile from the friends list
6. **As a user**, I can paginate through the activity feed with "Load More"
7. **As a user**, I can see filtered activity when arriving from a deep link (e.g., specific note/profile)
8. **As a user**, I can see highlighted items that match my current filter context
9. **As a user**, I can see event, space, and organization features are planned (disabled tabs)

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/friends` | GET | Fetch current user's friends |
| `/api/v1/notes/public?page=&limit=&sort=` | GET | Fetch public notes with pagination and sorting |
| `/api/v1/templates/public?page=&limit=` | GET | Fetch public templates with pagination |
| `/api/v1/friends/unfriend` | POST | Remove a friend |

## Loading States

- **Initial load** (`isDataLoading`): Shows `SettingsSkeleton`
- **Activity loading**: Shows skeleton grid of 6 cards
- **Empty feed**: Shows "no activity" message
- **Empty friends**: Shows call-to-action to go to Dashboard
- **Load more**: Button shows spinner during pagination

## Key Behaviors

- **URL-driven tab state**: Active tab syncs with URL path (`/be/activity`, `/be/friends`, etc.)
- **Activity feed merging**: Notes and templates are combined into a unified activity feed sorted by date
- **Filter-based prioritization**: Items matching filter params are sorted to the top and highlighted
- **Relevance sorting**: When `most_relevant` is selected, notes are sorted by `relevanceScore`
- **Refresh registration**: Other views can trigger activity feed refresh (e.g., after creating a note)
