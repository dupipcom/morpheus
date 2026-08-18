# BeView - Social Activity & Friends View

## Purpose

The BeView is the social hub of the application. It displays a combined activity feed of public notes, templates and published events (CLOSE_FRIENDS/FRIENDS events prioritized), a friends list with unfriend capability, an events browse/create/manage tab, and placeholder tabs for future social features (spaces, organizations). It serves as the primary interface for discovering and engaging with community content. Activity items (notes/templates/events) support Repost — creating a Note with references, never carrying attachments or sensitive metadata.

## Files

- `beView.tsx` - Tabbed social hub (activity | friends | events | spaces | organizations)
- `eventsView.tsx` - Events browse/create/manage view; shared by the BeView Events tab and the standalone `/be/events` page. After creating a draft it auto-switches to Mine/Org and opens the manage dialog; clicking a published card swaps the tab for the in-tab event detail
- `eventPortalDetail.tsx` - In-tab event detail: fetches the public payload by `publicUrl` and renders `EventDetailView` with a back button (the standalone `/event/[publicUrl]` page stays canonical)
- `eventDetailView.tsx` - Event detail body shared by the public page and the in-tab portal: RSVP/like, host, linked lists/projects, proximity suggestions, comments
- `publicEventView.tsx` - Public event page shell (`main` container around `EventDetailView`)
- `eventTypes.ts` - Shared `EventSummary` / `EventManage` / `EventDetailPayload` interfaces (also used by the event forms, `EventCard` and the public page)

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
│   ├── Events Tab
│   │   └── EventsView (discover/attending/mine + create form + manage dialog)
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
9. **As a user**, I can browse events (discover, going/interested, mine/org) and create new events from the Events tab
10. **As a user**, I can reach the same events experience on the standalone `/be/events` page
11. **As a user**, after creating a draft I land on Mine/Org with the manage dialog open, where I can edit the profile, add cover/flier images, and publish to the selected audience
12. **As a user**, I can manage any of my events (edit, publish, delete/cancel) from the Mine/Org tab; draft/cancelled cards open the manage dialog instead of a public page
13. **As a user**, clicking a published event card opens the event inside the events tab (back button returns to the list) while the shareable `/event/[publicUrl]` URL keeps working
14. **As a user**, I can see proximity-based event suggestions and a comments section on the event detail
15. **As a user**, I can publish an event without a cover image
16. **As a user**, I can see space and organization features are planned (disabled tabs)

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/friends` | GET | Fetch current user's friends |
| `/api/v1/notes/public?page=&limit=&sort=` | GET | Fetch public notes with pagination and sorting |
| `/api/v1/templates/public?page=&limit=` | GET | Fetch public templates with pagination |
| `/api/v1/friends/unfriend` | POST | Remove a friend |
| `/api/v1/events/public?limit=` | GET | Public events feed (Discover tab) |
| `/api/v1/events?scope=attending\|mine&limit=` | GET | Events by RSVP or ownership |
| `/api/v1/events` | POST | Create an event (via AddEventForm) |
| `/api/v1/events/{eventId}` | GET/PUT/DELETE | Manage dialog: edit (incl. cover/flier ids; null clears) / delete (draft hard, published → CANCELLED) |
| `/api/v1/events/{eventId}/publish` | POST | Publish a draft (validates name, startsAt, location-or-online, cover) |
| `/api/v1/orgs` | GET | Orgs for the create-event form |
| `/api/v1/attachments` | POST | Commit cover/flier uploads (`entityType: 'event'`) |
| `/api/v1/events/public/[publicUrl]` | GET | Enriched public payload for the in-tab portal detail |
| `/api/v1/events/public?near=lat,lng,radiusKm` | GET | Proximity suggestions on the event detail |
| `/api/v1/events/feed` | GET | Activity-feed events (PUBLISHED; priority 0 CLOSE_FRIENDS, 1 FRIENDS, 2 PUBLIC) |
| `/api/v1/events/{eventId}` | GET | Ownership probe on the event detail (200 → manage button) |
| `/api/v1/events/{eventId}/unpublish` | POST | Return to draft (manage dialog) |
| `/api/v1/comments?entityType=event&entityId=` | GET | Event comments (public) |
| `/api/v1/comments` | POST | Post an event comment (auth) |
| `/api/v1/notes` | POST | Repost: creates a Note with reference ids (content optional when references present) |
| `/api/v1/places/autocomplete` / `/places/staticmap` | GET | Venue search (create/manage forms) and location map (event detail) |

## Loading States

- **Initial load** (`isDataLoading`): Shows `SettingsSkeleton`
- **Activity loading**: Shows skeleton grid of 6 cards
- **Empty feed**: Shows "no activity" message
- **Empty friends**: Shows call-to-action to go to Dashboard
- **Load more**: Button shows spinner during pagination

## Key Behaviors

- **URL-driven tab state**: Active tab syncs with URL path (`/be/activity`, `/be/friends`, etc.)
- **Events tab renders in-place**: Selecting Events does not navigate — the embedded `EventsView` renders locally; the standalone page at `/be/events` remains for direct links
- **Create → manage deep link**: after a draft is created the view switches to Mine/Org and auto-opens the manage dialog on the new event
- **Media via the pipe**: event covers/fliers render through `/api/v1/attachments/[documentId]/file` (never the raw document id)
- **Activity feed merging**: Notes and templates are combined into a unified activity feed sorted by date
- **Filter-based prioritization**: Items matching filter params are sorted to the top and highlighted
- **Relevance sorting**: When `most_relevant` is selected, notes are sorted by `relevanceScore`
- **Refresh registration**: Other views can trigger activity feed refresh (e.g., after creating a note)
