import challengeAcceptedIcon from '../assets/activity-icons/challenge-accepted.webp';
import challengeCreatedIcon from '../assets/activity-icons/challenge-created.webp';
import challengeDeclinedIcon from '../assets/activity-icons/challenge-declined.webp';
import eventCreatedIcon from '../assets/activity-icons/event-created.webp';
import eventRegisteredIcon from '../assets/activity-icons/event-registered.webp';
import matchCompletedIcon from '../assets/activity-icons/match-completed.webp';
import matchScheduledIcon from '../assets/activity-icons/match-scheduled.webp';
import playerAddedIcon from '../assets/activity-icons/player-added.webp';
import playerJoinedTeamIcon from '../assets/activity-icons/player-joined-team.webp';
import scoreReportedIcon from '../assets/activity-icons/score-reported.webp';
import standingsUpdatedIcon from '../assets/activity-icons/standings-updated.webp';
import teamCreatedIcon from '../assets/activity-icons/team-created.webp';

export const DEMO_ACTIVITY_CLUB_NAME = 'Blackhawk Country Club';

export const ACTIVITY_ICON_BY_TYPE = {
  challenge_accepted: challengeAcceptedIcon,
  challenge_created: challengeCreatedIcon,
  challenge_declined: challengeDeclinedIcon,
  event_created: eventCreatedIcon,
  event_registered: eventRegisteredIcon,
  match_completed: matchCompletedIcon,
  match_scheduled: matchScheduledIcon,
  player_added: playerAddedIcon,
  player_joined_team: playerJoinedTeamIcon,
  score_reported: scoreReportedIcon,
  standings_updated: standingsUpdatedIcon,
  team_created: teamCreatedIcon,
};

function minutesAgo(minutes) {
  return Date.now() - minutes * 60 * 1000;
}

export const DEMO_ACTIVITY_ITEMS = [
  {
    description: 'Hawkeyes accepted a challenge from Dinks on the Rocks',
    id: 'demo-challenge-accepted',
    timestampMs: minutesAgo(18),
    type: 'challenge_accepted',
  },
  {
    description: 'Paddle Tappers moved up to #1 in the standings',
    id: 'demo-standings-updated',
    timestampMs: minutesAgo(47),
    type: 'standings_updated',
  },
  {
    description: 'Big Apple Bangers reported an 11-8 win over Chill Pickers',
    id: 'demo-score-reported',
    timestampMs: minutesAgo(82),
    type: 'score_reported',
  },
  {
    description: 'Dinks on the Rocks challenged Hawkeyes to a club match',
    id: 'demo-challenge-created',
    timestampMs: minutesAgo(145),
    type: 'challenge_created',
  },
  {
    description: 'Chill Pickers registered for Friday Night Round Robin',
    id: 'demo-event-registered',
    timestampMs: minutesAgo(230),
    type: 'event_registered',
  },
  {
    description: 'Court Kings scheduled a match against Paddle Tappers',
    id: 'demo-match-scheduled',
    timestampMs: minutesAgo(315),
    type: 'match_scheduled',
  },
  {
    description: 'Golden Pickles added Maya Chen to their roster',
    id: 'demo-player-added',
    timestampMs: minutesAgo(410),
    type: 'player_added',
  },
  {
    description: 'New club event created: Saturday Skills Clinic',
    id: 'demo-event-created',
    timestampMs: minutesAgo(540),
    type: 'event_created',
  },
];
