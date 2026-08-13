# ProfileView - Public Profile Display

## Purpose

The ProfileView renders a user's public profile page. It displays profile information (name, bio, picture, links), public analytics charts, public notes, and public templates/task lists. It supports friend requests, MeetMe booking, and anonymous viewing with a call-to-action for unauthenticated visitors.

## File: `profileView.tsx`

## Component Architecture

```
ProfileView
├── Profile Header Card
│   ├── Profile picture, name, username, bio
│   ├── Social links (custom + platform-specific)
│   ├── AddFriendButtonOrSignIn (for other users)
│   └── Edit Profile button (for own profile, mobile only)
├── MeetMe Booking Row (for other users, if configured)
│   └── MeetMeRow component
├── Tabs (analytics | notes | templates)
│   ├── Analytics Tab
│   │   └── PublicChartsView
│   ├── Notes Tab
│   │   └── PublicNotesViewer
│   └── Templates & Lists Tab
│       └── ActivityCard grid (templates + taskLists)
├── No public data message (if profile is empty)
└── CTA Card (for unauthenticated visitors)
```

## State Management

### Props (Server Component Pattern)
This view is server-rendered and receives all data via props:
```typescript
{
  profile: ProfileData        // Full profile data from server
  userName: string            // URL username parameter
  locale: string              // Current locale
  currentUserUsername?: string | null  // For own-profile detection
  isLoggedIn: boolean         // Auth state
  translations: any           // i18n translations object
}
```

### No Client-Side Data Fetching
ProfileView does not fetch data itself - it's a presentational component that receives all data from the page server component. This is the only view that follows this pattern (all others use `'use client'` with SWR).

### Profile Data Structure
```typescript
{
  userId?: string, firstName?, lastName?, userName?, bio?, profilePicture?
  publicCharts?: any          // Chart data for analytics tab
  links?: ProfileLink[]       // Social/custom links
  templates?: any[]           // Public templates
  taskLists?: any[]           // Public task lists
  meetMe?: {                   // Booking/availability
    preferredTime?, duration?, availability?
    startDate?, endDate?
  } | null
  data?: {                     // Nested fallback structure
    firstName?: { value?, visibility? }
    // ...
  }
}
```

## Correlations

| Related To | Relationship |
|---|---|
| **PublicChartsView** | Renders analytics in the Analytics tab |
| **PublicNotesViewer** | Renders public notes in the Notes tab |
| **ActivityCard** | Renders template and task list cards |
| **AddFriendButtonOrSignIn** | Friend request button/sign-in prompt |
| **MeetMeRow** | Scheduling/availability display |
| **SocialLinkIcon** | Renders social platform icons for links |

## User Stories

1. **As a visitor**, I can view a user's public profile information
2. **As a visitor**, I can see the user's public analytics charts
3. **As a visitor**, I can browse the user's public notes
4. **As a visitor**, I can view the user's public templates and task lists
5. **As an authenticated user**, I can send a friend request from a profile
6. **As an authenticated user**, I can schedule a meeting via MeetMe if the user has it configured
7. **As the profile owner**, I can see an edit button to navigate to profile settings
8. **As a logged-out visitor**, I see a call-to-action to create my own account

## API Endpoints Used

| Endpoint | Method | Why / How |
|---|---|---|
| (none client-side) | — | `ProfileView` is a server-rendered presentational component; it makes no `fetch`/SWR calls itself and receives all data as props. |
| `/api/v1/profile/{userName}` | GET | Server-side/public API that returns the same public profile data (filtered fields, charts, templates, task lists) that the page server component supplies to this view. |
| `/api/v1/profile/{userName}/notes` | GET | Public/relationship-filtered notes endpoint backing the Notes tab content. |

Integration details:
- The page server component resolves the username and passes `profile`, `userName`, `locale`, auth state, and translations down as props.
- Child components (`PublicChartsView`, `PublicNotesViewer`, `ActivityCard`, `AddFriendButtonOrSignIn`, `MeetMeRow`) are also presentational; friend-request and meeting interactions are handled by their own client components/endpoints.

## Loading States

This is a server-rendered view — it does not have client-side loading states. The page handles loading at the server level.

## Key Behaviors

- **Server-rendered**: Receives all data as props, no client-side fetching
- **Own profile detection**: `isOwnProfile = currentUserUsername === userName`
- **Conditional UI**: Add friend button only for other users, edit button only for own profile (mobile)
- **MeetMe**: Only shown for non-own profiles when meetMe data exists
- **CTA for unauthenticated**: Shows sign-up prompt at bottom of page when not logged in
- **Dual data structure**: Supports both flat API response and nested `data.*.value` structure
