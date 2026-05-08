# Competition Model Planning

This document captures the working direction for restructuring matches, standings, seasons, ladder play, ad hoc challenges, and event-based competition.

## Current Problem

Right now, any time a team plays another team, the app treats it as a match. Completed matches feed into ongoing standings, but those standings are effectively all-time team stats from each team's `games` collection.

That does not match how the platform needs to work long term:

- A club season should have its own standings.
- Teams should opt in to a season.
- Ladder play should affect rankings separately from season standings.
- Ad hoc matches should be tracked without necessarily affecting standings.
- Events, especially box leagues or tournaments, may need their own standings.

## Core Direction

The platform should introduce competition contexts.

A match should be tied to one optional context:

- `season`: counts toward a formal club season.
- `ladder`: affects ladder ranking.
- `event`: belongs to a specific event, box league, or tournament.
- `ad_hoc`: friendly or casual play, tracked in history but not formal standings.

Suggested future match fields:

```js
{
  matchType: 'season' | 'ladder' | 'event' | 'ad_hoc',
  competitionId: 'spring-2026',
  countsTowardStandings: true
}
```

## Seasons

The app admin should be able to create seasons for a club.

Potential path:

```text
clubs/{clubId}/seasons/{seasonId}
```

Potential season fields:

- `name`
- `status`: `draft`, `open`, `active`, `completed`
- `startDate`
- `endDate`
- `divisions`
- `scoringRules`
- `eligibleTeams`
- `optedInTeams`

Teams should opt in before they can participate in season standings.

Only season matches should count toward that season's standings.

## Ladder

Ladder should be separate from season standings.

Ladder matches could track:

- team rank before match
- team rank after match
- opponent rank before match
- opponent rank after match
- challenge/result history

Ladder play should support ongoing ranking without resetting every season unless the club chooses to reset it.

## Ad Hoc Matches

Ad hoc matches are friendly or casual matches.

They should appear in:

- team match history
- all-time records
- activity feeds

They should not automatically affect:

- active season standings
- ladder rankings
- event standings

## Events

Events currently work as informational listings with external registration links.

Long term, events may become competition containers, especially for:

- box leagues
- tournaments
- clinics with match play
- one-day round robins

Future event competition support may require:

- participants: players or teams
- event registrations
- event matches
- event standings
- brackets or groups
- event-specific scoring rules

Potential path:

```text
clubs/{clubId}/events/{eventId}/matches/{matchId}
```

or shared match records with:

```js
{
  matchType: 'event',
  competitionId: eventId
}
```

## Standings UI Direction

The standings page should eventually become tab or filter driven.

Recommended views:

- `Season`
- `Ladder`
- `Events`
- `All Time`

Default behavior:

- If an active season exists, default to active season standings.
- If no active season exists, show an empty state explaining that no season is active.
- All-time standings should remain available as history, not the default competitive view.

## Challenge And Match Creation Direction

When a captain creates a challenge or schedules a match, the app should eventually ask what type of match it is.

Possible choices:

- Season Match
- Ladder Match
- Ad Hoc Match
- Event Match

Rules:

- Season matches should only be available if both teams are opted into the active season.
- Ladder matches should update ladder ranking.
- Ad hoc matches should not affect standings.
- Event matches should be connected to a specific event.

## Suggested Implementation Phases

1. Add `matchType`, `competitionId`, and `countsTowardStandings` to challenges and games.
2. Add admin-managed seasons with team opt-in.
3. Update standings to default to active season standings instead of all-time.
4. Add ladder rankings as a separate competition mode.
5. Evolve events into competition containers for box leagues and tournament-style play.

## Open Questions

- Should a season be club-wide, division-specific, or both?
- Who can opt a team into a season: captain, club manager, or app admin?
- Should ladder rankings reset by season or continue indefinitely?
- Should all-time records include season, ladder, event, and ad hoc matches, or only selected match types?
- Should event standings support both player-based and team-based events?

