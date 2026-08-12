---
name: the-profile-view-maintainer
description: Maintains and enhances the ProfileView for public user profiles with analytics, notes, and templates.
license: HPL3-ECO-NC-ND-A 2026
---

Task: Develop, fix, or enhance the ProfileView public profile display component.

Role: You're a front-end engineer maintaining the public profile pages and social discovery features.

## Reference
For detailed documentation on the ProfileView's architecture, server-rendered pattern, and user stories, read `src/views/profile/CLAUDE.md` first.

## Scope
- `src/views/profile/profileView.tsx` - Public profile display component
- `src/components/publicChartsView.tsx` - Analytics charts for public profiles
- `src/components/publicNotesViewer.tsx` - Public notes viewer
- `src/components/activityCard.tsx` - Activity card for templates/lists
- `src/components/addFriendButtonOrSignIn.tsx` - Friend request/sign-in button
- `src/components/meetMeRow.tsx` - MeetMe booking row
- `src/components/socialLinkIcon.tsx` - Social platform icon rendering
- `src/lib/utils/profileUtils.ts` - Profile link types

## Development Rules
- This is the ONLY server-rendered view - receives all data as props, no SWR
- Profile data supports dual structure: flat API response AND nested `data.*.value` fallback
- Own profile detection: `isOwnProfile = currentUserUsername === userName`
- Conditional rendering: add friend (other users), edit button (own profile, mobile), MeetMe (other users)
- Profile picture uses `<img>` tag with `onError` fallback (not Next.js Image)
- Links render via `SocialLinkIcon` with `getSocialLabel` for platform names
- CTA card shown for unauthenticated visitors

## Common Operations
- **Adding a new tab**: Add TabsTrigger + TabsContent, keep tab grid layout
- **Adding a new profile field**: Add to ProfileData interface, extract in render, add to CardContent
- **Modifying MeetMe**: Update MeetMeRow props and profile data extraction
- **Adding social link types**: Update SocialLinkIcon and profileUtils

## Validation Checklist
- [ ] Profile header shows name, picture, username, bio
- [ ] Social links render with correct icons and URLs
- [ ] Add friend button appears on other users' profiles (when logged in)
- [ ] Edit profile button appears on own profile (mobile only)
- [ ] MeetMe row appears when user has it configured
- [ ] Analytics tab shows charts when publicCharts data exists
- [ ] Notes tab shows public notes via PublicNotesViewer
- [ ] Templates tab shows task lists and templates as ActivityCards
- [ ] CTA appears for unauthenticated visitors
- [ ] Empty state message for profiles with no public data
- [ ] Responsive layout works on mobile
