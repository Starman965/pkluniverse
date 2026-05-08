# Future Enhancements

Use this as a running checklist for improvements that are worth doing later, but do not need to block the current launch.

## Player Profiles

- [ ] Use the shared profile headshot as the default photo anywhere a player appears across teams or club-wide views.
  - Allow team-specific profile photos only as an intentional override if needed.
- [ ] Add a profile completeness prompt for players missing mobile, skill level, or photo.
- [ ] Consider whether players should be able to hide mobile numbers from broader club-wide views.

## Club Events

- [ ] Add a public no-login club events page that shows only published events and shareable registration links.
- [ ] Add event cancellation messaging or a cancelled status if clubs want to preserve an event record instead of deleting it.
- [ ] Add in-app event registration for individual players.
- [ ] Add team-based event registration for captains who bring an entire team.
- [ ] Add registration caps, waitlists, and roster exports for club staff.
- [ ] Add event notification emails for newly published, updated, or cancelled events.
- [ ] Consider payment collection or links once clubs decide whether registration stays external.

## Teams And Joining

- [ ] Prevent duplicate team names within the same club.
- [ ] Add a stronger server-side reservation/check for team names to avoid race conditions.
- [ ] Improve join-code recovery/help text for players who do not have their team code.
- [ ] Consider a captain invite flow that sends a join link directly by email.

## Notifications

- [ ] Add a team-created captain confirmation email path in Zapier.
- [ ] Add direct challenge notifications for captains/co-captains.
- [ ] Add scheduled match notifications for players.
- [ ] Add user notification preferences before sending higher-volume emails.
- [ ] Consider moving from Zapier to Firebase Cloud Functions if notification logic becomes complex.

## Roster And Match Management

- [ ] Improve roster builder suggestions using availability and skill level.
- [ ] Add clearer empty states for teams with no matches, no players, or no availability.
- [ ] Add better support for archived teams and historical records.
- [ ] Consider reintroducing ratings later if there is a reliable source or integration.

## Club And Directory Growth

- [ ] Bring back or expand public club/team directory sections once more clubs and teams are onboarded.
- [ ] Add richer club profile pages.
- [ ] Add filters for club, location, team status, and skill level.

## Admin And Operations

- [ ] Add admin tools for cleaning up duplicate or test teams.
- [ ] Add admin audit history for important actions.
- [ ] Add a lightweight support/contact workflow for bug reports.
- [ ] Add a checklist for production readiness before broader rollout.
