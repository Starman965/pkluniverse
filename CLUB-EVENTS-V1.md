# Club Events V1

## Goal

Add an informational `Events` tab to the Club Hub so country clubs can promote pickleball events while continuing to use their existing external signup process, such as a QR-code registration form.

This is the crawl-stage version. V1 should not include in-app registration, payments, waitlists, team entry, box league standings, or attendance tracking.

## V1 Event Fields

Each event should support:

- Title
- Description
- Details heading, such as `What to expect`
- Bullet points
- Registration information
- Signup URL, using the same destination as the club's QR code
- Date information
- Time information
- Location information
- Cost per person
- Optional flyer/image upload
- Status: draft, published, archived

## Club Hub UI

Add a third Club Hub tab:

- `Teams`
- `Players`
- `Events`

Regular players, captains, and co-captains see published event cards only.

Club managers and the super admin see the same event list plus lightweight management tools:

- `New Event`
- Edit event
- Publish/unpublish or save draft
- Archive event

For V1, event creation/editing can live directly in the Club Hub Events tab. A separate Club Staff workspace can come later if club staff workflows grow.

## Club Manager Model

Club manager is a club-scoped role, separate from team membership.

A user can be any combination of:

- Player
- Team member
- Captain/co-captain
- Club manager
- Super admin

The super admin should automatically be treated as a club manager for every club.

Permission logic should be:

```text
canManageClub = isSuperAdmin || isClubManager(clubSlug)
```

Use the existing club admin path:

```text
clubs/{clubSlug}/admins/{uid}
```

Recommended fields on that doc:

- `uid`
- `email`
- `displayName`
- `role: "manager"`
- `addedAt`
- `addedBy`

## App Admin Requirement

Before club staff can manage events, the super admin needs a way to designate a user as a club manager for a specific club.

Add an App Admin-only workflow:

- Select a club
- Search or enter a user by email
- Add user as club manager
- Show current club managers
- Remove club manager

This belongs in the existing App Admin area because assigning club managers is a platform-level control.

## Club Manager Login And Access

Club managers may not be players, team members, captains, or team creators. They still need to log in and reach club event management without being forced through the current team-first onboarding flow.

Update the login/onboarding experience so that after sign-in:

- If the user has team memberships, keep the current team selection flow.
- If the user has club manager access but no team memberships, route them to a club manager landing view or directly to the Club Hub Events tab for their club.
- If the user is the super admin, keep access to App Admin and allow acting as a club manager for any club.
- If the user has neither team memberships nor club manager access, keep the current create/join team onboarding.

This avoids requiring club staff to create or join a team just to create and maintain club events.

## Data Model

Store events under the club:

```text
clubs/{clubSlug}/events/{eventId}
```

Suggested event document fields:

- `title`
- `description`
- `detailsHeading`
- `bulletPoints`
- `registrationInfo`
- `registrationUrl`
- `costLabel`
- `startDate`
- `endDate`
- `timeLabel`
- `locationLabel`
- `eventType`
- `flyerImagePath`
- `flyerImageUrl`
- `status`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`

Suggested `eventType` values:

- `singleDay`
- `multiDay`
- `boxLeague`

V1 can store `eventType` even if the UI does not do much with it yet.

## Storage

Store optional event flyer images under a club-scoped path:

```text
clubs/{clubSlug}/events/{eventId}/flyer/{fileName}
```

Signed-in users can read event flyer images. Club managers and the super admin can write them.

## Security Rules

Firestore rules should:

- Allow signed-in users to read published events.
- Allow club managers and the super admin to read drafts/archived events.
- Allow club managers and the super admin to create/update/archive club events.
- Keep platform admin as the only role that can add/remove club managers.

Storage rules should:

- Allow signed-in users to read event flyers.
- Allow club managers and the super admin to upload/replace event flyers.

## Later Phases

Walk/run ideas:

- In-app player signups
- Team signups where a captain brings the whole team
- Capacity limits and waitlists
- Payment tracking
- Box league standings and schedules
- Event check-in/attendance
- Dedicated Club Staff workspace
