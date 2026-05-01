import { useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import TeamDivisionLabel from '../components/TeamDivisionLabel';
import { useAuth } from '../context/AuthContext';
import {
  PLAYER_AVAILABLE_DAYS,
  PLAYER_SKILL_LEVELS,
  acceptChallenge,
  addNewsComment,
  assignPlayersToTeamAsAdmin,
  buildPairingSummary,
  buildStandingsSummary,
  archiveTeam,
  backfillUserProfileFromPlayer,
  cancelChallenge,
  createClub,
  createChallenge,
  deleteClub,
  deleteChallengeAsAdmin,
  deleteGame,
  deleteNewsComment,
  deleteNewsPost,
  deleteTeamAsAdmin,
  dropTeamMember,
  declineChallenge,
  getMembership,
  getTeam,
  getUserProfileData,
  isPlatformAdmin,
  listAdminPlayers,
  listAdminTeamSummaries,
  listAdminChallenges,
  listApprovedClubTeams,
  listClubChallenges,
  listClubAffiliationRequests,
  listClubs,
  listGames,
  listNewsPosts,
  listPlayers,
  listTeamChallenges,
  listTeamMembers,
  requestClubAffiliation,
  renameClub,
  reviewClubAffiliationRequest,
  rotateTeamJoinCode,
  saveGame,
  saveGamePairings,
  saveNewsPost,
  savePlayer,
  saveUserPlayerProfile,
  setAvailability,
  toggleNewsReaction,
  updateChallenge,
  updateNewsComment,
  updateTeamLogoAsAdmin,
  updateTeamMemberRole,
  updateTeamSettings,
} from '../lib/data';
import { TEAM_DIVISION_OPTIONS, getTeamDivisionLabel, getVisibleTeamDivisionLabel, normalizeTeamDivision } from '../lib/teamDivision';
import blackhawkPickleballCourts from '../../blackhawk_pickleball_courts.webp';
import defaultTeamLogo from '../../default_team_logo.webp';

function canManageRole(role) {
  return role === 'captain' || role === 'coCaptain';
}

function isCaptainRole(role) {
  return role === 'captain';
}

function formatRecord(wins, losses, ties) {
  return `${wins}-${losses}${ties ? `-${ties}` : ''}`;
}

function createResultDraft(game) {
  return {
    matchStatus: game.matchStatus ?? 'scheduled',
    opponentScore: game.opponentScore ?? '',
    teamScore: game.teamScore ?? '',
  };
}

function buildResultDrafts(games) {
  return games.reduce((accumulator, game) => {
    accumulator[game.id] = createResultDraft(game);
    return accumulator;
  }, {});
}

function createScheduleAdminDraft(game) {
  const timeLabel = (game.timeLabel ?? '').replace(':undefined', ':00');

  return {
    dateTbd: game.dateTbd === true,
    isoDate: game.isoDate ?? '',
    location: game.location ?? '',
    matchStatus: game.matchStatus ?? 'scheduled',
    opponent: game.opponent ?? '',
    opponentScore: game.opponentScore ?? '',
    playersNeeded: game.playersNeeded ?? 8,
    teamScore: game.teamScore ?? '',
    timeLabel: game.dateTbd === true || timeLabel === 'Time TBD' ? '' : timeLabel,
  };
}

function buildScheduleAdminDrafts(games) {
  return games.reduce((accumulator, game) => {
    accumulator[game.id] = createScheduleAdminDraft(game);
    return accumulator;
  }, {});
}

function createEmptyScheduleAdminForm() {
  return {
    dateTbd: true,
    isoDate: '',
    location: '',
    matchStatus: 'scheduled',
    opponent: '',
    opponentScore: '',
    playersNeeded: 8,
    teamScore: '',
    timeLabel: '',
  };
}

function createEmptyChallengeForm() {
  return {
    dateTbd: true,
    hour: '',
    isoDate: '',
    location: '',
    minute: '00',
    notes: '',
    period: 'AM',
    playersNeeded: 8,
    targetTeamKey: '',
    visibility: 'targeted',
  };
}

function createPairingDraft(game) {
  return {
    pairings: (game?.pairings ?? []).map((pairing) => ({
      courtLabel: pairing.courtLabel,
      playerIds: [...(pairing.playerIds ?? [])],
    })),
    rosterPlayerIds: [...(game?.rosterPlayerIds ?? [])],
  };
}

function getPairingCountForRoster(rosterPlayerIds = []) {
  return Math.min(4, Math.max(1, Math.ceil(rosterPlayerIds.length / 2)));
}

function normalizeDraftPairings(pairings = [], rosterPlayerIds = []) {
  const selectedIds = new Set(rosterPlayerIds);
  const seen = new Set();

  return Array.from({ length: getPairingCountForRoster(rosterPlayerIds) }, (_, index) => {
    const sourcePairing = pairings[index] ?? {};
    const playerIds = (sourcePairing.playerIds ?? []).filter((playerId) => {
      if (!selectedIds.has(playerId) || seen.has(playerId)) {
        return false;
      }

      seen.add(playerId);
      return true;
    });

    return {
      courtLabel:
        typeof sourcePairing.courtLabel === 'string' && sourcePairing.courtLabel.trim()
          ? sourcePairing.courtLabel.trim()
          : `Court ${index + 1}`,
      playerIds: playerIds.slice(0, 2),
    };
  });
}

function normalizeDraftPairingsForMatch(pairings = [], rosterPlayerIds = [], playersNeeded = 8) {
  const selectedIds = new Set(rosterPlayerIds);
  const seen = new Set();
  const pairingCount = Math.min(
    4,
    Math.max(getPairingCountForRoster(rosterPlayerIds), Math.ceil(Math.max(1, Number(playersNeeded) || 8) / 2)),
  );

  return Array.from({ length: pairingCount }, (_, index) => {
    const sourcePairing = pairings[index] ?? {};
    const playerIds = (sourcePairing.playerIds ?? []).filter((playerId) => {
      if (!selectedIds.has(playerId) || seen.has(playerId)) {
        return false;
      }

      seen.add(playerId);
      return true;
    });

    return {
      courtLabel:
        typeof sourcePairing.courtLabel === 'string' && sourcePairing.courtLabel.trim()
          ? sourcePairing.courtLabel.trim()
          : `Court ${index + 1}`,
      playerIds: playerIds.slice(0, 2),
    };
  });
}

function buildPairingDrafts(games) {
  return games.reduce((accumulator, game) => {
    accumulator[game.id] = createPairingDraft(game);
    return accumulator;
  }, {});
}

function assignPlayerToNextOpenPairingSlot(pairings, playerId) {
  const nextPairings = pairings.map((pairing) => ({
    ...pairing,
    playerIds: [...pairing.playerIds],
  }));

  for (const pairing of nextPairings) {
    if (pairing.playerIds.length < 2) {
      pairing.playerIds = [...pairing.playerIds, playerId];
      return nextPairings;
    }
  }

  return [
    ...nextPairings,
    {
      courtLabel: `Court ${nextPairings.length + 1}`,
      playerIds: [playerId],
    },
  ].slice(0, 4);
}

function formatMatchupLabel(game) {
  return `${game.opponent || 'Opponent TBD'} · ${game.isoDate || game.dateLabel || 'Date TBD'}`;
}

function formatAttendanceStatus(status) {
  if (status === 'in') {
    return 'In';
  }

  if (status === 'out') {
    return 'Out';
  }

  return 'Unknown';
}

function getAttendanceStatus(game, playerId) {
  return game.attendance?.[playerId] ?? 'unknown';
}

function buildAvailabilitySummary(game, players) {
  return players.reduce(
    (counts, player) => {
      const status = getAttendanceStatus(game, player.id);

      if (status === 'in') {
        counts.in += 1;
      } else if (status === 'out') {
        counts.out += 1;
      } else {
        counts.unknown += 1;
      }

      return counts;
    },
    { in: 0, out: 0, unknown: 0 },
  );
}

function getAttendanceBadgeClassName(status, selected = false) {
  const classNames = ['status-badge'];

  if (status === 'in') {
    classNames.push('status-badge--active');
  } else if (status === 'out') {
    classNames.push('status-badge--inactive');
  }

  if (selected) {
    classNames.push('status-badge--selected');
  }

  return classNames.join(' ');
}

function getAvailabilityStatusMeta(status, selected = false) {
  if (status === 'in') {
    return {
      className: getAttendanceBadgeClassName('in', selected),
      label: 'In',
    };
  }

  if (status === 'out') {
    return {
      className: getAttendanceBadgeClassName('out', selected),
      label: 'Out',
    };
  }

  return {
    className: getAttendanceBadgeClassName('unknown', selected),
    label: '\u2014',
  };
}

function getAvailabilityBoardStatusMeta(status, selected = false) {
  if (status === 'in') {
    return {
      className: getAttendanceBadgeClassName('in', selected),
      label: 'Available',
    };
  }

  if (status === 'out') {
    return {
      className: getAttendanceBadgeClassName('out', selected),
      label: 'Unavailable',
    };
  }

  return {
    className: getAttendanceBadgeClassName('unknown', selected),
    label: 'No response',
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('That image file could not be read.'));
    };

    reader.onerror = () => {
      reject(new Error('That image file could not be read.'));
    };

    reader.readAsDataURL(file);
  });
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That image file could not be read.'));
    image.src = source;
  });
}

const CROPPED_IMAGE_QUALITY = 0.82;
const LOGO_CROP_OUTPUT_SIZE = 256;
const HEADSHOT_CROP_OUTPUT_SIZE = 384;
const NEWS_IMAGE_MAX_SIDE = 1200;
const NEWS_IMAGE_QUALITY = 0.82;

async function createCroppedSquareImageFile(source, cropPixels, fileName = 'image.webp', outputSize = LOGO_CROP_OUTPUT_SIZE) {
  const image = await loadImageElement(source);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('We could not prepare that cropped image.');
  }

  context.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
        return;
      }

      reject(new Error('We could not create that cropped image.'));
    }, 'image/webp', CROPPED_IMAGE_QUALITY);
  });

  return new File([blob], fileName.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
}

async function createResizedNewsImageFile(file, maxSide = NEWS_IMAGE_MAX_SIDE) {
  const source = await readFileAsDataUrl(file);
  const image = await loadImageElement(source);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('That news image could not be read.');
  }

  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('We could not prepare that news image.');
  }

  context.drawImage(image, 0, 0, outputWidth, outputHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
        return;
      }

      reject(new Error('We could not create that news image.'));
    }, 'image/webp', NEWS_IMAGE_QUALITY);
  });

  return new File([blob], (file.name || 'news-image').replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
}

function formatRoleLabel(role) {
  if (role === 'coCaptain') {
    return 'Co-captain';
  }

  if (role === 'captain') {
    return 'Captain';
  }

  return 'Member';
}

function buildPlayerInitials(fullName) {
  const parts = (fullName ?? '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return 'TM';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function countAvailableGames(games, playerId) {
  if (!playerId) {
    return 0;
  }

  return games.filter((game) => getAttendanceStatus(game, playerId) === 'in').length;
}

function countGamesPlayed(games, playerId) {
  if (!playerId) {
    return 0;
  }

  return games.filter((game) => {
    const isCompleted = game.matchStatus === 'final' || game.matchStatus === 'completed';
    const inRoster = (game.rosterPlayerIds ?? []).includes(playerId);
    const inPairings = (game.pairings ?? []).some((pairing) => (pairing.playerIds ?? []).includes(playerId));

    return isCompleted && (inRoster || inPairings);
  }).length;
}

function buildPlayerRecord(games, playerId) {
  const record = {
    losses: 0,
    ties: 0,
    wins: 0,
  };

  if (!playerId) {
    return record;
  }

  games.forEach((game) => {
    const isCompleted = game.matchStatus === 'final' || game.matchStatus === 'completed';
    const wasRostered = (game.rosterPlayerIds ?? []).includes(playerId);

    if (!isCompleted || !wasRostered) {
      return;
    }

    if (game.result === 'win') {
      record.wins += 1;
    } else if (game.result === 'loss') {
      record.losses += 1;
    } else if (game.result === 'tie') {
      record.ties += 1;
    }
  });

  return record;
}

function formatPlayerWinRate(record) {
  const gamesPlayed = record.wins + record.losses + record.ties;

  if (!gamesPlayed) {
    return '0%';
  }

  return `${Math.round((record.wins / gamesPlayed) * 100)}%`;
}

function getTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function gameBelongsInPast(game, todayDateKey) {
  if (!game?.isoDate) {
    return false;
  }

  return game.isoDate < todayDateKey;
}

function findFirstUpcomingGameIndex(games, todayDateKey) {
  const index = games.findIndex((game) => !gameBelongsInPast(game, todayDateKey));
  return index >= 0 ? index : 0;
}

function getGameRosterBadge(game, todayDateKey) {
  if (game.matchStatus === 'completed') {
    return game.result && game.result !== 'pending'
      ? String(game.result).toUpperCase()
      : 'COMPLETED';
  }

  if (!game.isoDate) {
    return 'DATE TBD';
  }

  return gameBelongsInPast(game, todayDateKey) ? 'PAST' : 'UPCOMING';
}

function buildRosterPairings(game, players) {
  return buildPairingSummary(game, players).pairings
    .filter((pairing) => pairing.players.length > 0)
    .map((pairing) => ({
      ...pairing,
      filledSlots: pairing.players.length,
    }));
}

function formatNewsPostDate(post) {
  const value = post.updatedAtMs || post.createdAtMs;

  if (!value) {
    return 'Draft';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function buildNewsPostMeta(post) {
  const value = post.updatedAtMs || post.createdAtMs;

  if (!value) {
    return 'Draft';
  }

  return `Updated ${new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))}`.toUpperCase();
}

function buildNewsExcerpt(body, maxLength = 140) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();

  if (!text) {
    return 'No body copy yet.';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
}

async function downloadNewsImage(post) {
  if (!post.imageUrl) {
    return;
  }

  try {
    const response = await fetch(post.imageUrl);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${(post.title || 'news-image').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(post.imageUrl, '_blank', 'noopener,noreferrer');
  }
}

function createEmptyNewsForm() {
  return {
    body: '',
    imageFile: null,
    linkUrl: '',
    title: '',
  };
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M4 16.5V20h3.5L18.1 9.4l-3.5-3.5L4 16.5z" />
      <path d="M16 4.5l3.5 3.5 1.2-1.2a1.3 1.3 0 0 0 0-1.8L19 3.3a1.3 1.3 0 0 0-1.8 0L16 4.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M7 8h10l-.7 12H7.7L7 8z" />
      <path d="M9 5h6l.7 1.5H20V8H4V6.5h4.3L9 5z" />
    </svg>
  );
}

function MemberStatIcon({ type }) {
  const icons = {
    games: (
      <path d="M7 3h10v3h3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6h3V3zm2 3h6V5H9v1zm-3 3v10h12V9H6zm2 2h3v3H8v-3zm5 0h3v3h-3v-3z" />
    ),
    record: (
      <path d="M7 4h10v3h3v3.2c0 2.9-2.2 5.2-5.3 5.6A4.1 4.1 0 0 1 13 17.2V20h3v2H8v-2h3v-2.8a4.1 4.1 0 0 1-1.7-1.4C6.2 15.4 4 13.1 4 10.2V7h3V4zm2 2v6.3a3 3 0 1 0 6 0V6H9zm-3 3v1.2c0 1.5.9 2.8 2.3 3.4A5.4 5.4 0 0 1 7 10V9H6zm11 1c0 1.3-.5 2.5-1.3 3.6 1.4-.6 2.3-1.9 2.3-3.4V9h-1v1z" />
    ),
    skill: (
      <path d="m12 3 2.4 5 5.5.8-4 3.9 1 5.5L12 15.6l-4.9 2.6 1-5.5-4-3.9 5.5-.8L12 3z" />
    ),
    winRate: (
      <path d="M12 4a9 9 0 0 1 9 9h-2a7 7 0 1 0-2.1 5l1.4 1.4A9 9 0 1 1 12 4zm.7 9.7-1.4-1.4 4.5-4.5 1.4 1.4-4.5 4.5zm-1.7.8a1.5 1.5 0 1 1 2 1.4 1.5 1.5 0 0 1-2-1.4z" />
    ),
  };

  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      {icons[type]}
    </svg>
  );
}

function createEmptyTeamSettingsForm(team = {}) {
  return {
    logoFile: null,
    teamDivision: team.teamDivision ?? '',
    teamName: team.name ?? '',
  };
}

function createEmptyClubForm(club = {}) {
  return {
    address: club.address ?? '',
    city: club.city ?? '',
    clubName: club.name ?? '',
    logoFile: null,
    logoPreviewUrl: '',
    numberOfCourts: club.numberOfCourts ?? '',
    state: club.state ?? '',
    zip: club.zip ?? '',
  };
}

function createEmptyPlayerCopyForm() {
  return {
    playerKeys: [],
    searchText: '',
    targetTeamKey: '',
  };
}

function createEmptyRosterForm() {
  return {
    active: true,
    availableDays: [],
    firstName: '',
    headshotFile: null,
    lastName: '',
    notes: '',
    phone: '',
    playerId: '',
    skillLevel: '',
  };
}

function createRosterFormFromPlayer(player) {
  return {
    active: player.active !== false,
    availableDays: Array.isArray(player.availableDays) ? player.availableDays : [],
    firstName: player.firstName ?? '',
    headshotFile: null,
    lastName: player.lastName ?? '',
    notes: player.notes ?? '',
    phone: player.phone ?? '',
    playerId: player.id,
    skillLevel: PLAYER_SKILL_LEVELS.includes(player.skillLevel) ? player.skillLevel : '',
  };
}

function updateAvailableDays(currentDays = [], dayId, checked) {
  const nextDays = new Set(currentDays);

  if (checked) {
    nextDays.add(dayId);
  } else {
    nextDays.delete(dayId);
  }

  return PLAYER_AVAILABLE_DAYS.filter((day) => nextDays.has(day.id)).map((day) => day.id);
}

function formatPhoneInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 10);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const TIME_PICKER_HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const TIME_PICKER_MINUTES = ['00', '15', '30', '45'];
const TIME_PICKER_PERIODS = ['AM', 'PM'];

function parseTimeLabel(timeLabel) {
  const match = String(timeLabel ?? '')
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);

  if (!match) {
    return {
      hour: '',
      minute: '00',
      period: 'AM',
    };
  }

  const hour = Number(match[1]);
  const minute = TIME_PICKER_MINUTES.includes(match[2]) ? match[2] : '00';
  const period = match[3].toUpperCase();

  return {
    hour: hour >= 1 && hour <= 12 ? String(hour) : '',
    minute,
    period: TIME_PICKER_PERIODS.includes(period) ? period : 'AM',
  };
}

function buildTimeLabel({ hour, minute, period }) {
  if (!hour) {
    return '';
  }

  return `${hour}:${minute || '00'} ${period || 'AM'}`;
}

function TimePickerField({ disabled = false, onChange, value }) {
  const timeParts = parseTimeLabel(value);

  function updateTimePart(part, nextValue) {
    onChange(
      buildTimeLabel({
        ...timeParts,
        [part]: nextValue,
      }),
    );
  }

  return (
    <div className="field">
      <span>Start time (Pacific)</span>
      <div className="time-picker">
        <select disabled={disabled} onChange={(event) => updateTimePart('hour', event.target.value)} value={timeParts.hour}>
          <option value="">Hour</option>
          {TIME_PICKER_HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
        <select
          disabled={disabled || !timeParts.hour}
          onChange={(event) => updateTimePart('minute', event.target.value)}
          value={timeParts.minute}
        >
          {TIME_PICKER_MINUTES.map((minute) => (
            <option key={minute} value={minute}>
              {minute}
            </option>
          ))}
        </select>
        <select
          disabled={disabled || !timeParts.hour}
          onChange={(event) => updateTimePart('period', event.target.value)}
          value={timeParts.period}
        >
          {TIME_PICKER_PERIODS.map((period) => (
            <option key={period} value={period}>
              {period}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function MatchupLabelField({ onChange, value }) {
  return (
    <label className="field">
      <span>Matchup label</span>
      <div className="matchup-label-input">
        <span>VS:</span>
        <input
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter Opponents name or Match Title"
          value={value}
        />
      </div>
    </label>
  );
}

const STANDINGS_DIVISIONS = [
  { label: 'Men', value: 'men' },
  { label: 'Women', value: 'women' },
  { label: 'Mixed + Unknown', value: 'mixed' },
];

function getStandingsDivision(value) {
  return normalizeTeamDivision(value) || 'mixed';
}

function getTeamStandingsStats(games) {
  const summary = buildStandingsSummary(games);
  const gamesPlayed = summary.completedGames.length;
  const pointsFor = summary.opponents.reduce((total, row) => total + row.pointsFor, 0);
  const pointsAgainst = summary.opponents.reduce((total, row) => total + row.pointsAgainst, 0);
  const pointDifferential = pointsFor - pointsAgainst;

  return {
    gamesPlayed,
    losses: summary.losses,
    pointDifferential,
    pointsAgainst,
    pointsFor,
    ties: summary.ties,
    winPct: gamesPlayed ? (summary.wins + summary.ties * 0.5) / gamesPlayed : 0,
    wins: summary.wins,
  };
}

function buildClubStandingsRow(teamSummary, games, currentTeamKey) {
  const teamKey = `${teamSummary.clubSlug}/${teamSummary.teamSlug}`;

  return {
    ...getTeamStandingsStats(games),
    clubSlug: teamSummary.clubSlug,
    division: getStandingsDivision(teamSummary.teamDivision),
    isCurrentTeam: teamKey === currentTeamKey,
    logoUrl: teamSummary.logoUrl ?? '',
    name: teamSummary.name ?? teamSummary.teamName ?? teamSummary.teamSlug,
    teamSlug: teamSummary.teamSlug,
  };
}

function sortStandingsRows(rows) {
  return [...rows].sort((left, right) => {
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }

    if (left.losses !== right.losses) {
      return left.losses - right.losses;
    }

    if (right.winPct !== left.winPct) {
      return right.winPct - left.winPct;
    }

    if (right.pointDifferential !== left.pointDifferential) {
      return right.pointDifferential - left.pointDifferential;
    }

    return left.name.localeCompare(right.name);
  });
}

function ClubStandingsBoard({ loading, rows }) {
  const rowsByDivision = STANDINGS_DIVISIONS.map((division) => ({
    ...division,
    rows: sortStandingsRows(rows.filter((row) => row.division === division.value)),
  })).filter((division) => division.rows.length > 0);

  if (loading) {
    return (
      <div className="standings-league-card">
        <div className="standings-league-card__header">
          <div>
            <p className="eyebrow">Club Standings</p>
            <h2>Building the division table...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!rowsByDivision.length) {
    return null;
  }

  return (
    <div className="standings-league-card">
      <div className="standings-league-card__header">
        <div>
          <p className="eyebrow">Club Standings</p>
          <h2>Division race</h2>
          <p>Teams are ranked by wins, then losses, win percentage, and point differential.</p>
        </div>
      </div>

      <div className="standings-division-stack">
        {rowsByDivision.map((division) => (
          <section key={division.value} className="standings-division">
            <div className="standings-division__header">
              <TeamDivisionLabel value={division.value} />
              <span>{division.rows.length} team{division.rows.length === 1 ? '' : 's'}</span>
            </div>

            <div className="standings-table" role="table" aria-label={`${division.label} standings`}>
              <div className="standings-table__row standings-table__row--head" role="row">
                <span role="columnheader">Rank</span>
                <span aria-label="Current team marker" role="columnheader" />
                <span role="columnheader">Team</span>
                <span role="columnheader">GP</span>
                <span role="columnheader">W</span>
                <span role="columnheader">L</span>
                <span role="columnheader">T</span>
                <span role="columnheader">Win %</span>
                <span role="columnheader">PF</span>
                <span role="columnheader">PA</span>
                <span role="columnheader">Diff</span>
              </div>

              {division.rows.map((row, index) => (
                <div
                  key={`${row.clubSlug}-${row.teamSlug}`}
                  className={`standings-table__row ${row.isCurrentTeam ? 'standings-table__row--current' : ''}`}
                  role="row"
                >
                  <span className="standings-table__rank" data-label="Rank" role="cell">#{index + 1}</span>
                  <span className="standings-table__marker" data-label="Marker" role="cell">
                    {row.isCurrentTeam ? <small>Your team</small> : null}
                  </span>
                  <span className="standings-table__team" data-label="Team" role="cell">
                    <img
                      alt=""
                      aria-hidden="true"
                      decoding="async"
                      loading="lazy"
                      src={row.logoUrl || defaultTeamLogo}
                    />
                    <strong>{row.name}</strong>
                  </span>
                  <span data-label="GP" role="cell">{row.gamesPlayed}</span>
                  <span data-label="W" role="cell">{row.wins}</span>
                  <span data-label="L" role="cell">{row.losses}</span>
                  <span data-label="T" role="cell">{row.ties}</span>
                  <span data-label="Win %" role="cell">{Math.round(row.winPct * 100)}%</span>
                  <span data-label="PF" role="cell">{row.pointsFor}</span>
                  <span data-label="PA" role="cell">{row.pointsAgainst}</span>
                  <span
                    className={row.pointDifferential >= 0 ? 'standings-positive' : 'standings-negative'}
                    data-label="Diff"
                    role="cell"
                  >
                    {row.pointDifferential >= 0 ? `+${row.pointDifferential}` : row.pointDifferential}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function StandingsSummary({ clubStandingsLoading = false, clubStandingsRows = [], games, team }) {
  const standings = useMemo(() => buildStandingsSummary(games), [games]);
  const totalDecisions = standings.wins + standings.losses + standings.ties;
  const pointsFor = standings.opponents.reduce((total, row) => total + row.pointsFor, 0);
  const pointsAgainst = standings.opponents.reduce((total, row) => total + row.pointsAgainst, 0);
  const pointDifferential = pointsFor - pointsAgainst;
  const winPercent = totalDecisions ? Math.round(Number(standings.winPct) * 100) : 0;
  const resultSegments = [
    { className: 'standings-record-bar__segment--wins', count: standings.wins, label: 'Wins' },
    { className: 'standings-record-bar__segment--ties', count: standings.ties, label: 'Ties' },
    { className: 'standings-record-bar__segment--losses', count: standings.losses, label: 'Losses' },
  ];

  return (
    <div className="standings-summary">
      <ClubStandingsBoard loading={clubStandingsLoading} rows={clubStandingsRows} />

      {standings.completedGames.length > 0 ? (
        <>
          <div className="standings-hero">
            <div className="standings-hero__main">
              <span className="standings-hero__label">Overall record · W-L-T</span>
              <strong>{formatRecord(standings.wins, standings.losses, standings.ties)}</strong>
              <span>{standings.completedGames.length} completed matchup{standings.completedGames.length === 1 ? '' : 's'}</span>
            </div>

            <div className="standings-metric-card standings-metric-card--win">
              <span>Win rate</span>
              <strong>{winPercent}%</strong>
            </div>

            <div className={`standings-metric-card ${pointDifferential >= 0 ? 'standings-metric-card--positive' : 'standings-metric-card--negative'}`}>
              <span>Point diff</span>
              <strong>{pointDifferential >= 0 ? `+${pointDifferential}` : pointDifferential}</strong>
            </div>
          </div>

          <div className="standings-record-card">
            <div className="standings-record-card__header">
              <div>
                <p className="eyebrow">Result mix</p>
                <h2>How the season is trending</h2>
              </div>
              <span>{pointsFor} PF · {pointsAgainst} PA</span>
            </div>

            <div className="standings-record-bar" aria-label="Win loss tie result breakdown">
              {resultSegments.map((segment) => (
                segment.count > 0 ? (
                  <span
                    key={segment.label}
                    aria-label={`${segment.label}: ${segment.count}`}
                    className={`standings-record-bar__segment ${segment.className}`}
                    style={{ width: `${(segment.count / totalDecisions) * 100}%` }}
                  />
                ) : null
              ))}
            </div>

            <div className="standings-record-card__legend">
              <span><i className="standings-dot standings-dot--wins" /> {standings.wins} wins</span>
              <span><i className="standings-dot standings-dot--ties" /> {standings.ties} ties</span>
              <span><i className="standings-dot standings-dot--losses" /> {standings.losses} losses</span>
            </div>
          </div>

          {standings.opponents.length > 0 ? (
            <div className="standings-opponents">
              <div className="standings-opponents__header">
                <p className="eyebrow">Match Results</p>
                <h2>Head-to-head matchups</h2>
              </div>
              <div className="standings-opponents__grid">
                {standings.opponents.map((row) => {
                  const rowPointDifferential = row.pointsFor - row.pointsAgainst;

                  return (
                    <div key={row.opponent} className="standings-opponent-card">
                      <div className="standings-opponent-card__header">
                        <strong>{row.opponent}</strong>
                        <span>{row.matches} matchup{row.matches === 1 ? '' : 's'}</span>
                      </div>
                      <div className="standings-scoreboard">
                        <div className="standings-scoreboard__team">
                          <img
                            alt={`${team?.name ?? 'Your team'} logo`}
                            decoding="async"
                            loading="lazy"
                            src={team?.logoUrl || defaultTeamLogo}
                          />
                          <span>{team?.name ?? 'Your team'}</span>
                        </div>
                        <div className="standings-scoreboard__score">
                          <span>Score</span>
                          <strong>{row.pointsFor}-{row.pointsAgainst}</strong>
                        </div>
                        <div className="standings-scoreboard__team standings-scoreboard__team--opponent">
                          <div className="standings-scoreboard__opponent-badge">
                            {buildPlayerInitials(row.opponent)}
                          </div>
                          <span>{row.opponent}</span>
                        </div>
                      </div>
                      <div className="standings-opponent-card__stats">
                        <span>Record: {formatRecord(row.wins, row.losses, row.ties)} W-L-T</span>
                        <span className={rowPointDifferential >= 0 ? 'standings-positive' : 'standings-negative'}>
                          Point diff: {rowPointDifferential >= 0 ? `+${rowPointDifferential}` : rowPointDifferential}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="standings-empty-card">
          <p className="eyebrow">No results yet</p>
          <h2>The scoreboard starts after your first completed match.</h2>
          <p>
            Once captains enter final scores, this page will show record, win rate, point differential, and head-to-head
            results.
          </p>
        </div>
      )}
    </div>
  );
}

export function TeamDashboardPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [membership, setMembership] = useState(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [gameCount, setGameCount] = useState(0);

  useEffect(() => {
    let ignore = false;

    Promise.all([
      getTeam(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
      listPlayers(clubSlug, teamSlug),
      listGames(clubSlug, teamSlug),
    ])
      .then(([teamData, membershipData, players, games]) => {
        if (!ignore) {
          setTeam(teamData);
          setMembership(membershipData);
          setPlayerCount(players.length);
          setGameCount(games.length);
        }
      })
      .catch(() => {
        if (!ignore) {
          setTeam(null);
          setMembership(null);
          setPlayerCount(0);
          setGameCount(0);
        }
      });

    return () => {
      ignore = true;
    };
  }, [clubSlug, teamSlug, user?.uid]);

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">
          {clubSlug} / {teamSlug}
        </p>
        <h1>{team?.name ?? 'Team dashboard'}</h1>
        <p>
          This dashboard is now reading the saved team document. It will become the summary surface
          for roster health, upcoming fixtures, standings, news, and join settings.
        </p>

        <div className="detail-grid">
          <div className="detail-card">
            <span>Role</span>
            <strong>{membership?.role ?? 'Not yet loaded'}</strong>
          </div>
          <div className="detail-card">
            <span>Join code</span>
            <strong>{team?.joinCode ?? 'Not available yet'}</strong>
          </div>
          <div className="detail-card">
            <span>Status</span>
            <strong>{team?.status ?? 'Unknown'}</strong>
          </div>
          <div className="detail-card">
            <span>Players</span>
            <strong>{playerCount}</strong>
          </div>
          <div className="detail-card">
            <span>Matchups</span>
            <strong>{gameCount}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">Next implementation step</p>
        <ul className="feature-list">
          <li>Show upcoming schedule and availability summary cards.</li>
          <li>Load team-specific news and standings snapshots.</li>
          <li>Expose captain and co-captain actions around roster and pairings.</li>
        </ul>
      </section>
    </div>
  );
}

export function HelpFeedbackPage() {
  return (
    <div className="page-grid help-page">
      <section className="card help-hero-card">
        <p className="eyebrow">Help & Feedback</p>
        <h1>PKL Universe is in beta</h1>
        <p className="help-page__lead">
          I&apos;m building this with feedback from local captains and players within the Blackhawk Country Club
          community, so questions, bugs, confusing screens, and feature ideas are welcome.
        </p>
        <p className="help-page__contact">
          Contact Dave on WhatsApp or by phone at <a href="tel:+19259806777">925-980-6777</a>, or email{' '}
          <a href="mailto:demandgendave@gmail.com">demandgendave@gmail.com</a>.
        </p>
      </section>

      <section className="help-grid">
        <article className="schedule-admin-card help-card">
          <div>
            <p className="eyebrow">Captains</p>
            <h2>When to reach out</h2>
          </div>
          <ul className="help-list">
            <li>Team setup, roster, or player invite questions</li>
            <li>Club challenges, scheduling, scores, or availability issues</li>
            <li>Club affiliation questions</li>
            <li>Ideas that would make captain work easier</li>
          </ul>
        </article>

        <article className="schedule-admin-card help-card">
          <div>
            <p className="eyebrow">Players</p>
            <h2>Good things to send</h2>
          </div>
          <ul className="help-list">
            <li>Login or join-team problems</li>
            <li>Profile, availability, or schedule questions</li>
            <li>Something that feels confusing or hard to find</li>
            <li>Bug reports or error messages</li>
          </ul>
        </article>
      </section>

      <section className="schedule-admin-card help-card help-card--wide">
        <div>
          <p className="eyebrow">Bug reports</p>
          <h2>What helps me fix things faster</h2>
        </div>
        <p>
          If something breaks, send the page you were on, what you expected to happen, what actually happened, and a
          screenshot if you have one. Short WhatsApp notes are perfect.
        </p>
      </section>
    </div>
  );
}

function formatClubTeamsClubName(clubSlug) {
  if (!clubSlug) {
    return 'your club';
  }

  return clubSlug.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildClubTeamCaptainNames(members, players) {
  const playerMap = new Map(players.map((player) => [player.id, player]));

  return members
    .filter((member) => member.role === 'captain' || member.role === 'coCaptain')
    .map((member) => playerMap.get(member.playerId)?.fullName || member.uid)
    .filter(Boolean);
}

export function ClubTeamsPage() {
  const { clubSlug, teamSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentTeam, setCurrentTeam] = useState(null);
  const [membership, setMembership] = useState(null);
  const [approvedClub, setApprovedClub] = useState(null);
  const [clubTeams, setClubTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [challengeConfirmTeam, setChallengeConfirmTeam] = useState(null);
  const [challengeNoticeTeam, setChallengeNoticeTeam] = useState(null);
  const [activeClubTab, setActiveClubTab] = useState('teams');
  const [clubPlayerSearch, setClubPlayerSearch] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadClubTeams() {
      const [teamData, membershipData] = await Promise.all([
        getTeam(clubSlug, teamSlug),
        user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
      ]);
      const approvedClubSlug = teamData?.approvedClubSlug ?? '';

      if (!teamData || teamData.affiliationStatus !== 'approved' || !approvedClubSlug || approvedClubSlug === 'independent') {
        setCurrentTeam(teamData);
        setMembership(membershipData);
        setApprovedClub(null);
        setClubTeams([]);
        return;
      }

      const [approvedTeams, clubs] = await Promise.all([
        listApprovedClubTeams(approvedClubSlug),
        listClubs().catch(() => []),
      ]);
      const enrichedTeams = await Promise.all(
        approvedTeams.map(async (clubTeam) => {
          const [members, players, games] = await Promise.all([
            listTeamMembers(clubTeam.clubSlug, clubTeam.teamSlug).catch(() => []),
            listPlayers(clubTeam.clubSlug, clubTeam.teamSlug).catch(() => []),
            listGames(clubTeam.clubSlug, clubTeam.teamSlug).catch(() => []),
          ]);

          return {
            ...clubTeam,
            captainNames: buildClubTeamCaptainNames(members, players),
            games,
            memberCount: members.length,
            members,
            players,
          };
        }),
      );

      if (!ignore) {
        setCurrentTeam(teamData);
        setMembership(membershipData);
        setApprovedClub(clubs.find((club) => club.slug === approvedClubSlug) ?? null);
        setClubTeams(enrichedTeams);
      }
    }

    setLoading(true);
    setError('');
    loadClubTeams()
      .catch((loadError) => {
        if (!ignore) {
          setCurrentTeam(null);
          setMembership(null);
          setApprovedClub(null);
          setClubTeams([]);
          setError(loadError.message ?? 'Unable to load club teams yet.');
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [clubSlug, teamSlug, user]);

  const approvedClubSlug = currentTeam?.approvedClubSlug ?? '';
  const clubName = approvedClub?.name ?? formatClubTeamsClubName(approvedClubSlug);
  const clubLogo = approvedClub?.logoUrl || currentTeam?.logoUrl || defaultTeamLogo;
  const canShowClubInformation = currentTeam?.affiliationStatus === 'approved' && approvedClubSlug && approvedClubSlug !== 'independent';
  const canChallengeClubTeams = canManageRole(membership?.role);
  const clubPlayers = useMemo(() => {
    const playersByKey = new Map();

    function getPlayerKey(player, member) {
      if (player?.uid || member?.uid) {
        return `uid:${player?.uid || member.uid}`;
      }

      if (player?.email) {
        return `email:${player.email.trim().toLowerCase()}`;
      }

      if (player?.fullName) {
        return `name:${player.fullName.trim().toLowerCase()}`;
      }

      return `member:${member?.id ?? player?.id}`;
    }

    function ensureClubPlayer({ clubTeam, member, player }) {
      const key = getPlayerKey(player, member);
      const playerName =
        player?.fullName ||
        player?.email ||
        (member?.uid === user?.uid ? user?.displayName || 'You' : '') ||
        'Pending roster link';
      const record = buildPlayerRecord(clubTeam.games ?? [], player?.id);
      const existing = playersByKey.get(key);
      const role = member?.role ?? 'member';
      const teamAffiliation = {
        logoUrl: clubTeam.logoUrl || defaultTeamLogo,
        role,
        teamName: clubTeam.name,
        teamSlug: clubTeam.teamSlug,
      };

      if (!existing) {
        playersByKey.set(key, {
          id: key,
          active: player ? player.active !== false : member?.status === 'active',
          availableCount: countAvailableGames(clubTeam.games ?? [], player?.id),
          fullName: playerName,
          gamesPlayedCount: countGamesPlayed(clubTeam.games ?? [], player?.id),
          headshotUrl: player?.headshotUrl ?? '',
          initials: buildPlayerInitials(playerName),
          record,
          roles: new Set([role]),
          skillLevel: player?.skillLevel || 'TBD',
          teamAffiliations: [teamAffiliation],
        });
        return;
      }

      existing.active = existing.active || (player ? player.active !== false : member?.status === 'active');
      existing.availableCount += countAvailableGames(clubTeam.games ?? [], player?.id);
      existing.gamesPlayedCount += countGamesPlayed(clubTeam.games ?? [], player?.id);
      existing.record = {
        losses: existing.record.losses + record.losses,
        ties: existing.record.ties + record.ties,
        wins: existing.record.wins + record.wins,
      };
      existing.roles.add(role);

      if (!existing.headshotUrl && player?.headshotUrl) {
        existing.headshotUrl = player.headshotUrl;
      }

      if (existing.skillLevel === 'TBD' && player?.skillLevel) {
        existing.skillLevel = player.skillLevel;
      }

      if (!existing.teamAffiliations.some((affiliation) => affiliation.teamSlug === teamAffiliation.teamSlug)) {
        existing.teamAffiliations.push(teamAffiliation);
      }
    }

    clubTeams.forEach((clubTeam) => {
      const memberByPlayerId = new Map(
        (clubTeam.members ?? []).filter((member) => member.playerId).map((member) => [member.playerId, member]),
      );
      const memberByUid = new Map((clubTeam.members ?? []).map((member) => [member.uid, member]));
      const representedMemberIds = new Set();

      (clubTeam.players ?? []).forEach((player) => {
        const linkedMember = memberByPlayerId.get(player.id) ?? memberByUid.get(player.uid);

        if (linkedMember?.id) {
          representedMemberIds.add(linkedMember.id);
        }

        ensureClubPlayer({ clubTeam, member: linkedMember, player });
      });

      (clubTeam.members ?? []).forEach((member) => {
        if (!representedMemberIds.has(member.id)) {
          ensureClubPlayer({ clubTeam, member, player: null });
        }
      });
    });

    return Array.from(playersByKey.values())
      .map((clubPlayer) => ({
        ...clubPlayer,
        roleLabels: Array.from(clubPlayer.roles).map(formatRoleLabel),
        winRate: formatPlayerWinRate(clubPlayer.record),
      }))
      .sort((left, right) => {
        if (left.active !== right.active) {
          return left.active ? -1 : 1;
        }

        return left.fullName.localeCompare(right.fullName);
      });
  }, [clubTeams, user?.displayName, user?.uid]);
  const filteredClubPlayers = useMemo(() => {
    const query = clubPlayerSearch.trim().toLowerCase();

    if (!query) {
      return clubPlayers;
    }

    return clubPlayers.filter((clubPlayer) => {
      const searchableText = [
        clubPlayer.fullName,
        ...clubPlayer.roleLabels,
        ...clubPlayer.teamAffiliations.flatMap((affiliation) => [
          affiliation.teamName,
          formatRoleLabel(affiliation.role),
        ]),
      ].join(' ').toLowerCase();

      return searchableText.includes(query);
    });
  }, [clubPlayerSearch, clubPlayers]);
  const clubTeamCount = clubTeams.length;
  const clubMemberCount = clubPlayers.length;

  function handleChallengeTeam(clubTeam) {
    if (!canChallengeClubTeams) {
      setChallengeNoticeTeam(clubTeam);
      return;
    }

    setChallengeConfirmTeam(clubTeam);
  }

  function startChallengeTeam(clubTeam) {
    setChallengeConfirmTeam(null);
    navigate('../challenges', {
      state: {
        challengeTargetTeamKey: `${clubTeam.clubSlug}:${clubTeam.teamSlug}`,
        challengeTargetTeamName: clubTeam.name,
      },
    });
  }

  return (
    <div className="page-grid club-teams-page">
      <section className="card">
        <div className="club-teams-page__header">
          <div className="club-teams-page__intro">
            <p className="eyebrow">Club teams</p>
            <h1>{approvedClubSlug ? `${clubName} Team Hub` : 'Club Team Hub'}</h1>
            <p className="club-teams-page__copy">
              See the other teams playing in your club network. These are the teams you can challenge.
            </p>
          </div>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {loading ? (
          <div className="state-panel">
            <p>Loading club teams...</p>
          </div>
        ) : currentTeam?.affiliationStatus !== 'approved' || !approvedClubSlug || approvedClubSlug === 'independent' ? (
          <div className="notice notice--info">
            This team is not connected to a club yet. Once it is approved for a club, the other club teams will appear here.
          </div>
        ) : clubTeams.length > 0 ? (
          <>
            {canShowClubInformation ? (
              <Link className="club-teams-page__info-card" to="../club-central">
                <img alt={`${clubName} logo`} src={clubLogo} />
                <span className="club-teams-page__info-copy">
                  <span className="eyebrow">Club Information</span>
                  <strong>{clubName}</strong>
                  <small>Open club news, court information, and pickleball program details.</small>
                  <span className="club-teams-page__info-cta">View club info</span>
                </span>
                <span className="club-teams-page__stats" aria-label="Club team stats">
                  <span>
                    <strong>{clubTeamCount}</strong>
                    <small>{clubTeamCount === 1 ? 'Team' : 'Teams'}</small>
                  </span>
                  <span>
                    <strong>{clubMemberCount}</strong>
                    <small>{clubMemberCount === 1 ? 'Player' : 'Players'}</small>
                  </span>
                </span>
              </Link>
            ) : null}

            <div className="club-teams-page__toolbar">
              <div className="club-teams-page__tabs" role="tablist" aria-label="Club hub sections">
                <button
                  aria-controls="club-hub-teams-panel"
                  aria-selected={activeClubTab === 'teams'}
                  className={activeClubTab === 'teams' ? 'club-teams-page__tab--active' : ''}
                  onClick={() => setActiveClubTab('teams')}
                  role="tab"
                  type="button"
                >
                  Teams
                </button>
                <button
                  aria-controls="club-hub-players-panel"
                  aria-selected={activeClubTab === 'players'}
                  className={activeClubTab === 'players' ? 'club-teams-page__tab--active' : ''}
                  onClick={() => setActiveClubTab('players')}
                  role="tab"
                  type="button"
                >
                  Players
                </button>
              </div>

              {activeClubTab === 'players' ? (
                <label className="club-teams-page__search">
                  <span>Search players</span>
                  <input
                    aria-label="Search club players"
                    onChange={(event) => setClubPlayerSearch(event.target.value)}
                    placeholder="Search players..."
                    type="search"
                    value={clubPlayerSearch}
                  />
                </label>
              ) : null}
            </div>

            {activeClubTab === 'teams' ? (
              <div id="club-hub-teams-panel" className="membership-list club-teams-page__list" role="tabpanel">
                {clubTeams.map((clubTeam) => {
                  const isCurrentTeam = clubTeam.clubSlug === clubSlug && clubTeam.teamSlug === teamSlug;
                  const canOpenChallengeAction = !isCurrentTeam;

                  return (
                    <article
                      key={`${clubTeam.clubSlug}-${clubTeam.teamSlug}`}
                      className={`membership-card ${isCurrentTeam ? 'membership-card--active' : ''} ${canOpenChallengeAction ? 'membership-card--actionable' : ''}`}
                      onClick={canOpenChallengeAction ? () => handleChallengeTeam(clubTeam) : undefined}
                      onKeyDown={
                        canOpenChallengeAction
                          ? (event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleChallengeTeam(clubTeam);
                              }
                            }
                          : undefined
                      }
                      role={canOpenChallengeAction ? 'button' : undefined}
                      tabIndex={canOpenChallengeAction ? 0 : undefined}
                    >
                      <img
                        alt={`${clubTeam.name} logo`}
                        className="membership-card__logo"
                        decoding="async"
                        loading="lazy"
                        src={clubTeam.logoUrl || defaultTeamLogo}
                      />
                      <div className="membership-card__content">
                        <strong>{clubTeam.name}{isCurrentTeam ? ' (your team)' : ''}</strong>
                        <span>
                          Captain: {clubTeam.captainNames?.length ? clubTeam.captainNames.join(', ') : 'TBD'}
                        </span>
                        <span>Members: {clubTeam.memberCount ?? 0}</span>
                        {getVisibleTeamDivisionLabel(clubTeam) ? (
                          <TeamDivisionLabel className="membership-card__division" value={clubTeam.teamDivision} />
                        ) : null}
                        {canOpenChallengeAction ? (
                          <span className="membership-card__action">
                            <svg className="membership-card__action-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                              <path d="M8 4h8v4.5a4 4 0 0 1-8 0V4z" />
                              <path d="M8 6H5.5a2.5 2.5 0 0 0 2.8 3.7" />
                              <path d="M16 6h2.5a2.5 2.5 0 0 1-2.8 3.7" />
                              <path d="M12 12.5V17" />
                              <path d="M8.5 20h7" />
                              <path d="M10 17h4l.8 3H9.2z" />
                            </svg>
                            Challenge team
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div id="club-hub-players-panel" className="club-teams-page__players-grid" role="tabpanel">
                {filteredClubPlayers.length > 0 ? (
                  filteredClubPlayers.map((clubPlayer) => (
                    <article key={clubPlayer.id} className="team-member-card club-player-card">
                      <div className="team-member-card__top">
                        {clubPlayer.headshotUrl ? (
                          <img
                            alt={`${clubPlayer.fullName} headshot`}
                            className="team-member-card__avatar team-member-card__avatar--photo"
                            decoding="async"
                            loading="lazy"
                            src={clubPlayer.headshotUrl}
                          />
                        ) : (
                          <div className="team-member-card__avatar">{clubPlayer.initials}</div>
                        )}
                        <div className="team-member-card__body">
                          <strong className="team-member-card__name">{clubPlayer.fullName}</strong>
                          <span className="team-member-card__subtitle">
                            {clubPlayer.teamAffiliations.map((affiliation) => affiliation.teamName).join(', ')}
                          </span>
                          <span className="club-player-card__roles">{clubPlayer.roleLabels.join(', ')}</span>
                        </div>
                      </div>

                      <div className="club-player-card__teams" aria-label={`${clubPlayer.fullName} club teams`}>
                        {clubPlayer.teamAffiliations.map((affiliation) => (
                          <span key={affiliation.teamSlug} title={`${affiliation.teamName} · ${formatRoleLabel(affiliation.role)}`}>
                            <img alt={`${affiliation.teamName} logo`} src={affiliation.logoUrl} />
                            <small>{formatRoleLabel(affiliation.role)}</small>
                          </span>
                        ))}
                      </div>

                      <div className="team-member-card__stats club-player-card__stats">
                        <span className="team-member-card__stat team-member-card__stat--record">
                          <span><MemberStatIcon type="record" /> Overall Record</span>
                          <strong>{clubPlayer.record.wins}-{clubPlayer.record.losses}-{clubPlayer.record.ties}</strong>
                        </span>
                        <span className="team-member-card__stat team-member-card__stat--win-rate">
                          <span><MemberStatIcon type="winRate" /> Win Rate</span>
                          <strong>{clubPlayer.winRate}</strong>
                        </span>
                      </div>
                    </article>
                  ))
                ) : (
                  <p>
                    {clubPlayers.length > 0
                      ? 'No players match that search.'
                      : 'No players are connected to this club yet.'}
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <p>No other approved teams are connected to this club yet.</p>
        )}
      </section>

      {challengeConfirmTeam ? (
        <div className="club-challenge-dialog" role="dialog" aria-modal="true" aria-label="Confirm team challenge">
          <button
            aria-label="Close challenge confirmation"
            className="club-challenge-dialog__backdrop"
            onClick={() => setChallengeConfirmTeam(null)}
            type="button"
          />
          <div className="club-challenge-dialog__panel">
            <p className="eyebrow">Team challenge</p>
            <h2>Challenge {challengeConfirmTeam.name}?</h2>
            <p>Start a club challenge request that the other team captain can review and respond to.</p>
            <div className="club-challenge-dialog__actions">
              <button className="button button--ghost" onClick={() => setChallengeConfirmTeam(null)} type="button">
                Cancel
              </button>
              <button className="button" onClick={() => startChallengeTeam(challengeConfirmTeam)} type="button">
                Start challenge
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {challengeNoticeTeam ? (
        <div className="club-challenge-dialog" role="dialog" aria-modal="true" aria-label="Challenge team notice">
          <button
            aria-label="Close challenge notice"
            className="club-challenge-dialog__backdrop"
            onClick={() => setChallengeNoticeTeam(null)}
            type="button"
          />
          <div className="club-challenge-dialog__panel">
            <p className="eyebrow">Team challenge</p>
            <h2>{challengeNoticeTeam.name}</h2>
            <p>Your team captain must initiate the challenge.</p>
            <button className="button" onClick={() => setChallengeNoticeTeam(null)} type="button">
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ClubCentralPage() {
  const { clubSlug, teamSlug } = useParams();
  const [team, setTeam] = useState(null);
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadClubCentral() {
      const teamData = await getTeam(clubSlug, teamSlug);
      const approvedClubSlug =
        teamData?.affiliationStatus === 'approved' && teamData?.approvedClubSlug !== 'independent'
          ? teamData.approvedClubSlug
          : '';
      const clubs = approvedClubSlug ? await listClubs().catch(() => []) : [];

      if (!ignore) {
        setTeam(teamData);
        setClub(clubs.find((clubItem) => clubItem.slug === approvedClubSlug) ?? null);
      }
    }

    setLoading(true);
    setError('');
    loadClubCentral()
      .catch((loadError) => {
        if (!ignore) {
          setTeam(null);
          setClub(null);
          setError(loadError.message ?? 'Unable to load club information yet.');
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [clubSlug, teamSlug]);

  const approvedClubSlug = team?.approvedClubSlug ?? '';
  const clubName = club?.name ?? formatClubTeamsClubName(approvedClubSlug);
  const clubLogo = club?.logoUrl || team?.logoUrl || defaultTeamLogo;
  const hasApprovedClub = team?.affiliationStatus === 'approved' && approvedClubSlug && approvedClubSlug !== 'independent';
  const cityStateZip = [club?.city, club?.state, club?.zip].filter(Boolean).join(', ');
  const hasClubDetails = Boolean(club?.address || cityStateZip || club?.numberOfCourts);

  return (
    <div className="page-grid club-central-page">
      <section className="card club-central-page__card">
        <div className="club-central-page__hero">
          <img alt={`${clubName} logo`} className="club-central-page__logo" src={clubLogo} />
          <div>
            <p className="eyebrow">Club Central</p>
            <h1>{hasApprovedClub ? clubName : 'Club Information'}</h1>
            <p>Pickleball Club News and Information</p>
          </div>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {loading ? (
          <div className="state-panel">
            <p>Loading club information...</p>
          </div>
        ) : hasApprovedClub ? (
          <div className="club-central-page__content">
            <div className="club-central-page__details-card">
              <div>
                <p className="eyebrow">Club Details</p>
                <h2>{clubName}</h2>
              </div>

              {hasClubDetails ? (
                <div className="club-central-page__details-grid">
                  {club?.address ? (
                    <div>
                      <span>Address</span>
                      <strong>{club.address}</strong>
                    </div>
                  ) : null}

                  {cityStateZip ? (
                    <div>
                      <span>Location</span>
                      <strong>{cityStateZip}</strong>
                    </div>
                  ) : null}

                  {club?.numberOfCourts ? (
                    <div>
                      <span>Courts</span>
                      <strong>{club.numberOfCourts}</strong>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p>Club profile details can be managed from App Admin.</p>
              )}
            </div>

            <div className="club-central-page__intro-card">
              <h2>Pickleball</h2>
              <p>
                The Professional Tennis Staff at Blackhawk is dedicated to providing a Pickleball program that gives
                players of all levels a positive and constructive experience that will increase their love of pickleball
                for a lifetime. Our goal is for the players to improve their game and their fitness, while making it fun
                and social for everyone.
              </p>
            </div>

            <div className="club-central-page__image-card">
              <img
                alt="Blackhawk Sports Complex Pickleball court map"
                decoding="async"
                loading="lazy"
                src={blackhawkPickleballCourts}
              />
            </div>

            <div className="club-central-page__section">
              <h3>Current Pickleball Offerings:</h3>

              <article className="club-central-page__offering">
                <h4>Introduction to Pickleball</h4>
                <p>What: Beginners</p>
                <p>Where: Sports Complex</p>
                <p>When: Check newsletter for latest courses</p>
                <p>Cost: $100 for 4 sessions ($25 per session)</p>
              </article>

              <article className="club-central-page__offering">
                <h4>Drop-In</h4>
                <p>What: All levels are welcome</p>
                <p>Where: Sports Complex</p>
                <p>When: Mondays 5:00-7:00 pm, Wednesdays 9:00-11:00 am, and Sundays 9:00-11:00 am</p>
              </article>
            </div>

            <div className="club-central-page__callout">
              <p>
                Additional Information: No prior experience necessary. Equipment will be provided for those who are new
                to the game.
              </p>
              <p>
                Registration: Registration is open to all golf, tennis, and sports complex adult members. For more info
                contact Bryn Powell at bpowell@blackhawkcc.org.
              </p>
            </div>
          </div>
        ) : (
          <div className="notice notice--info">
            This team is not connected to an approved club yet.
          </div>
        )}
      </section>
    </div>
  );
}

export function TeamMembersPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [members, setMembers] = useState([]);
  const [games, setGames] = useState([]);
  const [membership, setMembership] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let ignore = false;

    Promise.all([
      getTeam(clubSlug, teamSlug),
      listPlayers(clubSlug, teamSlug),
      listTeamMembers(clubSlug, teamSlug),
      listGames(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ])
      .then(([teamData, playerData, memberData, gameData, membershipData]) => {
        if (!ignore) {
          setTeam(teamData);
          setPlayers(playerData);
          setMembers(memberData);
          setGames(gameData);
          setMembership(membershipData);
          setError('');
        }
      })
      .catch((loadError) => {
        if (!ignore) {
          setTeam(null);
          setPlayers([]);
          setMembers([]);
          setGames([]);
          setMembership(null);
          setError(loadError.message ?? 'Unable to load the team roster yet.');
        }
      });

    return () => {
      ignore = true;
    };
  }, [clubSlug, teamSlug, user?.uid]);

  const teamCards = useMemo(() => {
    const memberByPlayerId = new Map(
      members.filter((member) => member.playerId).map((member) => [member.playerId, member]),
    );
    const memberByUid = new Map(members.map((member) => [member.uid, member]));
    const representedMemberIds = new Set();
    const entries = players.map((player) => {
      const linkedMember = memberByPlayerId.get(player.id) ?? memberByUid.get(player.uid);
      const record = buildPlayerRecord(games, player.id);

      if (linkedMember?.id) {
        representedMemberIds.add(linkedMember.id);
      }

      return {
        id: player.id,
        active: player.active !== false,
        fullName: player.fullName || 'Unnamed player',
        gamesPlayedCount: countGamesPlayed(games, player.id),
        headshotUrl: player.headshotUrl ?? '',
        initials: buildPlayerInitials(player.fullName || 'Unnamed player'),
        isPendingLink: false,
        record,
        role: linkedMember?.role ?? '',
        skillLevel: player.skillLevel || 'TBD',
        subtitle:
          linkedMember?.role && linkedMember.role !== 'member'
            ? formatRoleLabel(linkedMember.role)
            : 'Teammate',
        availableCount: countAvailableGames(games, player.id),
        winRate: formatPlayerWinRate(record),
      };
    });

    members.forEach((member) => {
      if (representedMemberIds.has(member.id)) {
        return;
      }

      entries.push({
        id: member.id,
        active: member.status === 'active',
        fullName: member.uid === user?.uid ? user?.displayName || 'You' : 'Pending roster link',
        gamesPlayedCount: 0,
        headshotUrl: '',
        initials: buildPlayerInitials(
          member.uid === user?.uid ? user?.displayName || 'You' : 'Pending roster link',
        ),
        isPendingLink: true,
        record: { losses: 0, ties: 0, wins: 0 },
        role: member.role,
        skillLevel: 'TBD',
        subtitle: member.role && member.role !== 'member' ? formatRoleLabel(member.role) : 'Account member only',
        availableCount: 0,
        winRate: '0%',
      });
    });

    return entries.sort((left, right) => {
      if (left.active !== right.active) {
        return left.active ? -1 : 1;
      }

      return left.fullName.localeCompare(right.fullName);
    });
  }, [games, members, players, user?.displayName, user?.uid]);

  const rosterPlayerCount = teamCards.filter((entry) => !entry.isPendingLink).length;
  const teamTitle = team?.name ? `The ${team.name} Team` : 'The Team';
  const inviteLink = team?.joinCode
    ? `${window.location.origin}${window.location.pathname}#/join?code=${encodeURIComponent(team.joinCode)}`
    : '';

  async function handleCopyInviteLink() {
    if (!inviteLink) {
      setError('No invite link is available yet.');
      setMessage('');
      return;
    }

    setError('');
    setMessage('');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = inviteLink;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setMessage('Invite link copied.');
    } catch (copyError) {
      setError(copyError.message ?? 'Unable to copy the invite link.');
    }
  }

  return (
    <div className="page-grid team-members-page">
      <section className="card team-members-card">
        <div className="team-members-card__header">
          <div className="team-members-card__header-copy">
            <p className="eyebrow">Current roster</p>
            <h1>{teamTitle}</h1>
            <p className="team-members-card__copy">
              Meet the {team?.name ?? 'team'} players who make up the team.
            </p>
          </div>
          <div className="team-members-card__count">{rosterPlayerCount} Members</div>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {teamCards.length > 0 ? (
          <div className="team-members-grid">
            {teamCards.map((entry) => (
              <article key={entry.id} className="team-member-card">
                <div className="team-member-card__top">
                  {entry.headshotUrl ? (
                    <img
                      alt={`${entry.fullName} headshot`}
                      className="team-member-card__avatar team-member-card__avatar--photo"
                      decoding="async"
                      loading="lazy"
                      src={entry.headshotUrl}
                    />
                  ) : (
                    <div className="team-member-card__avatar">{entry.initials}</div>
                  )}
                  <div className="team-member-card__body">
                    <strong className="team-member-card__name">{entry.fullName}</strong>
                    {entry.subtitle ? (
                      <span className="team-member-card__subtitle">
                        {entry.subtitle}
                        {entry.isPendingLink ? ' · waiting for roster link' : ''}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="team-member-card__stats">
                  <span className="team-member-card__stat team-member-card__stat--record">
                    <span><MemberStatIcon type="record" /> Record</span>
                    <strong>{entry.record.wins}-{entry.record.losses}-{entry.record.ties}</strong>
                  </span>
                  <span className="team-member-card__stat team-member-card__stat--skill">
                    <span><MemberStatIcon type="skill" /> Skill</span>
                    <strong>{entry.skillLevel}</strong>
                  </span>
                  <span className="team-member-card__stat team-member-card__stat--win-rate">
                    <span><MemberStatIcon type="winRate" /> Win Rate</span>
                    <strong>{entry.winRate}</strong>
                  </span>
                  <span className="team-member-card__stat team-member-card__stat--games">
                    <span><MemberStatIcon type="games" /> Games</span>
                    <strong>{entry.gamesPlayedCount}</strong>
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No players are on the team yet.</p>
        )}

        <div className="team-members-invite-strip">
          <p>Add other players by sharing the team join code, or the entire link.</p>
          <div className="team-members-invite-strip__details">
            <div className="team-members-invite-strip__item">
              <span>Join code</span>
              <strong>{team?.joinCode ?? 'Not available yet'}</strong>
            </div>
            <div className="team-members-invite-strip__item team-members-invite-strip__item--link">
              <span>Invite link</span>
              <code title={inviteLink || undefined}>{inviteLink || 'Not available yet'}</code>
            </div>
            <button
              className="button team-members-invite-strip__button"
              disabled={!inviteLink}
              onClick={handleCopyInviteLink}
              type="button"
            >
              Copy Invite Link
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}

export function ProfilePage() {
  const { clubSlug, teamSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [membership, setMembership] = useState(null);
  const [player, setPlayer] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [form, setForm] = useState(createEmptyRosterForm());
  const [saving, setSaving] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [headshotPreviewUrl, setHeadshotPreviewUrl] = useState('');
  const [headshotCropImageSrc, setHeadshotCropImageSrc] = useState('');
  const [headshotCropFileName, setHeadshotCropFileName] = useState('player-headshot.webp');
  const [headshotCrop, setHeadshotCrop] = useState({ x: 0, y: 0 });
  const [headshotZoom, setHeadshotZoom] = useState(1);
  const [headshotCropPixels, setHeadshotCropPixels] = useState(null);
  const [creatingHeadshotCrop, setCreatingHeadshotCrop] = useState(false);

  function replaceHeadshotPreview(nextUrl) {
    setHeadshotPreviewUrl((currentUrl) => {
      if (currentUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }

      return nextUrl;
    });
  }

  function clearHeadshotCropper() {
    setHeadshotCropImageSrc('');
    setHeadshotCropFileName('player-headshot.webp');
    setHeadshotCrop({ x: 0, y: 0 });
    setHeadshotZoom(1);
    setHeadshotCropPixels(null);
    setCreatingHeadshotCrop(false);
  }

  async function loadProfileData() {
    if (!user?.uid) {
      setMembership(null);
      setPlayer(null);
      setUserProfile(null);
      setForm(createEmptyRosterForm());
      replaceHeadshotPreview('');
      return;
    }

    const [membershipData, playerData, profileData] = await Promise.all([
      getMembership(clubSlug, teamSlug, user.uid, user),
      listPlayers(clubSlug, teamSlug),
      getUserProfileData(user.uid).catch(() => null),
    ]);
    const currentPlayer =
      playerData.find((item) => item.id === membershipData?.playerId) ??
      playerData.find((item) => item.uid === user.uid) ??
      null;
    const syncedProfile = currentPlayer
      ? await backfillUserProfileFromPlayer({ player: currentPlayer, user }).catch(() => profileData)
      : profileData;
    const formProfile = {
      ...(currentPlayer ?? {}),
      ...(syncedProfile ?? {}),
    };

    setMembership(membershipData);
    setPlayer(currentPlayer);
    setUserProfile(syncedProfile);
    setForm(currentPlayer ? createRosterFormFromPlayer(formProfile) : createEmptyRosterForm());
    replaceHeadshotPreview('');
  }

  useEffect(() => {
    setLoading(true);
    setError('');

    loadProfileData()
      .catch((loadError) => {
        setError(loadError.message ?? 'Unable to load your profile yet.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [clubSlug, teamSlug, user?.uid]);

  useEffect(
    () => () => {
      if (headshotPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(headshotPreviewUrl);
      }
    },
    [headshotPreviewUrl],
  );

  async function handleHeadshotSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for your headshot.');
      return;
    }

    try {
      const imageSrc = await readFileAsDataUrl(file);
      setHeadshotCropImageSrc(imageSrc);
      setHeadshotCropFileName(file.name || 'player-headshot.webp');
      setHeadshotCrop({ x: 0, y: 0 });
      setHeadshotZoom(1);
      setHeadshotCropPixels(null);
      setError('');
    } catch (selectionError) {
      setError(selectionError.message ?? 'Unable to read that headshot image.');
    }
  }

  async function handleApplyHeadshotCrop() {
    if (!headshotCropImageSrc || !headshotCropPixels) {
      setError('Adjust the headshot crop before applying it.');
      return;
    }

    setCreatingHeadshotCrop(true);
    setError('');

    try {
      const croppedFile = await createCroppedSquareImageFile(
        headshotCropImageSrc,
        headshotCropPixels,
        headshotCropFileName,
        HEADSHOT_CROP_OUTPUT_SIZE,
      );
      setForm((current) => ({ ...current, headshotFile: croppedFile }));
      replaceHeadshotPreview(URL.createObjectURL(croppedFile));
      clearHeadshotCropper();
      setMessage('Headshot crop ready. Save profile to publish it.');
    } catch (cropError) {
      setError(cropError.message ?? 'Unable to crop that headshot.');
    } finally {
      setCreatingHeadshotCrop(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!player) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await saveUserPlayerProfile({
        headshotFile: form.headshotFile,
        phone: form.phone,
        skillLevel: form.skillLevel,
        user,
      });
      await savePlayer({
        active: player.active !== false,
        availableDays: form.availableDays,
        clubSlug,
        notes: form.notes,
        playerId: player.id,
        teamSlug,
      });
      setMessage('Profile saved.');
      await loadProfileData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save your profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDropFromTeam() {
    if (!player || !membership) {
      return;
    }

    const confirmed = window.confirm(
      'Drop yourself from this team? This removes your roster profile and team membership.',
    );

    if (!confirmed) {
      return;
    }

    setDropping(true);
    setError('');
    setMessage('');

    try {
      await dropTeamMember({
        clubSlug,
        playerId: player.id,
        teamSlug,
        uid: user.uid,
        user,
      });
      navigate('/teams', { replace: true });
    } catch (dropError) {
      setError(dropError.message ?? 'Unable to drop you from this team.');
    } finally {
      setDropping(false);
    }
  }

  const profileName = userProfile?.fullName || player?.fullName || user?.displayName || user?.email || 'Your profile';
  const profileHeadshotUrl = userProfile?.headshotUrl || userProfile?.photoURL || player?.headshotUrl || '';
  const profileFirstName = userProfile?.firstName || player?.firstName || 'Not set';
  const profileLastName = userProfile?.lastName || player?.lastName || 'Not set';

  return (
    <div className="page-grid schedule-admin-page">
      <section className="card">
        <p className="eyebrow">Profile</p>
        <h1>Your player profile</h1>
        <p>Keep your team profile details current for captains and co-captains.</p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {!loading && !membership ? (
          <div className="notice notice--info">You are not currently a member of this team.</div>
        ) : null}

        {!loading && player ? (
          <form className="schedule-admin-form" onSubmit={handleSubmit}>
            <div className="profile-headshot-field">
              {headshotPreviewUrl || profileHeadshotUrl ? (
                <img
                  alt={`${profileName} headshot preview`}
                  className="profile-headshot-field__preview"
                  src={headshotPreviewUrl || profileHeadshotUrl}
                />
              ) : (
                <div className="profile-headshot-field__initials">
                  {buildPlayerInitials(profileName)}
                </div>
              )}
              <div className="profile-headshot-field__copy">
                <span>Profile photo</span>
                <p>Add a headshot so your roster card feels more personal. You can zoom and crop before saving.</p>
                <label className="button button--ghost profile-headshot-field__button">
                  Choose photo
                  <input accept="image/*" onChange={handleHeadshotSelection} type="file" />
                </label>
              </div>
            </div>

            <div className="player-admin-form__readonly-profile">
              <div className="player-admin-form__row">
                <div className="field">
                  <span>First name</span>
                  <div className="readonly-field">{profileFirstName}</div>
                </div>
                <div className="field">
                  <span>Last name</span>
                  <div className="readonly-field">{profileLastName}</div>
                </div>
              </div>
            </div>
            <label className="field player-admin-form__phone-field">
              <span>Mobile phone</span>
              <input
                autoComplete="tel"
                inputMode="tel"
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: formatPhoneInput(event.target.value) }))
                }
                type="tel"
                value={form.phone}
              />
            </label>
            <div className="player-admin-form__row">
              <label className="field">
                <span>Skill level</span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, skillLevel: event.target.value }))}
                  value={form.skillLevel}
                >
                  <option value="">Not set</option>
                  {PLAYER_SKILL_LEVELS.map((skillLevel) => (
                    <option key={skillLevel} value={skillLevel}>
                      {skillLevel}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="field checkbox-fieldset weekly-availability">
              <legend>My Best Days to Play (on this team)</legend>
              <div className="checkbox-grid">
                {PLAYER_AVAILABLE_DAYS.map((day) => (
                  <label
                    key={day.id}
                    className={`checkbox-option ${form.availableDays.includes(day.id) ? 'checkbox-option--selected' : ''}`}
                  >
                    <input
                      checked={form.availableDays.includes(day.id)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          availableDays: updateAvailableDays(current.availableDays, day.id, event.target.checked),
                        }))
                      }
                      type="checkbox"
                    />
                    <span>{day.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="player-admin-form__primary-actions">
              <button className="button" disabled={saving} type="submit">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              <button className="button button--danger" disabled={dropping} onClick={handleDropFromTeam} type="button">
                {dropping ? 'Dropping...' : 'Drop from Team'}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {headshotCropImageSrc ? (
        <div className="logo-cropper" role="dialog" aria-modal="true" aria-labelledby="headshot-cropper-title">
          <button
            aria-label="Close headshot cropper"
            className="logo-cropper__backdrop"
            onClick={clearHeadshotCropper}
            type="button"
          />
          <aside className="logo-cropper__panel">
            <div className="logo-cropper__header">
              <div>
                <p className="eyebrow">Crop headshot</p>
                <h2 id="headshot-cropper-title">Frame your profile photo</h2>
                <p className="logo-cropper__copy">
                  Reposition the image and zoom until your face is centered in the square preview.
                </p>
              </div>
              <button className="button button--ghost" onClick={clearHeadshotCropper} type="button">
                Cancel
              </button>
            </div>

            <div className="logo-cropper__workspace">
              <div className="logo-cropper__canvas">
                <Cropper
                  aspect={1}
                  crop={headshotCrop}
                  image={headshotCropImageSrc}
                  onCropChange={setHeadshotCrop}
                  onCropComplete={(_, croppedAreaPixels) => setHeadshotCropPixels(croppedAreaPixels)}
                  onZoomChange={setHeadshotZoom}
                  showGrid={false}
                  zoom={headshotZoom}
                />
              </div>
              <label className="field logo-cropper__zoom">
                <span>Zoom</span>
                <input
                  max="3"
                  min="1"
                  onChange={(event) => setHeadshotZoom(Number(event.target.value))}
                  step="0.05"
                  type="range"
                  value={headshotZoom}
                />
              </label>
            </div>

            <div className="schedule-admin-form__actions">
              <button className="button" disabled={creatingHeadshotCrop} onClick={handleApplyHeadshotCrop} type="button">
                {creatingHeadshotCrop ? 'Preparing crop...' : 'Use cropped headshot'}
              </button>
              <button className="button button--ghost" onClick={clearHeadshotCropper} type="button">
                Cancel
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export function RosterPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [updatingPlayerId, setUpdatingPlayerId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const canManage = canManageRole(membership?.role);
  const selectedPlayerIndex = Math.max(
    0,
    players.findIndex((player) => player.id === selectedPlayerId),
  );
  const selectedPlayer = players[selectedPlayerIndex] ?? null;

  async function loadRosterData() {
    const [playerData, membershipData] = await Promise.all([
      listPlayers(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setPlayers(playerData);
    setMembership(membershipData);
    setSelectedPlayerId((current) => {
      if (current && playerData.some((player) => player.id === current)) {
        return current;
      }

      return playerData[0]?.id ?? '';
    });
  }

  useEffect(() => {
    setLoading(true);
    setError('');

    loadRosterData()
      .catch((loadError) => {
        setError(loadError.message ?? 'Unable to load the roster yet.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [clubSlug, teamSlug, user?.uid]);

  function moveSelection(direction) {
    if (!players.length) {
      return;
    }

    const nextIndex = Math.min(Math.max(selectedPlayerIndex + direction, 0), players.length - 1);
    setSelectedPlayerId(players[nextIndex]?.id ?? '');
    setError('');
    setMessage('');
  }

  async function handleDropPlayer(player) {
    if (!player) {
      return;
    }

    const confirmed = window.confirm(`Drop ${player.fullName || 'this player'} from the team?`);

    if (!confirmed) {
      return;
    }

    setUpdatingPlayerId(player.id);
    setError('');
    setMessage('');

    try {
      await dropTeamMember({
        clubSlug,
        playerId: player.id,
        teamSlug,
        uid: player.uid ?? '',
        user,
      });
      setSelectedPlayerId('');
      setMessage('Player dropped from the team.');
      await loadRosterData();
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to drop that player right now.');
    } finally {
      setUpdatingPlayerId('');
    }
  }

  return (
    <div className="page-grid schedule-admin-page">
      <section className="card">
        <p className="eyebrow">Roster admin</p>
        <h1>Manage Players</h1>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {canManage ? (
          <>
            {players.length > 0 ? (
              <div className="game-rosters-page__pager">
                <button
                  className="choice-button"
                  disabled={selectedPlayerIndex <= 0}
                  onClick={() => moveSelection(-1)}
                  type="button"
                >
                  Previous
                </button>
                <span className="game-rosters-page__pager-label">
                  Player {selectedPlayerIndex + 1} of {players.length}
                </span>
                <button
                  className="choice-button"
                  disabled={selectedPlayerIndex >= players.length - 1}
                  onClick={() => moveSelection(1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            ) : null}

            <section className="schedule-admin-card">
              <div className="schedule-admin-card__header">
                <div>
                  <h2>{selectedPlayer?.fullName || 'No player selected'}</h2>
                  {!selectedPlayer ? <p>Share the team join code to add the first player.</p> : null}
                </div>
              </div>

              {selectedPlayer ? (
                <div className="schedule-admin-form">
                  <div className="player-admin-form__readonly-profile">
                    <div className="player-admin-form__row">
                      <div className="field">
                        <span>First name</span>
                        <div className="readonly-field">{selectedPlayer.firstName || 'Not set'}</div>
                      </div>
                      <div className="field">
                        <span>Last name</span>
                        <div className="readonly-field">{selectedPlayer.lastName || 'Not set'}</div>
                      </div>
                    </div>
                    <div className="player-admin-form__row">
                      <div className="field player-admin-form__phone-field">
                        <span>Mobile phone</span>
                        <div className="readonly-field">{selectedPlayer.phone || 'Not set'}</div>
                      </div>
                      <div className="field">
                        <span>Skill level</span>
                        <div className="readonly-field">{selectedPlayer.skillLevel || 'Not set'}</div>
                      </div>
                    </div>
                  </div>
                  <div className="player-admin-form__primary-actions">
                    <button
                      className="button button--danger"
                      disabled={updatingPlayerId === selectedPlayer.id}
                      onClick={() => handleDropPlayer(selectedPlayer)}
                      type="button"
                    >
                      {updatingPlayerId === selectedPlayer.id ? 'Dropping...' : 'Drop from Team'}
                    </button>
                  </div>
                </div>
              ) : (
                <p>No players have joined yet.</p>
              )}
            </section>
          </>
        ) : !loading ? (
          <div className="notice notice--info">
            Captains and co-captains can edit player profiles. Your current role is{' '}
            <strong>{membership?.role ?? 'member'}</strong>.
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function SchedulePage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [expandedRosterIds, setExpandedRosterIds] = useState([]);
  const [updatingGameId, setUpdatingGameId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadScheduleData() {
    const [gameData, playerData, membershipData] = await Promise.all([
      listGames(clubSlug, teamSlug),
      listPlayers(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setGames(gameData);
    setPlayers(playerData);
    setMembership(membershipData);
  }

  useEffect(() => {
    setLoading(true);
    setError('');

    loadScheduleData()
      .catch((loadError) => {
        setError(loadError.message ?? 'Unable to load matchups yet.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [clubSlug, teamSlug, user?.uid]);

  const activePlayers = useMemo(() => players.filter((player) => player.active), [players]);
  const currentPlayer = useMemo(
    () => players.find((player) => player.id === membership?.playerId) ?? null,
    [membership?.playerId, players],
  );
  const todayDateKey = useMemo(() => getTodayDateKey(), []);
  const upcomingGames = useMemo(
    () => games.filter((game) => !gameBelongsInPast(game, todayDateKey)),
    [games, todayDateKey],
  );
  const pastGames = useMemo(
    () => games.filter((game) => gameBelongsInPast(game, todayDateKey)),
    [games, todayDateKey],
  );
  const visibleGames = activeTab === 'past' ? pastGames : upcomingGames;

  async function updateAvailability(gameId, status) {
    setUpdatingGameId(gameId);
    setError('');

    try {
      await setAvailability({
        clubSlug,
        gameId,
        playerId: membership?.playerId,
        status,
        teamSlug,
        user,
      });
      await loadScheduleData();
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to update availability.');
    } finally {
      setUpdatingGameId('');
    }
  }

  function toggleRoster(gameId) {
    setExpandedRosterIds((current) =>
      current.includes(gameId) ? current.filter((id) => id !== gameId) : [...current, gameId],
    );
  }

  return (
    <div className="page-grid schedule-page">
      <section className="card">
        <div className="schedule-page__header">
          <div className="schedule-page__header-copy">
            <p className="eyebrow">Schedule</p>
            <h1>Team Matches</h1>
            <p className="schedule-page__copy">
              See match details, set your availability, and review posted rosters from one place.
            </p>
          </div>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {!loading && !membership?.playerId ? (
          <div className="notice notice--info">
            Your account is not linked to a player record for this team yet, so availability controls are disabled.
          </div>
        ) : null}

        {games.length > 0 ? (
          <div className="availability-tabs" aria-label="Schedule views">
            <button
              className={`availability-tabs__button ${activeTab === 'upcoming' ? 'availability-tabs__button--active' : ''}`}
              onClick={() => setActiveTab('upcoming')}
              type="button"
            >
              Upcoming ({upcomingGames.length})
            </button>
            <button
              className={`availability-tabs__button ${activeTab === 'past' ? 'availability-tabs__button--active' : ''}`}
              onClick={() => setActiveTab('past')}
              type="button"
            >
              Past ({pastGames.length})
            </button>
          </div>
        ) : null}

        {games.length > 0 && visibleGames.length > 0 ? (
          <div className="schedule-grid">
            {visibleGames.map((game) => {
              const availabilitySummary = buildAvailabilitySummary(game, activePlayers);
              const rosterPairings = buildRosterPairings(game, players);
              const hasRoster = rosterPairings.length > 0;
              const rosterCount = game.rosterPlayerIds?.length ?? 0;
              const playersNeeded = game.playersNeeded ?? 8;
              const expanded = expandedRosterIds.includes(game.id);
              const currentStatus = membership?.playerId ? getAttendanceStatus(game, membership.playerId) : 'unknown';
              const statusMeta = getAvailabilityBoardStatusMeta(currentStatus, true);
              const currentPlayerRostered = membership?.playerId
                ? (game.rosterPlayerIds ?? []).includes(membership.playerId)
                : false;
              const statusLabel = currentPlayerRostered
                ? 'You are rostered'
                : hasRoster
                  ? 'Roster posted'
                  : 'Roster not posted yet';

              return (
                <article key={game.id} className="schedule-match-card">
                  <div className="schedule-match-card__header">
                    <div>
                      <p className="schedule-match-card__date">
                        {game.isoDate
                          ? new Intl.DateTimeFormat('en-US', {
                              weekday: 'long',
                              month: 'short',
                              day: 'numeric',
                            })
                              .format(new Date(`${game.isoDate}T12:00:00`))
                              .toUpperCase()
                          : 'DATE TBD'}
                      </p>
                      <h2 className="schedule-match-card__title">
                        VS. {game.opponent || 'Opponent TBD'}
                      </h2>
                      <span>
                        {game.timeLabel || 'Time TBD'} {game.timeLabel ? '·' : ''} {game.location || 'TBD'}
                      </span>
                    </div>
                    <span className="game-roster-board__badge">
                      {getGameRosterBadge(game, todayDateKey)}
                    </span>
                  </div>

                  <div className="schedule-match-card__stats">
                    <span>{statusLabel}</span>
                    <span>Roster: {rosterCount} / {playersNeeded}</span>
                    <span>Available: {availabilitySummary.in}</span>
                    <span>Your status: {statusMeta.label}</span>
                  </div>

                  <div className="schedule-match-card__actions">
                    {[
                      { label: 'Available', value: 'in' },
                      { label: 'Unavailable', value: 'out' },
                      { label: 'Clear', value: 'unknown' },
                    ].map((choice) => (
                      <button
                        key={choice.value}
                        className={`choice-button ${currentStatus === choice.value ? 'choice-button--active' : ''}`}
                        disabled={!membership?.playerId || updatingGameId === game.id}
                        onClick={() => updateAvailability(game.id, choice.value)}
                        type="button"
                      >
                        {updatingGameId === game.id && currentStatus === choice.value ? 'Saving...' : choice.label}
                      </button>
                    ))}
                    {hasRoster ? (
                      <button className="choice-button" onClick={() => toggleRoster(game.id)} type="button">
                        {expanded ? 'Hide Roster' : 'Show Roster'}
                      </button>
                    ) : null}
                  </div>

                  {currentPlayer ? (
                    <p className="schedule-match-card__helper">
                      {currentPlayerRostered
                        ? `${currentPlayer.fullName || 'You'} is on the posted roster for this match.`
                        : hasRoster
                          ? `${currentPlayer.fullName || 'You'} is not currently on the posted roster.`
                          : 'Captains have not posted a roster for this match yet.'}
                    </p>
                  ) : null}

                  {expanded && hasRoster ? (
                    <div className="schedule-match-roster">
                      {rosterPairings.map((pairing) => (
                        <section key={pairing.courtLabel} className="game-roster-pair-card">
                          <div className="game-roster-pair-card__header">
                            <div className="game-roster-pair-card__title-row">
                              <strong>{pairing.courtLabel}</strong>
                              <span>{pairing.filledSlots} players assigned</span>
                            </div>
                            <span className="game-roster-pair-card__count">{pairing.filledSlots}/2</span>
                          </div>

                          <div className="game-roster-pair-card__players">
                            {pairing.players.map((player) => (
                              <article key={player.id} className="game-roster-player-card">
                                <div className="game-roster-player-card__identity">
                                  <div className="game-roster-player-card__avatar">
                                    {buildPlayerInitials(player.fullName || 'Player')}
                                  </div>
                                  <div>
                                    <strong>{player.fullName || 'Unnamed player'}</strong>
                                    <span>In {pairing.courtLabel}</span>
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : games.length === 0 ? (
          <p>No matchups saved yet.</p>
        ) : (
          <p>{activeTab === 'past' ? 'No past matchups yet.' : 'No upcoming matchups yet.'}</p>
        )}
      </section>

    </div>
  );
}

export function ScheduleScoresPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editorMode, setEditorMode] = useState('');
  const [editingGameId, setEditingGameId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(createEmptyScheduleAdminForm());
  const [teamName, setTeamName] = useState('');
  const [activeTab, setActiveTab] = useState('upcoming');

  const canManage = canManageRole(membership?.role);
  const teamScoreLabel = `${teamName || 'Team'} score`;
  const isEditorOpen = editorMode === 'add' || editorMode === 'edit';
  const isEditing = editorMode === 'edit';
  const editingGame = isEditing ? games.find((game) => game.id === editingGameId) ?? null : null;
  const todayDateKey = useMemo(() => getTodayDateKey(), []);
  const upcomingGames = useMemo(
    () => games.filter((game) => !gameBelongsInPast(game, todayDateKey)),
    [games, todayDateKey],
  );
  const pastGames = useMemo(
    () => games.filter((game) => gameBelongsInPast(game, todayDateKey)),
    [games, todayDateKey],
  );
  const visibleGames = activeTab === 'past' ? pastGames : upcomingGames;

  async function loadScheduleData() {
    const [gameData, membershipData, teamData] = await Promise.all([
      listGames(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
      getTeam(clubSlug, teamSlug),
    ]);

    setGames(gameData);
    setMembership(membershipData);
    setTeamName(teamData?.name ?? '');
  }

  useEffect(() => {
    setLoading(true);
    setError('');

    loadScheduleData()
      .catch((loadError) => {
        setError(loadError.message ?? 'Unable to load matchups yet.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [clubSlug, teamSlug, user?.uid]);

  function openAddEditor() {
    setEditorMode('add');
    setEditingGameId('');
    setForm(createEmptyScheduleAdminForm());
    setError('');
    setMessage('');
  }

  function openEditEditor(game) {
    setEditorMode('edit');
    setEditingGameId(game.id);
    setForm(createScheduleAdminDraft(game));
    setError('');
    setMessage('');
  }

  function closeEditor() {
    setEditorMode('');
    setEditingGameId('');
    setForm(createEmptyScheduleAdminForm());
  }

  async function handleEditorSubmit(event) {
    event.preventDefault();

    if (isEditing && !editingGame) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await saveGame({
        ...form,
        clubSlug,
        gameId: isEditing ? editingGame.id : undefined,
        teamSlug,
        user,
      });
      setMessage(isEditing ? 'Matchup updated.' : 'Matchup added to the schedule.');
      closeEditor();
      await loadScheduleData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save that matchup.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGame() {
    if (!editingGame) {
      return;
    }

    const isChallengeMatch = editingGame.source === 'challenge';
    const hasChallengeResult =
      editingGame.matchStatus === 'completed' || editingGame.teamScore !== null || editingGame.opponentScore !== null;

    if (isChallengeMatch && hasChallengeResult) {
      setError('Completed challenge matches cannot be deleted. Contact the app admin if this result needs correction.');
      return;
    }

    if (
      isChallengeMatch &&
      !window.confirm(
        "This accepted challenge match will be removed from both teams' schedules, including availability and roster assignments. Continue?",
      )
    ) {
      return;
    }

    setDeleting(true);
    setError('');
    setMessage('');

    try {
      await deleteGame({
        clubSlug,
        gameId: editingGame.id,
        teamSlug,
        user,
      });
      setMessage(isChallengeMatch ? 'Challenge match removed from both team schedules.' : 'Matchup deleted.');
      setForm(createEmptyScheduleAdminForm());
      closeEditor();
      await loadScheduleData();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Unable to delete that matchup.');
    } finally {
      setDeleting(false);
    }
  }

  function getMatchDateBadge(game) {
    if (game.dateTbd) {
      return {
        day: 'TBD',
        month: 'Date',
        weekday: '',
      };
    }

    if (!game.isoDate) {
      return {
        day: 'TBD',
        month: 'Date',
        weekday: '',
      };
    }

    const date = new Date(`${game.isoDate}T12:00:00`);

    return {
      day: new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(date),
      month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date),
      weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
    };
  }

  return (
    <div className="page-grid schedule-admin-page">
      <section className="card">
        <p className="eyebrow">Match admin</p>
        <h1>Manage Matches</h1>
        <p>Add matches, enter scores, and update your team schedule.</p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {loading ? (
          <p>Loading matchups...</p>
        ) : !canManage ? (
          <div className="notice notice--info">
            Captains and co-captains manage the schedule. Your current role is{' '}
            <strong>{membership?.role ?? 'member'}</strong>.
          </div>
        ) : canManage ? (
          <>
            {isEditorOpen ? (
              <section className="schedule-admin-card schedule-admin-card--editor">
                <div className="schedule-admin-card__header">
                  <div>
                    <h2>{isEditing ? `Edit ${editingGame?.opponent || 'match'}` : 'Enter Match'}</h2>
                    <p>
                      {isEditing
                        ? 'Update match details and scores.'
                        : 'Add a match to your team schedule.'}
                    </p>
                  </div>
                  {isEditing && form.timeLabel ? (
                    <span className="game-roster-board__badge">{form.timeLabel}</span>
                  ) : null}
                </div>

                <form className="schedule-admin-form schedule-admin-form--compact" onSubmit={handleEditorSubmit}>
                  <div className="schedule-admin-form__main-fields">
                    <MatchupLabelField
                      onChange={(nextOpponent) => setForm((current) => ({ ...current, opponent: nextOpponent }))}
                      value={form.opponent}
                    />
                    <label className="field">
                      <span>Location / Court(s)</span>
                      <input
                        onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                        placeholder="Optional, e.g. Blackhawk CC Courts 1-4 or TBD"
                        value={form.location}
                      />
                    </label>
                  </div>
                  <label className="checkbox-field schedule-admin-form__tbd">
                    <input
                      checked={form.dateTbd}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          dateTbd: event.target.checked,
                          isoDate: event.target.checked ? '' : current.isoDate,
                          timeLabel: event.target.checked ? '' : current.timeLabel,
                        }))
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>Date and time TBD</strong>
                      <small>Leave checked until the match date is confirmed.</small>
                    </span>
                  </label>
                  <div className="schedule-admin-form__datetime-row">
                    <label className="field schedule-admin-form__date-field">
                      <span>Game date</span>
                      <input
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            dateTbd: event.target.value ? false : current.dateTbd,
                            isoDate: event.target.value,
                          }))
                        }
                        type="date"
                        value={form.isoDate}
                      />
                    </label>
                    <TimePickerField
                      disabled={form.dateTbd}
                      onChange={(nextTimeLabel) => setForm((current) => ({ ...current, timeLabel: nextTimeLabel }))}
                      value={form.timeLabel}
                    />
                    <label className="field schedule-admin-form__players-needed-field">
                      <span>Players needed</span>
                      <select
                        onChange={(event) =>
                          setForm((current) => ({ ...current, playersNeeded: Number(event.target.value) }))
                        }
                        value={form.playersNeeded}
                      >
                        {[1, 2, 4, 6, 8].map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="schedule-admin-form__status-score-row">
                    <label className="field schedule-admin-form__status-field">
                      <span>Match status</span>
                      <select
                        onChange={(event) => setForm((current) => ({ ...current, matchStatus: event.target.value }))}
                        value={form.matchStatus}
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                      </select>
                    </label>
                    <div className="schedule-admin-form__score-grid">
                      <label className="field">
                        <span>{teamScoreLabel}</span>
                        <input
                          inputMode="numeric"
                          onChange={(event) => setForm((current) => ({ ...current, teamScore: event.target.value }))}
                          value={form.teamScore}
                        />
                      </label>
                      <label className="field">
                        <span>Opponent score</span>
                        <input
                          inputMode="numeric"
                          onChange={(event) =>
                            setForm((current) => ({ ...current, opponentScore: event.target.value }))
                          }
                          value={form.opponentScore}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="schedule-admin-form__actions">
                    <button className="button" disabled={saving} type="submit">
                      {saving ? 'Saving...' : isEditing ? 'Save Match' : 'Enter Match'}
                    </button>
                    <button className="button button--ghost" onClick={closeEditor} type="button">
                      Cancel
                    </button>
                    {isEditing ? (
                      <button
                        className="button button--danger"
                        disabled={deleting}
                        onClick={handleDeleteGame}
                        type="button"
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                    ) : null}
                  </div>
                </form>
              </section>
            ) : null}

            {games.length > 0 ? (
              <>
                <div className="schedule-admin-list-controls">
                  <div className="availability-tabs" aria-label="Schedule admin views">
                    <button
                      className={`availability-tabs__button ${activeTab === 'upcoming' ? 'availability-tabs__button--active' : ''}`}
                      onClick={() => setActiveTab('upcoming')}
                      type="button"
                    >
                      Upcoming ({upcomingGames.length})
                    </button>
                    <button
                      className={`availability-tabs__button ${activeTab === 'past' ? 'availability-tabs__button--active' : ''}`}
                      onClick={() => setActiveTab('past')}
                      type="button"
                    >
                      Past ({pastGames.length})
                    </button>
                  </div>
                  <button className="button" onClick={openAddEditor} type="button">
                    Add Match
                  </button>
                </div>

                {visibleGames.length > 0 ? (
                  <div className="schedule-admin-match-grid">
                    {visibleGames.map((game) => {
                      const hasScore = game.teamScore !== null || game.opponentScore !== null;
                      const dateBadge = getMatchDateBadge(game);

                      return (
                        <article key={game.id} className="schedule-match-card schedule-admin-match-card">
                          <div className="schedule-match-card__date-badge" aria-label={game.dateLabel || 'Date TBD'}>
                            <span>{dateBadge.month}</span>
                            <strong>{dateBadge.day}</strong>
                            {dateBadge.weekday ? <small>{dateBadge.weekday}</small> : null}
                          </div>
                          <div className="schedule-match-card__content">
                            <h2 className="schedule-match-card__title">
                              VS. {game.opponent || 'Opponent TBD'}
                            </h2>
                            <span>
                              {game.timeLabel || 'Time TBD'} {game.timeLabel ? '·' : ''}{' '}
                              {game.location || 'Location TBD'}
                            </span>
                            <div className="schedule-match-card__stats">
                              <span>Status: {game.matchStatus === 'completed' ? 'Completed' : 'Scheduled'}</span>
                              <span>{game.playersNeeded ?? 8} Players</span>
                              <span>
                                {hasScore
                                  ? `${teamName || 'Team'} ${game.teamScore ?? '-'} · Opponent ${game.opponentScore ?? '-'}`
                                  : 'Score not entered'}
                              </span>
                            </div>
                            <div className="schedule-admin-match-card__actions">
                              <button
                                className="choice-button"
                                onClick={() => openEditEditor(game)}
                                type="button"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p>{activeTab === 'past' ? 'No past matches yet.' : 'No upcoming matches yet.'}</p>
                )}
              </>
            ) : (
              <div className="schedule-admin-empty">
                <p>No matches yet.</p>
                <button className="button" onClick={openAddEditor} type="button">
                  Add Match
                </button>
              </div>
            )}
          </>
        ) : (
          <p>No matchups saved yet.</p>
        )}
      </section>
    </div>
  );
}
export function StandingsPage() {
  const { clubSlug, teamSlug } = useParams();
  const [clubStandingsLoading, setClubStandingsLoading] = useState(true);
  const [clubStandingsRows, setClubStandingsRows] = useState([]);
  const [games, setGames] = useState([]);
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    setClubStandingsLoading(true);
    setError('');

    Promise.all([
      listGames(clubSlug, teamSlug),
      getTeam(clubSlug, teamSlug),
    ])
      .then(async ([gameData, teamData]) => {
        if (cancelled) {
          return;
        }

        setGames(gameData);
        setTeam(teamData);

        const approvedClubSlug =
          teamData?.affiliationStatus === 'approved' && teamData?.approvedClubSlug !== 'independent'
            ? teamData.approvedClubSlug
            : '';

        const clubTeams = approvedClubSlug
          ? await listApprovedClubTeams(approvedClubSlug)
          : [
              {
                clubSlug,
                logoUrl: teamData?.logoUrl ?? '',
                name: teamData?.name ?? teamSlug,
                teamDivision: teamData?.teamDivision ?? '',
                teamSlug,
              },
            ];

        if (cancelled) {
          return;
        }

        const currentTeamKey = `${clubSlug}/${teamSlug}`;
        const teamsForStandings = clubTeams.some(
          (clubTeam) => clubTeam.clubSlug === clubSlug && clubTeam.teamSlug === teamSlug,
        )
          ? clubTeams
          : [
              ...clubTeams,
              {
                clubSlug,
                logoUrl: teamData?.logoUrl ?? '',
                name: teamData?.name ?? teamSlug,
                teamDivision: teamData?.teamDivision ?? '',
                teamSlug,
              },
            ];

        const rows = await Promise.all(
          teamsForStandings.map(async (clubTeam) => {
            const teamGames =
              clubTeam.clubSlug === clubSlug && clubTeam.teamSlug === teamSlug
                ? gameData
                : await listGames(clubTeam.clubSlug, clubTeam.teamSlug);

            return buildClubStandingsRow(clubTeam, teamGames, currentTeamKey);
          }),
        );

        if (!cancelled) {
          setClubStandingsRows(rows);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError.message ?? 'Unable to load standings yet.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setClubStandingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clubSlug, teamSlug]);

  return (
    <div className="page-grid standings-page">
      <section className="card standings-page__card">
        <div className="standings-page__header">
          <div>
            <p className="eyebrow">Standings</p>
            <h1>Pickleball Team Standings</h1>
            <p className="standings-page__copy">
              See how your team ranks by division, with wins, losses, ties, scoring edge, and head-to-head results.
            </p>
          </div>
          <img
            alt={`${team?.name ?? 'Team'} logo`}
            className="standings-page__logo"
            src={team?.logoUrl || defaultTeamLogo}
          />
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}
        <StandingsSummary
          clubStandingsLoading={clubStandingsLoading}
          clubStandingsRows={clubStandingsRows}
          games={games}
          team={team}
        />
      </section>
    </div>
  );
}

export function GameRostersPage() {
  const { clubSlug, teamSlug } = useParams();
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [error, setError] = useState('');

  const todayDateKey = useMemo(() => getTodayDateKey(), []);

  useEffect(() => {
    Promise.all([listGames(clubSlug, teamSlug), listPlayers(clubSlug, teamSlug)])
      .then(([gameData, playerData]) => {
        setGames(gameData);
        setPlayers(playerData);
        setSelectedGameId((current) => {
          if (current && gameData.some((game) => game.id === current)) {
            return current;
          }

          return gameData[findFirstUpcomingGameIndex(gameData, todayDateKey)]?.id ?? '';
        });
      })
      .catch((loadError) => {
        setError(loadError.message ?? 'Unable to load game rosters yet.');
      });
  }, [clubSlug, teamSlug, todayDateKey]);

  const selectedGameIndex = Math.max(
    0,
    games.findIndex((game) => game.id === selectedGameId),
  );
  const activeGame = games[selectedGameIndex] ?? null;
  const rosterPairings = useMemo(
    () => (activeGame ? buildRosterPairings(activeGame, players) : []),
    [activeGame, players],
  );

  function moveSelection(direction) {
    if (!games.length) {
      return;
    }

    const nextIndex = Math.min(Math.max(selectedGameIndex + direction, 0), games.length - 1);
    setSelectedGameId(games[nextIndex]?.id ?? '');
  }

  return (
    <div className="page-grid game-rosters-page">
      <section className="card">
        <div className="game-rosters-page__header">
          <div className="game-rosters-page__header-copy">
            <p className="eyebrow">Team view</p>
            <h1>Game Rosters</h1>
            <p className="game-rosters-page__copy">
              See the saved pairings for each matchup and review who is assigned to each court.
            </p>
          </div>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {games.length > 0 ? (
          <div className="game-rosters-page__pager">
            <button
              className="choice-button"
              disabled={selectedGameIndex <= 0}
              onClick={() => moveSelection(-1)}
              type="button"
            >
              Previous
            </button>
            <span className="game-rosters-page__pager-label">
              Matchup {selectedGameIndex + 1} of {games.length}
            </span>
            <button
              className="choice-button"
              disabled={selectedGameIndex >= games.length - 1}
              onClick={() => moveSelection(1)}
              type="button"
            >
              Next
            </button>
          </div>
        ) : null}

        {activeGame ? (
          <article className="game-roster-board">
            <div className="game-roster-board__header">
              <div>
                <p className="game-roster-board__date">
                  {activeGame.isoDate
                    ? new Intl.DateTimeFormat('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })
                        .format(new Date(`${activeGame.isoDate}T12:00:00`))
                        .toUpperCase()
                    : 'DATE TBD'}
                </p>
                <h2 className="game-roster-board__title">VS. {activeGame.opponent || 'Opponent TBD'}</h2>
                <p className="game-roster-board__meta">
                  {activeGame.timeLabel || 'Time TBD'} {activeGame.timeLabel ? '·' : ''}{' '}
                  {activeGame.location || 'TBD'}
                </p>
              </div>
              <span className="game-roster-board__badge">
                {getGameRosterBadge(activeGame, todayDateKey)}
              </span>
            </div>

            {rosterPairings.length > 0 ? (
              <div className="game-roster-board__pairs">
                {rosterPairings.map((pairing) => (
                  <section key={pairing.courtLabel} className="game-roster-pair-card">
                    <div className="game-roster-pair-card__header">
                      <div className="game-roster-pair-card__title-row">
                        <strong>{pairing.courtLabel}</strong>
                        <span>{pairing.filledSlots} players assigned</span>
                      </div>
                      <span className="game-roster-pair-card__count">{pairing.filledSlots}/2</span>
                    </div>

                    <div className="game-roster-pair-card__players">
                      {pairing.players.map((player) => (
                        <article key={player.id} className="game-roster-player-card">
                          <div className="game-roster-player-card__identity">
                            <div className="game-roster-player-card__avatar">
                              {buildPlayerInitials(player.fullName || 'Player')}
                            </div>
                            <div>
                              <strong>{player.fullName || 'Unnamed player'}</strong>
                              <span>In {pairing.courtLabel}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="sidebar__empty">No players assigned yet.</p>
            )}
          </article>
        ) : (
          <p>No matchups are available for game rosters yet.</p>
        )}
      </section>
    </div>
  );
}

export function RosterMgmtPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [pairingDrafts, setPairingDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canManage = canManageRole(membership?.role);
  const activePlayers = useMemo(() => players.filter((player) => player.active), [players]);
  const activePlayerIds = useMemo(() => new Set(activePlayers.map((player) => player.id)), [activePlayers]);
  const todayDateKey = useMemo(() => getTodayDateKey(), []);

  async function loadPairingsData() {
    const [gameData, playerData, membershipData] = await Promise.all([
      listGames(clubSlug, teamSlug),
      listPlayers(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);
    const upcomingGameData = gameData.filter((game) => !gameBelongsInPast(game, todayDateKey));

    setGames(upcomingGameData);
    setPlayers(playerData);
    setMembership(membershipData);
    setPairingDrafts(buildPairingDrafts(upcomingGameData));
    setSelectedGameId((current) => {
      if (current && upcomingGameData.some((game) => game.id === current)) {
        return current;
      }

      return upcomingGameData[0]?.id ?? '';
    });
  }

  useEffect(() => {
    loadPairingsData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load matchup pairings yet.');
    });
  }, [clubSlug, teamSlug, todayDateKey, user?.uid]);

  const activeGame = games.find((game) => game.id === selectedGameId) ?? games[0] ?? null;
  const playersNeeded = activeGame?.playersNeeded ?? 8;
  const availablePlayers = useMemo(
    () => activePlayers.filter((player) => activeGame?.attendance?.[player.id] === 'in'),
    [activeGame, activePlayers],
  );
  const availablePlayerIds = useMemo(
    () => new Set(availablePlayers.map((player) => player.id)),
    [availablePlayers],
  );
  const activeDraft = activeGame
    ? pairingDrafts[activeGame.id] ?? createPairingDraft(activeGame)
    : null;

  useEffect(() => {
    if (!activeGame) {
      return;
    }

    setPairingDrafts((current) => {
      const draft = current[activeGame.id] ?? createPairingDraft(activeGame);
      const rosterPlayerIds = draft.rosterPlayerIds.filter((playerId) => activePlayerIds.has(playerId));
      const pairings = normalizeDraftPairingsForMatch(draft.pairings, rosterPlayerIds, playersNeeded);

      if (
        rosterPlayerIds.length === draft.rosterPlayerIds.length &&
        JSON.stringify(pairings) === JSON.stringify(draft.pairings)
      ) {
        return current;
      }

      return {
        ...current,
        [activeGame.id]: {
          ...draft,
          pairings,
          rosterPlayerIds,
        },
      };
    });
  }, [activeGame, activePlayerIds, playersNeeded]);

  const pairingSummary = useMemo(() => {
    if (!activeGame || !activeDraft) {
      return {
        pairings: [],
        selectedPlayers: [],
      };
    }

    return buildPairingSummary(
      {
        ...activeGame,
        pairings: activeDraft.pairings,
        rosterPlayerIds: activeDraft.rosterPlayerIds,
      },
      players,
    );
  }, [activeDraft, activeGame, players]);
  const visiblePairings = useMemo(
    () =>
      activeDraft ? normalizeDraftPairingsForMatch(activeDraft.pairings, activeDraft.rosterPlayerIds, playersNeeded) : [],
    [activeDraft, playersNeeded],
  );

  function updateDraft(updater) {
    if (!activeGame) {
      return;
    }

    setPairingDrafts((current) => ({
      ...current,
      [activeGame.id]: updater(current[activeGame.id] ?? createPairingDraft(activeGame)),
    }));
  }

  function toggleRosterPlayer(playerId) {
    if (!availablePlayerIds.has(playerId)) {
      setError('Only players marked Available for this matchup can be added to the roster.');
      return;
    }

    updateDraft((draft) => {
      const exists = draft.rosterPlayerIds.includes(playerId);

      if (!exists && draft.rosterPlayerIds.length >= playersNeeded) {
        setError(`Choose up to ${playersNeeded} players for this match roster.`);
        return draft;
      }

      const rosterPlayerIds = exists
        ? draft.rosterPlayerIds.filter((id) => id !== playerId)
        : [...draft.rosterPlayerIds, playerId];
      const selectedIds = new Set(rosterPlayerIds);
      let pairings = normalizeDraftPairings(draft.pairings, rosterPlayerIds).map((pairing) => ({
        ...pairing,
        playerIds: pairing.playerIds.filter((id) => selectedIds.has(id)),
      }));

      if (!exists) {
        pairings = assignPlayerToNextOpenPairingSlot(pairings, playerId);
      }

      setError('');
      return {
        ...draft,
        pairings: normalizeDraftPairings(pairings, rosterPlayerIds),
        rosterPlayerIds,
      };
    });
  }

  function updatePairingSlot(pairIndex, slotIndex, playerId) {
    updateDraft((draft) => {
      const nextPairings = normalizeDraftPairingsForMatch(draft.pairings, draft.rosterPlayerIds, playersNeeded).map((pairing) => ({
        ...pairing,
        playerIds: [...pairing.playerIds],
      }));
      const previousPlayerId = nextPairings[pairIndex]?.playerIds?.[slotIndex] ?? '';

      nextPairings.forEach((pairing) => {
        pairing.playerIds = pairing.playerIds.filter((id) => id !== playerId);
      });

      const nextPlayerIds = [...(nextPairings[pairIndex]?.playerIds ?? [])];

      while (nextPlayerIds.length < 2) {
        nextPlayerIds.push('');
      }

      nextPlayerIds[slotIndex] = playerId;
      nextPairings[pairIndex] = {
        ...nextPairings[pairIndex],
        playerIds: nextPlayerIds.filter(Boolean).slice(0, 2),
      };
      const pairedPlayerIds = new Set(nextPairings.flatMap((pairing) => pairing.playerIds ?? []).filter(Boolean));
      let rosterPlayerIds = draft.rosterPlayerIds.filter((id) => activePlayerIds.has(id));

      if (playerId && !rosterPlayerIds.includes(playerId)) {
        if (rosterPlayerIds.length >= playersNeeded) {
          setError(`Choose up to ${playersNeeded} players for this match roster.`);
          return draft;
        }

        rosterPlayerIds = [...rosterPlayerIds, playerId];
      }

      if (previousPlayerId && !pairedPlayerIds.has(previousPlayerId) && !availablePlayerIds.has(previousPlayerId)) {
        rosterPlayerIds = rosterPlayerIds.filter((id) => id !== previousPlayerId);
      }

      setError('');
      return {
        ...draft,
        pairings: normalizeDraftPairingsForMatch(nextPairings, rosterPlayerIds, playersNeeded),
        rosterPlayerIds,
      };
    });
  }

  async function handleSavePairings() {
    if (!activeGame || !activeDraft) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await saveGamePairings({
        clubSlug,
        gameId: activeGame.id,
        pairings: activeDraft.pairings,
        rosterPlayerIds: activeDraft.rosterPlayerIds,
        teamSlug,
      });
      setMessage('Pairings saved for that matchup.');
      await loadPairingsData();
    } catch (saveError) {
      setError(saveError.message ?? 'Unable to save matchup pairings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-grid roster-builder-page">
      <section className="card roster-builder-hero">
        <div className="roster-builder-hero__header">
          <div>
            <p className="eyebrow">Match rosters</p>
            <h1>Build Rosters</h1>
            <p className="roster-builder-hero__copy">
                  Pick a match, choose available players, or manually assign any active player into court slots.
                  Saved rosters appear on the player Team Matches page.
            </p>
          </div>
          {activeDraft ? (
            <span className="settings-admin-member-pill">
              {activeDraft.rosterPlayerIds.length} / {playersNeeded} selected
            </span>
          ) : null}
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {games.length > 0 ? (
          <div className="roster-builder-match-picker" aria-label="Choose a match">
            {games.map((game) => {
              const selectedCount =
                pairingDrafts[game.id]?.rosterPlayerIds.length ?? game.rosterPlayerIds?.length ?? 0;
              const availableCount = Object.values(game.attendance ?? {}).filter((status) => status === 'in').length;
              const matchPlayersNeeded = game.playersNeeded ?? 8;

              return (
                <button
                  key={game.id}
                  className={`roster-builder-match-card ${game.id === activeGame?.id ? 'roster-builder-match-card--active' : ''}`}
                  onClick={() => {
                    setSelectedGameId(game.id);
                    setError('');
                    setMessage('');
                  }}
                  type="button"
                >
                  <div className="roster-builder-match-card__main">
                    <span>{game.id === activeGame?.id ? 'Selected Match' : 'Match'}</span>
                    <strong>{game.opponent || 'Opponent TBD'}</strong>
                    <small>
                      {game.isoDate || game.dateLabel || 'Date TBD'} · {game.location || 'Location TBD'}
                    </small>
                  </div>
                  <div className="roster-builder-match-card__badges">
                    <span className="roster-builder-match-card__badge">{availableCount} Available</span>
                    <span className="roster-builder-match-card__badge roster-builder-match-card__badge--selected">
                      {selectedCount} / {matchPlayersNeeded} Selected
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p>No upcoming matches are available for roster building yet.</p>
        )}
      </section>

      {activeGame ? (
        <>
          <section className="card roster-builder-section">
            <div className="roster-builder-section__header">
              <div>
                <p className="eyebrow">Available Players</p>
                <h2>Select the roster</h2>
                <p>
                  Select players marked Available for quick setup. If someone forgot to mark availability,
                  assign them manually in the court dropdowns below.
                </p>
              </div>
              <span className="settings-admin-member-pill">
                {availablePlayers.length} available
              </span>
            </div>

            {canManage ? (
              availablePlayers.length > 0 ? (
                <div className="pairing-pool roster-builder-player-grid">
                  {availablePlayers.map((player) => {
                    const selected = activeDraft?.rosterPlayerIds.includes(player.id);
                    const attendanceStatus = formatAttendanceStatus(
                      activeGame.attendance?.[player.id] ?? 'unknown',
                    );

                    return (
                      <button
                        key={player.id}
                        className={`pairing-chip ${selected ? 'pairing-chip--active' : ''}`}
                        onClick={() => toggleRosterPlayer(player.id)}
                        type="button"
                      >
                        <div className="pairing-chip__header">
                          <strong>{player.fullName || 'Unnamed player'}</strong>
                        </div>
                        <span>
                          {attendanceStatus}
                          {player.skillLevel ? ` · ${player.skillLevel}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="notice notice--info">
                  No players have marked Available for this match yet. Players can update availability
                  from Team Matches.
                </div>
              )
            ) : (
              <div className="notice notice--info">
                Captains and co-captains can build rosters. Your current role is{' '}
                <strong>{membership?.role ?? 'member'}</strong>.
              </div>
            )}
          </section>

          <section className="card roster-builder-section">
            <div className="roster-builder-section__header">
              <div>
                <p className="eyebrow">Assign Courts</p>
                <h2>Court assignments</h2>
                <p>Review the auto-filled slots or move players between courts before saving.</p>
              </div>
            </div>

            <div className="pairing-grid roster-builder-court-grid">
              {visiblePairings.map((pairing, pairIndex) => {
                const slotValues = pairing.playerIds.length > 0 ? [...pairing.playerIds] : ['', ''];

                while (slotValues.length < 2) {
                  slotValues.push('');
                }

                return (
                  <div key={pairing.courtLabel} className="pairing-card">
                    <h2>{pairing.courtLabel}</h2>
                    {canManage ? (
                      <div className="pairing-card__slots">
                        {[0, 1].map((slotIndex) => {
                          const currentValue = slotValues[slotIndex] ?? '';
                          const selectedElsewhere = new Set(
                            visiblePairings
                              .flatMap((entry, entryIndex) =>
                                entryIndex === pairIndex ? [] : entry.playerIds ?? [],
                              )
                              .filter(Boolean),
                          );

                          return (
                            <label key={`${pairing.courtLabel}-${slotIndex}`} className="field">
                              <span>Player {slotIndex + 1}</span>
                              <select
                                onChange={(event) =>
                                  updatePairingSlot(pairIndex, slotIndex, event.target.value)
                                }
                                value={currentValue}
                              >
                                <option value="">Open slot</option>
                                {activePlayers.map((player) => {
                                  const attendanceStatus = formatAttendanceStatus(
                                    activeGame.attendance?.[player.id] ?? 'unknown',
                                  );
                                  const disabled =
                                    currentValue !== player.id && selectedElsewhere.has(player.id);

                                  return (
                                    <option key={player.id} disabled={disabled} value={player.id}>
                                      {player.fullName || 'Unnamed player'} · {attendanceStatus}
                                    </option>
                                  );
                                })}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="pairing-card__slots">
                        {(pairingSummary.pairings[pairIndex]?.players ?? []).length > 0 ? (
                          (pairingSummary.pairings[pairIndex]?.players ?? []).map((player) => (
                            <div key={player.id} className="pairing-chip pairing-chip--readonly">
                              <strong>{player.fullName || 'Unnamed player'}</strong>
                            </div>
                          ))
                        ) : (
                          <p>Open slot</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {canManage ? (
              <div className="pairing-actions roster-builder-save">
                <button className="button" disabled={saving} onClick={handleSavePairings} type="button">
                  {saving ? 'Saving roster...' : 'Save Roster'}
                </button>
                <span className="sidebar__empty">
                  Selected: {activeDraft?.rosterPlayerIds.length ?? 0} / {playersNeeded} players. Roster will be
                  visible to players on Team Matches.
                </span>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function AvailabilityPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [updatingGameId, setUpdatingGameId] = useState('');
  const [viewMode, setViewMode] = useState('per-game');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const activePlayers = useMemo(() => players.filter((player) => player.active), [players]);
  const todayDateKey = useMemo(() => getTodayDateKey(), []);
  const orderedPlayers = useMemo(() => {
    if (!activePlayers.length) {
      return [];
    }

    return [...activePlayers].sort((left, right) => {
      if (left.id === membership?.playerId) {
        return -1;
      }

      if (right.id === membership?.playerId) {
        return 1;
      }

      return (left.fullName || '').localeCompare(right.fullName || '');
    });
  }, [activePlayers, membership?.playerId]);

  async function loadAvailabilityData() {
    const [gameData, playerData, membershipData] = await Promise.all([
      listGames(clubSlug, teamSlug),
      listPlayers(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setGames(gameData);
    setPlayers(playerData);
    setMembership(membershipData);
    setSelectedGameId((current) => {
      if (current && gameData.some((game) => game.id === current)) {
        return current;
      }

      return gameData[findFirstUpcomingGameIndex(gameData, todayDateKey)]?.id ?? '';
    });
  }

  useEffect(() => {
    setLoading(true);
    setError('');

    loadAvailabilityData()
      .catch((loadError) => {
        setError(loadError.message ?? 'Unable to load availability yet.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [clubSlug, teamSlug, todayDateKey, user?.uid]);

  const selectedGameIndex = Math.max(
    0,
    games.findIndex((game) => game.id === selectedGameId),
  );
  const activeGame = games[selectedGameIndex] ?? null;
  const activeGameSummary = useMemo(
    () => (activeGame ? buildAvailabilitySummary(activeGame, activePlayers) : null),
    [activeGame, activePlayers],
  );

  function moveSelection(direction) {
    if (!games.length) {
      return;
    }

    const nextIndex = Math.min(Math.max(selectedGameIndex + direction, 0), games.length - 1);
    setSelectedGameId(games[nextIndex]?.id ?? '');
  }

  async function updateAvailability(gameId, status) {
    setUpdatingGameId(gameId);
    setError('');

    try {
      await setAvailability({
        clubSlug,
        gameId,
        playerId: membership?.playerId,
        status,
        teamSlug,
        user,
      });
      await loadAvailabilityData();
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to update availability.');
    } finally {
      setUpdatingGameId('');
    }
  }

  return (
    <div className="page-grid availability-page">
      <section className="card">
        <p className="eyebrow">Availability</p>
        <h1>Team availability board</h1>
        <p>
          Review the full roster response for each matchup while only updating the signed-in
          member&apos;s linked player record.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {!loading && !membership?.playerId ? (
          <div className="notice notice--warning">
            Your account is not linked to a player record for this team yet.
          </div>
        ) : null}

        <div className="availability-tabs" aria-label="Availability views">
          <button
            className={`availability-tabs__button ${viewMode === 'per-game' ? 'availability-tabs__button--active' : ''}`}
            onClick={() => setViewMode('per-game')}
            type="button"
          >
            Per Game
          </button>
          <button
            className={`availability-tabs__button ${viewMode === 'summary' ? 'availability-tabs__button--active' : ''}`}
            onClick={() => setViewMode('summary')}
            type="button"
          >
            Summary
          </button>
        </div>

        <p className="availability-summary__helper">
          {viewMode === 'summary'
            ? 'Summary is read-only. Scroll sideways on smaller screens to compare who is available for each matchup.'
            : 'Review one matchup at a time. Your player stays pinned to the top so you can update your status quickly.'}
        </p>

        {games.length > 0 && activePlayers.length > 0 ? (
          viewMode === 'summary' ? (
            <div className="availability-summary">
              <div className="availability-summary__scroll">
                <table className="availability-summary__table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      {games.map((game) => (
                        <th key={game.id}>{formatMatchupLabel(game)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orderedPlayers.map((player) => (
                      <tr key={player.id}>
                        <th>
                          {player.fullName || 'Unnamed player'}
                          {membership?.playerId === player.id ? ' (You)' : ''}
                        </th>
                        {games.map((game) => {
                          const status = getAttendanceStatus(game, player.id);
                          const statusMeta = getAvailabilityStatusMeta(
                            status,
                            membership?.playerId === player.id,
                          );

                          return (
                            <td key={game.id}>
                              <span className={`availability-status ${statusMeta.className}`}>
                                {statusMeta.label}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="availability-summary__totals">
                      <th>Total in</th>
                      {games.map((game) => {
                        const summary = buildAvailabilitySummary(game, activePlayers);

                        return <td key={game.id}>{summary.in}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              {games.length > 0 ? (
                <div className="game-rosters-page__pager">
                  <button
                    className="choice-button"
                    disabled={selectedGameIndex <= 0}
                    onClick={() => moveSelection(-1)}
                    type="button"
                  >
                    Previous
                  </button>
                  <span className="game-rosters-page__pager-label">
                    Matchup {selectedGameIndex + 1} of {games.length}
                  </span>
                  <button
                    className="choice-button"
                    disabled={selectedGameIndex >= games.length - 1}
                    onClick={() => moveSelection(1)}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              ) : null}

              {activeGame ? (
                <article className="availability-board">
                  <div className="availability-board__header">
                    <div>
                      <p className="availability-board__date">
                        {activeGame.isoDate
                          ? new Intl.DateTimeFormat('en-US', {
                              weekday: 'long',
                              month: 'short',
                              day: 'numeric',
                            })
                              .format(new Date(`${activeGame.isoDate}T12:00:00`))
                              .toUpperCase()
                          : 'DATE TBD'}
                      </p>
                      <h2 className="availability-board__title">
                        VS. {activeGame.opponent || 'Opponent TBD'}
                      </h2>
                      <p className="availability-board__meta">
                        {activeGame.timeLabel || 'Time TBD'} {activeGame.timeLabel ? '·' : ''}{' '}
                        {activeGame.location || 'Location TBD'}
                      </p>
                    </div>
                    <span className="availability-board__badge">
                      {getGameRosterBadge(activeGame, todayDateKey)}
                    </span>
                  </div>

                  <div className="availability-board__summary">
                    {[
                      {
                        key: 'in',
                        label: 'Available',
                        value: activeGameSummary?.in ?? 0,
                      },
                      {
                        key: 'out',
                        label: 'Unavailable',
                        value: activeGameSummary?.out ?? 0,
                      },
                      {
                        key: 'unknown',
                        label: 'No response',
                        value: activeGameSummary?.unknown ?? 0,
                      },
                    ].map((item) => (
                      <div key={item.key} className="availability-board__summary-card">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="availability-board__players">
                    {orderedPlayers.map((player) => {
                      const currentStatus = getAttendanceStatus(activeGame, player.id);
                      const isCurrentPlayer = membership?.playerId === player.id;
                      const statusMeta = getAvailabilityBoardStatusMeta(
                        currentStatus,
                        isCurrentPlayer,
                      );

                      return (
                        <div
                          key={player.id}
                          className={`availability-board__player ${isCurrentPlayer ? 'availability-board__player--current' : ''}`}
                        >
                          <div className="availability-board__player-top">
                            <strong className="availability-board__player-name">
                              {player.fullName || 'Unnamed player'}
                            </strong>
                            <span className={`availability-status ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                          </div>

                          {isCurrentPlayer ? (
                            <div className="choice-row availability-board__actions">
                              {[
                                { label: 'Available', value: 'in' },
                                { label: 'Unavailable', value: 'out' },
                                { label: 'Clear', value: 'unknown' },
                              ].map((choice) => (
                                <button
                                  key={choice.value}
                                  className={`choice-button ${currentStatus === choice.value ? 'choice-button--active' : ''}`}
                                  disabled={!membership?.playerId || updatingGameId === activeGame.id}
                                  onClick={() => updateAvailability(activeGame.id, choice.value)}
                                  type="button"
                                >
                                  {updatingGameId === activeGame.id && currentStatus === choice.value
                                    ? 'Saving...'
                                    : choice.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              ) : (
                <p>No scheduled matchups yet.</p>
              )}
            </>
          )
        ) : activePlayers.length === 0 ? (
          <p>No active roster players are available yet.</p>
        ) : (
          <p>No scheduled matchups yet.</p>
        )}
      </section>
    </div>
  );
}

function LinkifiedText({ text }) {
  const parts = String(text ?? '').split(/(https?:\/\/[^\s]+)/g);

  return parts.map((part, index) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a key={`${part}-${index}`} href={part} rel="noreferrer" target="_blank">
          {part}
        </a>
      );
    }

    return part;
  });
}

const NEWS_REACTIONS = [
  { id: 'like', label: 'Like', symbol: '👍' },
  { id: 'love', label: 'Love', symbol: '❤️' },
  { id: 'thumbsUp', label: 'Thumbs up', symbol: '🙌' },
  { id: 'thumbsDown', label: 'Thumbs down', symbol: '👎' },
  { id: 'laugh', label: 'Laugh', symbol: '😂' },
  { id: 'cry', label: 'Cry', symbol: '😢' },
  { id: 'angry', label: 'Angry', symbol: '😡' },
];

function getReactionSummary(reactions = []) {
  return NEWS_REACTIONS.map((reaction) => ({
    ...reaction,
    count: reactions.filter((entry) => entry.type === reaction.id).length,
  })).filter((reaction) => reaction.count > 0);
}

function NewsFeed({
  canManage = false,
  commentDrafts = {},
  commentEditDraft = '',
  currentUser,
  deletingCommentId = '',
  deletingPostId = '',
  editingCommentId = '',
  editingPostId = '',
  newsPosts,
  onCancelCommentEdit,
  onCancelPostEdit,
  onCommentChange,
  onCommentEditChange,
  onCommentSubmit,
  onDeleteComment,
  onDeletePost,
  onEditComment,
  onEditPost,
  onPostEditChange,
  onPostEditImageSelected,
  onReactionToggle,
  onSaveCommentEdit,
  onSavePostEdit,
  postEditDraft = '',
  postEditImagePreviewUrl = '',
  reactingPostId = '',
  savingCommentId = '',
  savingPostId = '',
}) {
  if (!newsPosts.length) {
    return <p>No team posts yet. Share the first photo, update, or team note.</p>;
  }

  return (
    <div className="news-feed">
      {newsPosts.map((post) => {
        const currentUserReaction = post.reactions?.find((reaction) => reaction.uid === currentUser?.uid);
        const currentReactionMeta = NEWS_REACTIONS.find((reaction) => reaction.id === currentUserReaction?.type);
        const reactionSummary = getReactionSummary(post.reactions);
        const canDeletePost = canManage || post.authorUid === currentUser?.uid;
        const canEditPost = post.authorUid === currentUser?.uid;
        const isEditingPost = editingPostId === post.id;

        return (
          <article key={post.id} className="news-feed-card">
            <div className="news-feed-card__header">
              <div className="news-feed-card__author">
                <div className="news-feed-card__avatar">
                  {post.authorPhotoUrl ? (
                    <img alt="" decoding="async" loading="lazy" src={post.authorPhotoUrl} />
                  ) : (
                    buildPlayerInitials(post.authorName || 'Teammate')
                  )}
                </div>
                <div>
                  <strong>{post.authorName || 'Teammate'}</strong>
                  <span>{formatNewsPostDate(post)}</span>
                </div>
              </div>
              {canDeletePost || canEditPost ? (
                <div className="news-feed-icon-actions">
                  {canEditPost ? (
                    <button
                      aria-label="Edit post"
                      className="news-icon-button"
                      disabled={isEditingPost || savingPostId === post.id}
                      onClick={() => onEditPost?.(post)}
                      title="Edit post"
                      type="button"
                    >
                      <PencilIcon />
                    </button>
                  ) : null}
                  {canDeletePost ? (
                    <button
                      aria-label={deletingPostId === post.id ? 'Deleting post' : 'Delete post'}
                      className="news-icon-button news-icon-button--danger"
                      disabled={deletingPostId === post.id}
                      onClick={() => onDeletePost?.(post)}
                      title="Delete post"
                      type="button"
                    >
                      <TrashIcon />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {post.imageUrl ? (
              <div className="news-feed-card__image-wrap">
                <img alt="" className="news-feed-card__image" decoding="async" loading="lazy" src={post.imageUrl} />
              </div>
            ) : null}

            {isEditingPost ? (
              <form
                className="news-edit-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSavePostEdit?.(post);
                }}
              >
                <label className="field">
                  <span>Edit post</span>
                  <textarea
                    onChange={(event) => onPostEditChange?.(event.target.value)}
                    rows={4}
                    value={postEditDraft}
                  />
                </label>
                <label className="field">
                  <span>Replace image</span>
                  <input
                    accept="image/*"
                    disabled={savingPostId === post.id}
                    onChange={(event) => onPostEditImageSelected?.(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                </label>
                {postEditImagePreviewUrl ? (
                  <div className="news-composer-preview">
                    <img alt="Selected replacement preview" src={postEditImagePreviewUrl} />
                  </div>
                ) : post.imageUrl ? (
                  <p className="news-feed-card__date">Choose a replacement image to change the current photo.</p>
                ) : null}
                <div className="news-edit-form__actions">
                  <button
                    className="button button--ghost"
                    disabled={savingPostId === post.id}
                    onClick={onCancelPostEdit}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="button"
                    disabled={savingPostId === post.id || (!postEditDraft.trim() && !postEditImagePreviewUrl && !post.imageUrl)}
                    type="submit"
                  >
                    {savingPostId === post.id ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            ) : post.body ? (
              <p className="news-feed-card__text">
                <LinkifiedText text={post.body} />
              </p>
            ) : null}

            <div className="news-feed-card__actions">
              <div className="news-reaction-picker" aria-label="Post reactions">
                {NEWS_REACTIONS.map((reaction) => (
                  <button
                    key={reaction.id}
                    aria-label={reaction.label}
                    className={`news-reaction-button ${currentUserReaction?.type === reaction.id ? 'news-reaction-button--active' : ''}`}
                    disabled={reactingPostId === post.id}
                    onClick={() => onReactionToggle?.(post, reaction.id)}
                    title={reaction.label}
                    type="button"
                  >
                    <span>{reaction.symbol}</span>
                  </button>
                ))}
              </div>
              <span>{post.commentCount} comments</span>
            </div>

            {reactionSummary.length > 0 ? (
              <div className="news-reaction-summary">
                {reactionSummary.map((reaction) => (
                  <span key={reaction.id}>
                    {reaction.symbol} {reaction.count}
                  </span>
                ))}
                {currentReactionMeta ? <strong>You reacted {currentReactionMeta.symbol}</strong> : null}
              </div>
            ) : null}

            <div className="news-feed-comments">
              {post.comments?.map((comment) => {
                const canDeleteComment = canManage || comment.authorUid === currentUser?.uid;
                const canEditComment = comment.authorUid === currentUser?.uid;
                const isEditingComment = editingCommentId === comment.id;

                return (
                  <div key={comment.id} className="news-feed-comment">
                    <div className="news-feed-comment__body">
                      <strong>{comment.authorName || 'Teammate'}</strong>
                      {isEditingComment ? (
                        <form
                          className="news-edit-form news-edit-form--comment"
                          onSubmit={(event) => {
                            event.preventDefault();
                            onSaveCommentEdit?.(post, comment);
                          }}
                        >
                          <textarea
                            aria-label="Edit comment"
                            onChange={(event) => onCommentEditChange?.(event.target.value)}
                            rows={2}
                            value={commentEditDraft}
                          />
                          <div className="news-edit-form__actions">
                            <button
                              className="button button--ghost"
                              disabled={savingCommentId === comment.id}
                              onClick={onCancelCommentEdit}
                              type="button"
                            >
                              Cancel
                            </button>
                            <button
                              className="button"
                              disabled={savingCommentId === comment.id || !commentEditDraft.trim()}
                              type="submit"
                            >
                              {savingCommentId === comment.id ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <p>
                          <LinkifiedText text={comment.body} />
                          {comment.updatedAtMs ? <span className="news-feed-comment__edited"> Edited</span> : null}
                        </p>
                      )}
                    </div>
                    {canDeleteComment || canEditComment ? (
                      <div className="news-feed-icon-actions">
                        {canEditComment ? (
                          <button
                            aria-label="Edit comment"
                            className="news-icon-button"
                            disabled={isEditingComment || savingCommentId === comment.id}
                            onClick={() => onEditComment?.(comment)}
                            title="Edit comment"
                            type="button"
                          >
                            <PencilIcon />
                          </button>
                        ) : null}
                        {canDeleteComment ? (
                          <button
                            aria-label={deletingCommentId === comment.id ? 'Deleting comment' : 'Delete comment'}
                            className="news-icon-button news-icon-button--danger"
                            disabled={deletingCommentId === comment.id}
                            onClick={() => onDeleteComment?.(post, comment)}
                            title="Delete comment"
                            type="button"
                          >
                            <TrashIcon />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <form
                className="news-feed-comment-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onCommentSubmit?.(event, post);
                }}
              >
                <input
                  onChange={(event) => onCommentChange?.(post.id, event.target.value)}
                  placeholder="Write a comment..."
                  value={commentDrafts[post.id] ?? ''}
                />
                <button
                  aria-label="Send comment"
                  className="news-feed-comment-submit"
                  disabled={!String(commentDrafts[post.id] ?? '').trim()}
                  type="submit"
                >
                  Send
                </button>
              </form>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function NewsroomAdminList({
  deletingId = '',
  emptyMessage = 'No news posts match those filters.',
  newsPosts,
  onDelete,
  onEdit,
  selectedPostId = '',
}) {
  if (!newsPosts.length) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div className="newsroom-list">
      {newsPosts.map((post) => {
        const isSelected = selectedPostId === post.id;

        return (
          <article
            key={post.id}
            className={`newsroom-post-row ${isSelected ? 'newsroom-post-row--active' : ''}`}
          >
            <button
              className="newsroom-post-row__main"
              onClick={() => onEdit?.(post)}
              type="button"
            >
              <div className="newsroom-post-row__top">
                <div>
                  <p className="newsroom-post-row__meta">{buildNewsPostMeta(post)}</p>
                  <h2 className="newsroom-post-row__title">{post.title}</h2>
                </div>
                <div className="newsroom-post-row__chips">
                  {post.imageUrl ? <span className="newsroom-post-row__chip">Image</span> : null}
                  {post.linkUrl ? <span className="newsroom-post-row__chip">Link</span> : null}
                  {isSelected ? (
                    <span className="newsroom-post-row__chip newsroom-post-row__chip--active">
                      Editing
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="newsroom-post-row__excerpt">{buildNewsExcerpt(post.body)}</p>
            </button>

            <div className="newsroom-post-row__footer">
              <span className="newsroom-post-row__date">{formatNewsPostDate(post)}</span>
              <div className="choice-row newsroom-post-row__actions">
                {post.linkUrl ? (
                  <a
                    className="news-feed-card__action"
                    href={post.linkUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open link
                  </a>
                ) : null}
                {post.imageUrl ? (
                  <button
                    className="news-feed-card__action"
                    onClick={() => downloadNewsImage(post)}
                    type="button"
                  >
                    Download image
                  </button>
                ) : null}
                <button className="choice-button" onClick={() => onEdit?.(post)} type="button">
                  Edit
                </button>
                <button
                  className="choice-button"
                  disabled={deletingId === post.id}
                  onClick={() => onDelete?.(post)}
                  type="button"
                >
                  {deletingId === post.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function NewsFeedIntro({ eyebrow = 'Team updates', title, copy }) {
  return (
    <div className="news-feed-intro">
      <div className="news-feed-intro__content">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="news-feed-intro__copy">{copy}</p>
      </div>
    </div>
  );
}

export function NewsPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const imageInputId = `news-image-${clubSlug}-${teamSlug}`;
  const [newsPosts, setNewsPosts] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [membership, setMembership] = useState(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [form, setForm] = useState({ body: '', imageFile: null, imagePreviewUrl: '' });
  const [commentDrafts, setCommentDrafts] = useState({});
  const [editingPostId, setEditingPostId] = useState('');
  const [postEditDraft, setPostEditDraft] = useState('');
  const [postEditImageFile, setPostEditImageFile] = useState(null);
  const [postEditImagePreviewUrl, setPostEditImagePreviewUrl] = useState('');
  const [editingCommentId, setEditingCommentId] = useState('');
  const [commentEditDraft, setCommentEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPostId, setSavingPostId] = useState('');
  const [savingCommentId, setSavingCommentId] = useState('');
  const [deletingPostId, setDeletingPostId] = useState('');
  const [deletingCommentId, setDeletingCommentId] = useState('');
  const [reactingPostId, setReactingPostId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canManage = canManageRole(membership?.role);

  async function loadNewsData() {
    const [posts, membershipData, teamData] = await Promise.all([
      listNewsPosts(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
      getTeam(clubSlug, teamSlug),
    ]);

    setNewsPosts(posts);
    setMembership(membershipData);
    setTeamName(teamData?.name ?? '');
  }

  useEffect(() => {
    loadNewsData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load team news yet.');
    });
  }, [clubSlug, teamSlug, user?.uid]);

  useEffect(() => (
    () => {
      if (postEditImagePreviewUrl) {
        URL.revokeObjectURL(postEditImagePreviewUrl);
      }
    }
  ), [postEditImagePreviewUrl]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await saveNewsPost({
        body: form.body,
        clubSlug,
        imageFile: form.imageFile,
        linkUrl: '',
        teamSlug,
        title: `${user?.displayName || 'Team'} post`,
        user,
      });
      if (form.imagePreviewUrl) {
        URL.revokeObjectURL(form.imagePreviewUrl);
      }
      setForm({ body: '', imageFile: null, imagePreviewUrl: '' });
      setIsComposerOpen(false);
      setMessage('Post shared.');
      await loadNewsData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to share that post.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePost(post) {
    setDeletingPostId(post.id);
    setError('');
    setMessage('');

    try {
      await deleteNewsPost({ clubSlug, post, teamSlug });
      setMessage('Post deleted.');
      await loadNewsData();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Unable to delete that post.');
    } finally {
      setDeletingPostId('');
    }
  }

  function handleEditPost(post) {
    if (postEditImagePreviewUrl) {
      URL.revokeObjectURL(postEditImagePreviewUrl);
    }

    setEditingPostId(post.id);
    setPostEditDraft(post.body ?? '');
    setPostEditImageFile(null);
    setPostEditImagePreviewUrl('');
    setEditingCommentId('');
    setCommentEditDraft('');
    setError('');
    setMessage('');
  }

  function handleCancelPostEdit() {
    if (postEditImagePreviewUrl) {
      URL.revokeObjectURL(postEditImagePreviewUrl);
    }

    setEditingPostId('');
    setPostEditDraft('');
    setPostEditImageFile(null);
    setPostEditImagePreviewUrl('');
  }

  async function handlePostEditImageSelected(file) {
    if (!file) {
      if (postEditImagePreviewUrl) {
        URL.revokeObjectURL(postEditImagePreviewUrl);
      }

      setPostEditImageFile(null);
      setPostEditImagePreviewUrl('');
      return;
    }

    setError('');

    try {
      const resizedFile = await createResizedNewsImageFile(file);
      if (postEditImagePreviewUrl) {
        URL.revokeObjectURL(postEditImagePreviewUrl);
      }

      setPostEditImageFile(resizedFile);
      setPostEditImagePreviewUrl(URL.createObjectURL(resizedFile));
    } catch (selectionError) {
      setError(selectionError.message ?? 'Unable to prepare that image.');
    }
  }

  async function handleSavePostEdit(post) {
    setSavingPostId(post.id);
    setError('');
    setMessage('');

    try {
      await saveNewsPost({
        body: postEditDraft,
        clubSlug,
        imageFile: postEditImageFile,
        linkUrl: post.linkUrl ?? '',
        post,
        teamSlug,
        title: post.title || `${user?.displayName || 'Team'} post`,
        user,
      });
      if (postEditImagePreviewUrl) {
        URL.revokeObjectURL(postEditImagePreviewUrl);
      }

      setEditingPostId('');
      setPostEditDraft('');
      setPostEditImageFile(null);
      setPostEditImagePreviewUrl('');
      setMessage('Post updated.');
      await loadNewsData();
    } catch (editError) {
      setError(editError.message ?? 'Unable to update that post.');
    } finally {
      setSavingPostId('');
    }
  }

  async function handleCommentSubmit(event, post) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      await addNewsComment({
        body: commentDrafts[post.id] ?? '',
        clubSlug,
        postId: post.id,
        teamSlug,
        user,
      });
      setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
      await loadNewsData();
    } catch (commentError) {
      setError(commentError.message ?? 'Unable to post that comment.');
    }
  }

  async function handleDeleteComment(post, comment) {
    setDeletingCommentId(comment.id);
    setError('');
    setMessage('');

    try {
      await deleteNewsComment({
        clubSlug,
        commentId: comment.id,
        postId: post.id,
        teamSlug,
      });
      await loadNewsData();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Unable to delete that comment.');
    } finally {
      setDeletingCommentId('');
    }
  }

  function handleEditComment(comment) {
    if (postEditImagePreviewUrl) {
      URL.revokeObjectURL(postEditImagePreviewUrl);
    }

    setEditingCommentId(comment.id);
    setCommentEditDraft(comment.body ?? '');
    setEditingPostId('');
    setPostEditDraft('');
    setPostEditImageFile(null);
    setPostEditImagePreviewUrl('');
    setError('');
    setMessage('');
  }

  function handleCancelCommentEdit() {
    setEditingCommentId('');
    setCommentEditDraft('');
  }

  async function handleSaveCommentEdit(post, comment) {
    setSavingCommentId(comment.id);
    setError('');
    setMessage('');

    try {
      await updateNewsComment({
        body: commentEditDraft,
        clubSlug,
        commentId: comment.id,
        postId: post.id,
        teamSlug,
        user,
      });
      setEditingCommentId('');
      setCommentEditDraft('');
      await loadNewsData();
    } catch (editError) {
      setError(editError.message ?? 'Unable to update that comment.');
    } finally {
      setSavingCommentId('');
    }
  }

  async function handleReactionToggle(post, reactionType = 'like') {
    setReactingPostId(post.id);
    setError('');

    try {
      await toggleNewsReaction({
        clubSlug,
        post,
        teamSlug,
        type: reactionType,
        user,
      });
      await loadNewsData();
    } catch (reactionError) {
      setError(reactionError.message ?? 'Unable to update that reaction.');
    } finally {
      setReactingPostId('');
    }
  }

  async function handleImageSelected(file) {
    if (!file) {
      removeSelectedImage();
      return;
    }

    setError('');

    try {
      const resizedFile = await createResizedNewsImageFile(file);
      setForm((current) => {
        if (current.imagePreviewUrl) {
          URL.revokeObjectURL(current.imagePreviewUrl);
        }

        return {
          ...current,
          imageFile: resizedFile,
          imagePreviewUrl: URL.createObjectURL(resizedFile),
        };
      });
    } catch (selectionError) {
      setError(selectionError.message ?? 'Unable to prepare that image.');
    }
  }

  function removeSelectedImage() {
    setForm((current) => {
      if (current.imagePreviewUrl) {
        URL.revokeObjectURL(current.imagePreviewUrl);
      }

      return {
        ...current,
        imageFile: null,
        imagePreviewUrl: '',
      };
    });
  }

  function closeComposer() {
    setForm((current) => {
      if (current.imagePreviewUrl) {
        URL.revokeObjectURL(current.imagePreviewUrl);
      }

      return { body: '', imageFile: null, imagePreviewUrl: '' };
    });
    setIsComposerOpen(false);
  }

  return (
    <div className="page-grid news-page">
      <section className="card">
        <NewsFeedIntro
          copy={`Share photos, team happenings, drills, practices, and match moments with ${teamName || 'the team'}.`}
          title="News Feed"
        />

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {isComposerOpen ? (
          <form className="news-composer" onSubmit={handleSubmit}>
            <label className="field">
              <span>What&apos;s new with the team?</span>
              <textarea
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                placeholder="Share a photo, practice note, drill idea, match recap, or team update..."
                rows={4}
                value={form.body}
              />
            </label>
            <div className="news-composer__footer">
              <label className="news-composer__file" htmlFor={imageInputId}>
                Choose Image
                <input
                  id={imageInputId}
                  accept="image/*"
                  onChange={(event) => handleImageSelected(event.target.files?.[0] ?? null)}
                  type="file"
                  value=""
                />
              </label>
              <div className="news-composer__actions">
                <button className="button button--ghost" disabled={saving} onClick={closeComposer} type="button">
                  Cancel
                </button>
                <button
                  className="button"
                  disabled={saving || (!form.body.trim() && !form.imageFile)}
                  type="submit"
                >
                  {saving ? 'Sharing...' : 'Share Post'}
                </button>
              </div>
            </div>
            {form.imagePreviewUrl ? (
              <div className="news-composer-preview">
                <img alt="Selected post preview" src={form.imagePreviewUrl} />
                <button className="news-feed-card__action" onClick={removeSelectedImage} type="button">
                  Remove image
                </button>
              </div>
            ) : null}
          </form>
        ) : (
          <div className="news-composer-prompt">
            <button
              className="news-composer-prompt__text"
              onClick={() => setIsComposerOpen(true)}
              type="button"
            >
              What&apos;s new with the team?
            </button>
            <button className="button" onClick={() => setIsComposerOpen(true)} type="button">
              Create Post
            </button>
          </div>
        )}

        <NewsFeed
          canManage={canManage}
          commentDrafts={commentDrafts}
          commentEditDraft={commentEditDraft}
          currentUser={user}
          deletingCommentId={deletingCommentId}
          deletingPostId={deletingPostId}
          editingCommentId={editingCommentId}
          editingPostId={editingPostId}
          newsPosts={newsPosts}
          onCancelCommentEdit={handleCancelCommentEdit}
          onCancelPostEdit={handleCancelPostEdit}
          onCommentChange={(postId, value) => setCommentDrafts((current) => ({ ...current, [postId]: value }))}
          onCommentEditChange={setCommentEditDraft}
          onCommentSubmit={handleCommentSubmit}
          onDeleteComment={handleDeleteComment}
          onDeletePost={handleDeletePost}
          onEditComment={handleEditComment}
          onEditPost={handleEditPost}
          onPostEditChange={setPostEditDraft}
          onPostEditImageSelected={handlePostEditImageSelected}
          onReactionToggle={(post, reactionType) => handleReactionToggle(post, reactionType)}
          onSaveCommentEdit={handleSaveCommentEdit}
          onSavePostEdit={handleSavePostEdit}
          postEditDraft={postEditDraft}
          postEditImagePreviewUrl={postEditImagePreviewUrl}
          reactingPostId={reactingPostId}
          savingCommentId={savingCommentId}
          savingPostId={savingPostId}
        />
      </section>
    </div>
  );
}

export function NewsroomPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [newsPosts, setNewsPosts] = useState([]);
  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterMode, setFilterMode] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingPostId, setEditingPostId] = useState('');
  const [form, setForm] = useState(createEmptyNewsForm());

  const canManage = canManageRole(membership?.role);
  const editingPost = newsPosts.find((post) => post.id === editingPostId) ?? null;
  const filterCounts = useMemo(
    () => ({
      all: newsPosts.length,
      hasImage: newsPosts.filter((post) => Boolean(post.imageUrl)).length,
      hasLink: newsPosts.filter((post) => Boolean(post.linkUrl)).length,
    }),
    [newsPosts],
  );
  const filteredPosts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return newsPosts.filter((post) => {
      if (filterMode === 'has-image' && !post.imageUrl) {
        return false;
      }

      if (filterMode === 'has-link' && !post.linkUrl) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [post.title, post.body, post.linkUrl].some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(normalizedSearch),
      );
    });
  }, [filterMode, newsPosts, searchTerm]);

  async function loadNewsData() {
    const [posts, membershipData] = await Promise.all([
      listNewsPosts(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setNewsPosts(posts);
    setMembership(membershipData);
  }

  useEffect(() => {
    setLoading(true);
    setError('');

    loadNewsData()
      .catch((loadError) => {
        setError(loadError.message ?? 'Unable to load the newsroom yet.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [clubSlug, teamSlug, user?.uid]);

  function resetForm() {
    setEditingPostId('');
    setForm(createEmptyNewsForm());
  }

  function openComposer() {
    resetForm();
    setDrawerOpen(true);
    setMessage('');
    setError('');
  }

  function closeDrawer() {
    resetForm();
    setDrawerOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await saveNewsPost({
        body: form.body,
        clubSlug,
        imageFile: form.imageFile,
        linkUrl: form.linkUrl,
        post: editingPost,
        teamSlug,
        title: form.title,
        user,
      });
      setMessage(editingPost ? 'News post updated.' : 'News post published.');
      await loadNewsData();
      closeDrawer();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save that news post.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(post) {
    setDeletingId(post.id);
    setError('');
    setMessage('');

    try {
      await deleteNewsPost({ clubSlug, post, teamSlug });
      if (editingPostId === post.id) {
        closeDrawer();
      }
      setMessage('News post deleted.');
      await loadNewsData();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Unable to delete that news post.');
    } finally {
      setDeletingId('');
    }
  }

  function startEditing(post) {
    setEditingPostId(post.id);
    setForm({
      body: post.body,
      imageFile: null,
      linkUrl: post.linkUrl,
      title: post.title,
    });
    setMessage('');
    setError('');
    setDrawerOpen(true);
  }

  async function handleImageSelected(file) {
    if (!file) {
      setForm((current) => ({ ...current, imageFile: null }));
      return;
    }

    setError('');

    try {
      const resizedFile = await createResizedNewsImageFile(file);
      setForm((current) => ({ ...current, imageFile: resizedFile }));
    } catch (selectionError) {
      setError(selectionError.message ?? 'Unable to prepare that image.');
    }
  }

  return (
    <div className="page-grid news-page newsroom-page">
      <section className="card">
        <NewsFeedIntro
          eyebrow="Newsroom"
          copy="Manage published team updates with a faster queue, search, and quick edit workflow."
          title="Newsroom"
        />

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {canManage ? (
          <div className="newsroom-toolbar">
            <div className="newsroom-toolbar__primary">
              <button className="button" onClick={openComposer} type="button">
                New post
              </button>
              <div className="newsroom-toolbar__summary">
                <span>{filterCounts.all} total posts</span>
                <span>{filterCounts.hasImage} with images</span>
                <span>{filterCounts.hasLink} with links</span>
              </div>
            </div>

            <div className="newsroom-toolbar__filters">
              <label className="field newsroom-toolbar__search">
                <span>Search posts</span>
                <input
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search title, body, or link"
                  value={searchTerm}
                />
              </label>
              <div className="availability-tabs" aria-label="Newsroom filters">
                {[
                  { id: 'all', label: `All (${filterCounts.all})` },
                  { id: 'has-image', label: `Has image (${filterCounts.hasImage})` },
                  { id: 'has-link', label: `Has link (${filterCounts.hasLink})` },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    className={`availability-tabs__button ${filterMode === filter.id ? 'availability-tabs__button--active' : ''}`}
                    onClick={() => setFilterMode(filter.id)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : !loading ? (
          <div className="notice notice--info">
            Captains and co-captains can publish or edit team news. Your current role is{' '}
            <strong>{membership?.role ?? 'member'}</strong>.
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="newsroom-list__header">
          <div>
            <p className="eyebrow">Existing posts</p>
            <h2 className="newsroom-list__title">Content queue</h2>
            <p className="newsroom-list__copy">
              Scan published posts quickly, then open any row to edit it in the side panel.
            </p>
          </div>
          <span className="newsroom-list__count">
            {filteredPosts.length} shown{filteredPosts.length !== newsPosts.length ? ` of ${newsPosts.length}` : ''}
          </span>
        </div>

        {canManage ? (
          <NewsroomAdminList
            deletingId={deletingId}
            emptyMessage={
              searchTerm || filterMode !== 'all'
                ? 'No news posts match the current search or filters.'
                : 'No news posts published yet.'
            }
            newsPosts={filteredPosts}
            onDelete={handleDelete}
            onEdit={startEditing}
            selectedPostId={editingPostId}
          />
        ) : (
          <NewsFeed newsPosts={newsPosts} />
        )}
      </section>

      {canManage && drawerOpen ? (
        <div className="newsroom-drawer" role="dialog" aria-modal="true" aria-label="News editor">
          <button
            aria-label="Close news editor"
            className="newsroom-drawer__backdrop"
            onClick={closeDrawer}
            type="button"
          />
          <aside className="newsroom-drawer__panel">
            <div className="newsroom-drawer__header">
              <div>
                <p className="eyebrow">{editingPost ? 'Editing post' : 'Create post'}</p>
                <h2>{editingPost ? editingPost.title : 'Publish a new update'}</h2>
                <p className="newsroom-drawer__copy">
                  {editingPost
                    ? 'Update the post details here, then save to refresh the team feed.'
                    : 'Compose a new post without leaving the queue.'}
                </p>
              </div>
              <button className="button button--ghost" onClick={closeDrawer} type="button">
                Close
              </button>
            </div>

            <form className="news-form newsroom-drawer__form" onSubmit={handleSubmit}>
              <label className="field news-form__full">
                <span>Title</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Weekly team update"
                  value={form.title}
                />
              </label>
              <label className="field news-form__full">
                <span>Body</span>
                <textarea
                  onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                  placeholder="Share lineup notes, reminders, or club updates here."
                  rows={8}
                  value={form.body}
                />
              </label>
              <label className="field">
                <span>Optional link</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, linkUrl: event.target.value }))}
                  placeholder="https://..."
                  value={form.linkUrl}
                />
              </label>
              <label className="field">
                <span>Optional image</span>
                <input
                  accept="image/*"
                  onChange={(event) => handleImageSelected(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              <div className="news-form__actions newsroom-drawer__actions">
                <button className="button" disabled={saving} type="submit">
                  {saving
                    ? editingPost
                      ? 'Updating post...'
                      : 'Publishing post...'
                    : editingPost
                      ? 'Update post'
                      : 'Publish post'}
                </button>
                <button className="button button--ghost" onClick={closeDrawer} type="button">
                  Cancel
                </button>
              </div>
              {editingPost?.imageUrl ? (
                <div className="notice notice--info news-form__full">
                  Editing a post with an existing image. Upload a new file only if you want to replace
                  it.
                </div>
              ) : null}
              {editingPost ? (
                <div className="detail-card news-form__full newsroom-drawer__details">
                  <span>Last updated</span>
                  <strong>{formatNewsPostDate(editingPost)}</strong>
                  <span>{editingPost.imageUrl ? 'Includes image' : 'No image attached'}</span>
                  <span>{editingPost.linkUrl ? 'Includes link' : 'No link attached'}</span>
                </div>
              ) : null}
            </form>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function formatChallengeDate(challenge) {
  if (challenge.dateTbd || !challenge.isoDate) {
    return 'Date TBD';
  }

  return challenge.isoDate;
}

function formatChallengeTime(challenge) {
  const normalizedTime = (challenge.timeLabel ?? '').replace(':undefined', ':00');

  return challenge.dateTbd ? 'Time TBD' : normalizedTime || 'Time TBD';
}

function buildChallengeTimeLabel(form) {
  if (form.dateTbd || !form.hour) {
    return '';
  }

  return `${form.hour}:${form.minute} ${form.period}`;
}

function createChallengeFormFromChallenge(challenge) {
  const match = String(challenge.timeLabel ?? '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  return {
    dateTbd: challenge.dateTbd === true,
    hour: challenge.dateTbd === true ? '' : match?.[1] ?? '',
    isoDate: challenge.dateTbd === true ? '' : challenge.isoDate ?? '',
    location: challenge.location && challenge.location !== 'Location TBD' ? challenge.location : '',
    minute: challenge.dateTbd === true ? '00' : match?.[2] ?? '00',
    notes: challenge.notes ?? '',
    period: challenge.dateTbd === true ? 'AM' : match?.[3]?.toUpperCase() ?? 'AM',
    playersNeeded: challenge.playersNeeded ?? 8,
    targetTeamKey:
      challenge.visibility === 'targeted'
        ? `${challenge.targetTeamClubSlug}:${challenge.targetTeamSlug}`
        : '',
    visibility: challenge.visibility === 'targeted' ? 'targeted' : 'open',
  };
}

function getChallengeStatusLabel(challenge) {
  if (challenge.status === 'accepted') {
    return 'Accepted';
  }

  if (challenge.status === 'declined') {
    return 'Declined';
  }

  if (challenge.status === 'cancelled') {
    return 'Cancelled';
  }

  return challenge.visibility === 'targeted' ? 'Direct' : 'Open';
}

export function ChallengesPage() {
  const { clubSlug, teamSlug } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [membership, setMembership] = useState(null);
  const [eligibleTeams, setEligibleTeams] = useState([]);
  const [clubChallenges, setClubChallenges] = useState([]);
  const [teamChallenges, setTeamChallenges] = useState([]);
  const [form, setForm] = useState(createEmptyChallengeForm());
  const [editingChallengeId, setEditingChallengeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingChallengeId, setUpdatingChallengeId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [postedChallengeTab, setPostedChallengeTab] = useState('proposed');
  const [appliedChallengeTargetKey, setAppliedChallengeTargetKey] = useState('');

  const canManage = canManageRole(membership?.role);
  const challengeTargetTeamKey = location.state?.challengeTargetTeamKey ?? '';
  const challengeTargetTeamName = location.state?.challengeTargetTeamName ?? '';
  const challengeClubSlug =
    team?.affiliationStatus === 'approved' && team?.approvedClubSlug ? team.approvedClubSlug : '';
  const challengeSubmitDisabled = saving || (form.visibility === 'targeted' && !form.targetTeamKey);
  const selectedTargetTeam = eligibleTeams.find(
    (eligibleTeam) => `${eligibleTeam.clubSlug}:${eligibleTeam.teamSlug}` === form.targetTeamKey,
  );

  async function loadChallengeData() {
    const [teamData, membershipData] = await Promise.all([
      getTeam(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);
    const approvedClubSlug =
      teamData?.affiliationStatus === 'approved' && teamData?.approvedClubSlug ? teamData.approvedClubSlug : '';

    setTeam(teamData);
    setMembership(membershipData);
    setForm((current) => ({
      ...current,
      location: current.location === 'Location TBD' ? '' : current.location,
    }));

    if (!approvedClubSlug) {
      setEligibleTeams([]);
      setClubChallenges([]);
      setTeamChallenges([]);
      return;
    }

    const [approvedTeams, openChallenges, relevantChallenges] = await Promise.all([
      listApprovedClubTeams(approvedClubSlug).catch(() => []),
      listClubChallenges(approvedClubSlug).catch(() => []),
      listTeamChallenges({ challengeClubSlug: approvedClubSlug, clubSlug, teamSlug }).catch(() => []),
    ]);

    setEligibleTeams(
      approvedTeams.filter((approvedTeam) => approvedTeam.clubSlug !== clubSlug || approvedTeam.teamSlug !== teamSlug),
    );
    setClubChallenges(
      openChallenges.filter(
        (challenge) => challenge.createdByTeamClubSlug !== clubSlug || challenge.createdByTeamSlug !== teamSlug,
      ),
    );
    setTeamChallenges(relevantChallenges);
  }

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    loadChallengeData()
      .catch((loadError) => {
        if (!ignore) {
          setError(loadError.message ?? 'Unable to load club challenges yet.');
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [clubSlug, teamSlug, user?.uid]);

  useEffect(() => {
    if (!challengeTargetTeamKey || appliedChallengeTargetKey === challengeTargetTeamKey || loading || !canManage) {
      return;
    }

    const matchingTargetTeam = eligibleTeams.find(
      (eligibleTeam) => `${eligibleTeam.clubSlug}:${eligibleTeam.teamSlug}` === challengeTargetTeamKey,
    );

    if (!matchingTargetTeam) {
      return;
    }

    setForm((current) => ({
      ...current,
      targetTeamKey: challengeTargetTeamKey,
      visibility: 'targeted',
    }));
    setEditingChallengeId('');
    setError('');
    setMessage(`Challenge form started for ${challengeTargetTeamName || matchingTargetTeam.name}.`);
    setAppliedChallengeTargetKey(challengeTargetTeamKey);
  }, [
    appliedChallengeTargetKey,
    canManage,
    challengeTargetTeamKey,
    challengeTargetTeamName,
    eligibleTeams,
    loading,
  ]);

  async function handleCreateChallenge(event) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const challengePayload = {
        clubSlug,
        dateTbd: form.dateTbd,
        isoDate: form.isoDate,
        location: form.location,
        notes: form.notes,
        playersNeeded: form.playersNeeded,
        targetTeam: form.visibility === 'targeted' ? selectedTargetTeam : null,
        teamSlug,
        timeLabel: buildChallengeTimeLabel(form),
        user,
        visibility: form.visibility,
      };

      if (editingChallengeId) {
        await updateChallenge({
          ...challengePayload,
          challengeClubSlug,
          challengeId: editingChallengeId,
        });
      } else {
        await createChallenge(challengePayload);
      }

      setForm(createEmptyChallengeForm());
      setEditingChallengeId('');
      setMessage(editingChallengeId ? 'Challenge updated.' : 'Challenge sent.');
      await loadChallengeData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save that challenge.');
    } finally {
      setSaving(false);
    }
  }

  function handleEditChallenge(challenge) {
    setForm(createChallengeFormFromChallenge(challenge));
    setEditingChallengeId(challenge.id);
    setError('');
    setMessage('');
  }

  function handleCancelEditChallenge() {
    setForm(createEmptyChallengeForm());
    setEditingChallengeId('');
    setError('');
  }

  async function handleAcceptChallenge(challenge) {
    setUpdatingChallengeId(challenge.id);
    setError('');
    setMessage('');

    try {
      await acceptChallenge({
        challengeClubSlug: challenge.challengeClubSlug,
        challengeId: challenge.id,
        clubSlug,
        teamSlug,
        user,
      });
      setMessage('Challenge accepted and added to both schedules.');
      await loadChallengeData();
    } catch (acceptError) {
      setError(acceptError.message ?? 'Unable to accept that challenge.');
    } finally {
      setUpdatingChallengeId('');
    }
  }

  async function handleDeclineChallenge(challenge) {
    setUpdatingChallengeId(challenge.id);
    setError('');
    setMessage('');

    try {
      await declineChallenge({
        challengeClubSlug: challenge.challengeClubSlug,
        challengeId: challenge.id,
        clubSlug,
        teamSlug,
        user,
      });
      setMessage('Challenge declined.');
      await loadChallengeData();
    } catch (declineError) {
      setError(declineError.message ?? 'Unable to decline that challenge.');
    } finally {
      setUpdatingChallengeId('');
    }
  }

  async function handleCancelChallenge(challenge) {
    setUpdatingChallengeId(challenge.id);
    setError('');
    setMessage('');

    try {
      await cancelChallenge({
        challengeClubSlug: challenge.challengeClubSlug,
        challengeId: challenge.id,
        clubSlug,
        teamSlug,
        user,
      });
      setMessage('Challenge cancelled.');
      await loadChallengeData();
    } catch (cancelError) {
      setError(cancelError.message ?? 'Unable to cancel that challenge.');
    } finally {
      setUpdatingChallengeId('');
    }
  }

  function renderChallengeCard(challenge, actions = null) {
    const targetLabel =
      challenge.visibility === 'targeted'
        ? `To ${challenge.targetTeamName || challenge.targetTeamSlug}`
        : 'Open to club teams';
    const scheduleGameId =
      challenge.createdByTeamClubSlug === clubSlug && challenge.createdByTeamSlug === teamSlug
        ? challenge.homeGameId
        : challenge.awayGameId;

    return (
      <article key={challenge.id} className="challenge-card">
        <div className="challenge-card__badge">CC</div>
        <div className="challenge-card__body">
          <div className="challenge-card__header">
            <div className="challenge-card__title">
              <strong>{challenge.createdByTeamName || challenge.createdByTeamSlug}</strong>
              <span>{targetLabel}</span>
            </div>
            <span className="status-badge">{getChallengeStatusLabel(challenge)}</span>
          </div>

          <div className="challenge-card__details">
            <span>Date: {formatChallengeDate(challenge)}</span>
            <span>Time: {formatChallengeTime(challenge)}</span>
            <span>Players needed: {challenge.playersNeeded ?? 8}</span>
            <span>Court(s): {challenge.location || 'TBD'}</span>
            {challenge.status === 'accepted' && scheduleGameId ? (
              <span>Scheduled match created</span>
            ) : null}
          </div>
          {challenge.notes ? <p className="challenge-card__notes">{challenge.notes}</p> : null}
          {actions || (challenge.status === 'accepted' && scheduleGameId) ? (
            <div className="challenge-card__actions">
              {challenge.status === 'accepted' && scheduleGameId ? (
                <Link className="button button--ghost" to="../schedule">
                  View Team Matches
                </Link>
              ) : null}
              {actions}
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  const incomingChallenges = teamChallenges.filter(
    (challenge) =>
      challenge.status === 'open' &&
      challenge.visibility === 'targeted' &&
      challenge.targetTeamClubSlug === clubSlug &&
      challenge.targetTeamSlug === teamSlug,
  );
  const postedChallenges = teamChallenges.filter(
    (challenge) => challenge.createdByTeamClubSlug === clubSlug && challenge.createdByTeamSlug === teamSlug,
  );
  const proposedPostedChallenges = postedChallenges.filter((challenge) => challenge.status === 'open');
  const acceptedPostedChallenges = postedChallenges.filter((challenge) => challenge.status === 'accepted');
  const closedPostedChallenges = postedChallenges.filter((challenge) =>
    ['cancelled', 'declined'].includes(challenge.status),
  );
  const visiblePostedChallenges =
    postedChallengeTab === 'accepted'
      ? acceptedPostedChallenges
      : postedChallengeTab === 'closed'
        ? closedPostedChallenges
        : proposedPostedChallenges;
  return (
    <div className="page-grid schedule-admin-page">
      <section className="card">
        <p className="eyebrow">PKL Universe matches</p>
        <h1>Club Challenges</h1>
        <p>
          Challenge another approved team in your club network. Accepted challenges become scheduled matches for both
          teams.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {loading ? (
          <div className="state-panel">
            <p>Loading club challenges...</p>
          </div>
        ) : !challengeClubSlug ? (
          <div className="notice notice--info">
            Club challenges are available after this team is approved for a club affiliation.
          </div>
        ) : (
          <div className="challenge-page">
            {canManage ? (
              <section className="schedule-admin-card">
                <div className="schedule-admin-card__header">
                  <div>
                    <p className="eyebrow">{editingChallengeId ? 'Edit' : 'Create'}</p>
                    <h2>{editingChallengeId ? 'Edit challenge' : 'Send a challenge'}</h2>
                    <p>
                      {editingChallengeId
                        ? 'Update this challenge before another team accepts it.'
                        : 'Send a challenge directly to another team in your club network.'}
                    </p>
                  </div>
                </div>

                <form
                  className={`schedule-admin-form challenge-form challenge-form--${form.visibility}`}
                  onSubmit={handleCreateChallenge}
                >
                  <div className="challenge-form__section">
                    <div className="challenge-form__section-copy">
                      <h3>Who do you want to play?</h3>
                      <p>Choose a specific team first. Open club challenges are available for broader matching.</p>
                    </div>
                    <div className="challenge-form__audience-row">
                      <label className="field challenge-form__type">
                        <span>Challenge type</span>
                        <select
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              targetTeamKey: event.target.value === 'open' ? '' : current.targetTeamKey,
                              visibility: event.target.value,
                            }))
                          }
                          value={form.visibility}
                        >
                          <option value="targeted">Specific team challenge</option>
                          <option value="open">Open to club</option>
                        </select>
                      </label>
                      {form.visibility === 'targeted' ? (
                        <div className="field challenge-form__target">
                          <label>
                            <span>Team to challenge</span>
                            <select
                              onChange={(event) => setForm((current) => ({ ...current, targetTeamKey: event.target.value }))}
                              value={form.targetTeamKey}
                            >
                              <option value="">Choose team</option>
                              {eligibleTeams.map((eligibleTeam) => (
                                <option
                                  key={`${eligibleTeam.clubSlug}:${eligibleTeam.teamSlug}`}
                                  value={`${eligibleTeam.clubSlug}:${eligibleTeam.teamSlug}`}
                                >
                                  {eligibleTeam.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                    </div>
                    {form.visibility === 'targeted' && eligibleTeams.length === 0 ? (
                      <div className="notice notice--info challenge-form__hint">
                        No other approved teams are available in this club yet.
                      </div>
                    ) : null}
                  </div>

                  <div className="challenge-form__section">
                    <div className="challenge-form__section-copy">
                      <h3>When and where?</h3>
                      <p>Add proposed match details. Use TBD if captains still need to coordinate.</p>
                    </div>
                    <label className="checkbox-field challenge-form__tbd">
                      <input
                        checked={form.dateTbd}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            dateTbd: event.target.checked,
                            hour: event.target.checked ? '' : current.hour,
                            isoDate: event.target.checked ? '' : current.isoDate,
                            minute: event.target.checked ? '00' : current.minute,
                            period: event.target.checked ? 'AM' : current.period,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>
                        <strong>Date and time TBD</strong>
                        <small>Leave checked until captains confirm the match date.</small>
                      </span>
                    </label>
                    <div className="challenge-form__date-time-row">
                      <label className="field challenge-form__date">
                        <span>Game date</span>
                        <input
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              dateTbd: event.target.value ? false : current.dateTbd,
                              isoDate: event.target.value,
                            }))
                          }
                          type="date"
                          value={form.isoDate}
                        />
                      </label>
                      <div className="field challenge-form__time">
                        <span>Time</span>
                        <div className="challenge-time-selectors">
                          <select
                            disabled={form.dateTbd}
                            onChange={(event) => setForm((current) => ({ ...current, hour: event.target.value }))}
                            value={form.hour}
                          >
                            <option value="">Hour</option>
                            {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => (
                              <option key={hour} value={hour}>
                                {hour}
                              </option>
                            ))}
                          </select>
                          <select
                            disabled={form.dateTbd}
                            onChange={(event) => setForm((current) => ({ ...current, minute: event.target.value }))}
                            value={form.minute}
                          >
                            {['00', '15', '30', '45'].map((minute) => (
                              <option key={minute} value={minute}>
                                {minute}
                              </option>
                            ))}
                          </select>
                          <select
                            disabled={form.dateTbd}
                            onChange={(event) => setForm((current) => ({ ...current, period: event.target.value }))}
                            value={form.period}
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                      <label className="field challenge-form__players-needed">
                        <span>Players needed</span>
                        <select
                          onChange={(event) =>
                            setForm((current) => ({ ...current, playersNeeded: Number(event.target.value) }))
                          }
                          value={form.playersNeeded}
                        >
                          {[1, 2, 4, 6, 8].map((count) => (
                            <option key={count} value={count}>
                              {count}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="field challenge-form__location">
                      <span>Court(s)</span>
                      <input
                        onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                        placeholder="Optional, e.g. Courts 1-4 or TBD"
                        value={form.location}
                      />
                    </label>
                  </div>

                  <label className="field challenge-form__notes">
                    <span>Message to other captain</span>
                    <textarea
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Optional details, preferred format, or scheduling notes"
                      value={form.notes}
                    />
                  </label>
                  <div className="challenge-form__actions">
                    {editingChallengeId ? (
                      <button
                        className="button button--ghost"
                        disabled={saving}
                        onClick={handleCancelEditChallenge}
                        type="button"
                      >
                        Cancel Edit
                      </button>
                    ) : null}
                    <button className="button challenge-form__submit" disabled={challengeSubmitDisabled} type="submit">
                      {saving
                        ? editingChallengeId
                          ? 'Saving request...'
                          : 'Sending challenge...'
                        : editingChallengeId
                          ? 'Save Challenge'
                          : 'Send Challenge'}
                    </button>
                  </div>
                </form>
              </section>
            ) : (
              <div className="notice notice--info">
                Captains and co-captains can create or respond to club challenges.
              </div>
            )}

            <section className="schedule-admin-card">
              <div className="schedule-admin-card__header">
                <div>
                  <p className="eyebrow">Inbox</p>
                  <h2>Challenges received</h2>
                  <p>Respond to direct challenges from other captains.</p>
                </div>
              </div>
              {incomingChallenges.length > 0 ? (
                <div className="challenge-grid">
                  {incomingChallenges.map((challenge) =>
                    renderChallengeCard(
                      challenge,
                      canManage ? (
                        <>
                          <button
                            className="button"
                            disabled={updatingChallengeId === challenge.id}
                            onClick={() => handleAcceptChallenge(challenge)}
                            type="button"
                          >
                            {updatingChallengeId === challenge.id ? 'Accepting...' : 'Accept'}
                          </button>
                          <button
                            className="button button--ghost"
                            disabled={updatingChallengeId === challenge.id}
                            onClick={() => handleDeclineChallenge(challenge)}
                            type="button"
                          >
                            Decline
                          </button>
                        </>
                      ) : null,
                    ),
                  )}
                </div>
              ) : (
                <div className="notice notice--info">No direct challenges are waiting for this team.</div>
              )}
            </section>

            <section className="schedule-admin-card">
              <div className="schedule-admin-card__header">
                <div>
                  <p className="eyebrow">Sent</p>
                  <h2>Challenges sent</h2>
                  <p>Track direct challenges sent to other captains.</p>
                </div>
              </div>
              {postedChallenges.length > 0 ? (
                <>
                  <div className="availability-tabs" aria-label="Our challenge views">
                    <button
                      className={`availability-tabs__button ${postedChallengeTab === 'proposed' ? 'availability-tabs__button--active' : ''}`}
                      onClick={() => setPostedChallengeTab('proposed')}
                      type="button"
                    >
                      Proposed ({proposedPostedChallenges.length})
                    </button>
                    <button
                      className={`availability-tabs__button ${postedChallengeTab === 'accepted' ? 'availability-tabs__button--active' : ''}`}
                      onClick={() => setPostedChallengeTab('accepted')}
                      type="button"
                    >
                      Accepted ({acceptedPostedChallenges.length})
                    </button>
                    <button
                      className={`availability-tabs__button ${postedChallengeTab === 'closed' ? 'availability-tabs__button--active' : ''}`}
                      onClick={() => setPostedChallengeTab('closed')}
                      type="button"
                    >
                      Cancelled / Declined ({closedPostedChallenges.length})
                    </button>
                  </div>

                  {visiblePostedChallenges.length > 0 ? (
                    <div className="challenge-grid">
                      {visiblePostedChallenges.map((challenge) =>
                        renderChallengeCard(
                          challenge,
                          canManage && challenge.status === 'open' ? (
                            <>
                              <button
                                className="button"
                                disabled={updatingChallengeId === challenge.id}
                                onClick={() => handleEditChallenge(challenge)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className="button button--ghost"
                                disabled={updatingChallengeId === challenge.id}
                                onClick={() => handleCancelChallenge(challenge)}
                                type="button"
                              >
                                {updatingChallengeId === challenge.id ? 'Cancelling...' : 'Cancel Challenge'}
                              </button>
                            </>
                          ) : null,
                        ),
                      )}
                    </div>
                  ) : (
                    <div className="notice notice--info">
                      {postedChallengeTab === 'accepted'
                        ? 'No sent challenges have been accepted yet.'
                        : postedChallengeTab === 'closed'
                          ? 'No sent challenges have been cancelled or declined.'
                          : 'No proposed challenges are waiting to be accepted.'}
                    </div>
                  )}
                </>
              ) : (
                <div className="notice notice--info">This team has not sent any challenges yet.</div>
              )}
            </section>

            <section className="schedule-admin-card">
              <div className="schedule-admin-card__header">
                <div>
                  <p className="eyebrow">Directory</p>
                  <h2>Open club challenges</h2>
                  <p>Browse open club-wide challenges that your team can accept.</p>
                </div>
              </div>
              {clubChallenges.length > 0 ? (
                <div className="challenge-grid">
                  {clubChallenges.map((challenge) =>
                    renderChallengeCard(
                      challenge,
                      canManage ? (
                        <button
                          className="button"
                          disabled={updatingChallengeId === challenge.id}
                          onClick={() => handleAcceptChallenge(challenge)}
                          type="button"
                        >
                          {updatingChallengeId === challenge.id ? 'Accepting...' : 'Accept Challenge'}
                        </button>
                      ) : null,
                    ),
                  )}
                </div>
              ) : (
                <div className="notice notice--info">No open club challenges exist right now.</div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

export function SettingsPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [approvedClubTeams, setApprovedClubTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [requestingAffiliation, setRequestingAffiliation] = useState(false);
  const [creatingCrop, setCreatingCrop] = useState(false);
  const [updatingUid, setUpdatingUid] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(createEmptyTeamSettingsForm());
  const [requestedClubSlug, setRequestedClubSlug] = useState('');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [cropImageSrc, setCropImageSrc] = useState('');
  const [cropFileName, setCropFileName] = useState('team-logo.webp');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState(null);

  const canManage = canManageRole(membership?.role);
  const canManageMembership = isCaptainRole(membership?.role);
  const clubOptions = clubs.filter((club) => club.slug !== 'independent');
  const playerMap = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const displayedLogoUrl = logoPreviewUrl || team?.logoUrl || defaultTeamLogo;
  const isTeamArchived = team?.status === 'archived';
  const canManageActiveTeam = canManage && !isTeamArchived;
  const hasUnsavedLogo = Boolean(form.logoFile);
  const inviteLink = team?.joinCode
    ? `${window.location.origin}${window.location.pathname}#/join?code=${encodeURIComponent(team.joinCode)}`
    : '';
  const affiliatedClubName =
    clubs.find((club) => club.slug === team?.approvedClubSlug)?.name ?? team?.approvedClubSlug ?? '';

  function replaceLogoPreview(nextUrl) {
    setLogoPreviewUrl((current) => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current);
      }

      return nextUrl;
    });
  }

  function clearCropper() {
    setCropImageSrc('');
    setCropFileName('team-logo.webp');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropPixels(null);
    setCreatingCrop(false);
  }

  async function loadSettingsData() {
    const [teamData, memberData, playerData, membershipData, clubData] = await Promise.all([
      getTeam(clubSlug, teamSlug),
      listTeamMembers(clubSlug, teamSlug),
      listPlayers(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
      listClubs(),
    ]);

    setTeam(teamData);
    setClubs(clubData);
    setMembers(memberData);
    setPlayers(playerData);
    setMembership(membershipData);
    setForm(createEmptyTeamSettingsForm(teamData ?? {}));
    setRequestedClubSlug(
      teamData?.affiliationStatus === 'pending'
        ? teamData?.requestedClubSlug || ''
        : teamData?.affiliationStatus === 'approved'
          ? teamData?.approvedClubSlug || ''
          : '',
    );
    replaceLogoPreview('');

    if (teamData?.approvedClubSlug && teamData.affiliationStatus === 'approved') {
      listApprovedClubTeams(teamData.approvedClubSlug)
        .then((approvedTeams) => {
          setApprovedClubTeams(approvedTeams.filter((clubTeam) => clubTeam.teamSlug !== teamSlug));
        })
        .catch(() => {
          setApprovedClubTeams([]);
        });
    } else {
      setApprovedClubTeams([]);
    }
  }

  useEffect(() => {
    loadSettingsData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load team settings yet.');
    });
  }, [clubSlug, teamSlug, user?.uid]);

  useEffect(
    () => () => {
      if (logoPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    },
    [logoPreviewUrl],
  );

  async function handleLogoSelection(event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file) {
      return;
    }

    setError('');
    setMessage('');

    try {
      const nextCropSource = await readFileAsDataUrl(file);
      setCropImageSrc(nextCropSource);
      setCropFileName(file.name || 'team-logo.webp');
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCropPixels(null);
    } catch (selectionError) {
      setError(selectionError.message ?? 'That logo file could not be read as an image.');
    }
  }

  async function handleApplyCrop() {
    if (!cropImageSrc || !cropPixels) {
      setError('Move and zoom the logo before applying the crop.');
      return;
    }

    setCreatingCrop(true);
    setError('');
    setMessage('');

    try {
      const croppedFile = await createCroppedSquareImageFile(cropImageSrc, cropPixels, cropFileName);
      setForm((current) => ({ ...current, logoFile: croppedFile }));
      replaceLogoPreview(URL.createObjectURL(croppedFile));
      clearCropper();
      setMessage('Logo crop ready. Save settings to publish it.');
    } catch (cropError) {
      setError(cropError.message ?? 'Unable to crop that logo.');
    } finally {
      setCreatingCrop(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await updateTeamSettings({
        clubSlug,
        logoFile: form.logoFile,
        teamDivision: form.teamDivision,
        teamName: form.teamName,
        teamSlug,
        user,
      });
      setMessage('Team settings saved.');
      await loadSettingsData();
      window.dispatchEvent(new Event('team-updated'));
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save team settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRotateJoinCode() {
    setRotating(true);
    setError('');
    setMessage('');

    try {
      const nextJoinCode = await rotateTeamJoinCode({ clubSlug, teamSlug });
      setMessage(`Join code rotated to ${nextJoinCode}.`);
      await loadSettingsData();
    } catch (rotateError) {
      setError(rotateError.message ?? 'Unable to rotate the join code.');
    } finally {
      setRotating(false);
    }
  }

  async function handleRequestClubAffiliation() {
    setRequestingAffiliation(true);
    setError('');
    setMessage('');

    try {
      await requestClubAffiliation({
        clubSlug,
        requestedClubSlug,
        teamSlug,
        user,
      });
      setMessage('Club affiliation request submitted.');
      await loadSettingsData();
      window.dispatchEvent(new Event('team-updated'));
    } catch (requestError) {
      setError(requestError.message ?? 'Unable to request club affiliation.');
    } finally {
      setRequestingAffiliation(false);
    }
  }

  async function handleCopyInviteLink() {
    if (!team?.joinCode) {
      setError('No join code is available yet.');
      setMessage('');
      return;
    }

    setError('');
    setMessage('');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = inviteLink;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setMessage('Invite link copied. Send it to players so they can join this team.');
    } catch (copyError) {
      setError(copyError.message ?? 'Unable to copy the invite link.');
    }
  }

  async function handleRoleChange(memberRecord, nextRole) {
    setUpdatingUid(memberRecord.uid);
    setError('');
    setMessage('');

    try {
      await updateTeamMemberRole({
        clubSlug,
        role: nextRole,
        targetUid: memberRecord.uid,
        teamSlug,
      });
      setMessage(
        `${memberRecord.uid === user?.uid ? 'Your' : 'Member'} role updated to ${formatRoleLabel(nextRole).toLowerCase()}.`,
      );
      await loadSettingsData();
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to update that team role.');
    } finally {
      setUpdatingUid('');
    }
  }

  async function handleArchiveTeam() {
    const confirmed = window.confirm(
      `Archive ${team?.name || 'this team'}? Players will no longer use this as an active team, and new joins will be disabled. Team history will be kept.`,
    );

    if (!confirmed) {
      return;
    }

    setArchiving(true);
    setError('');
    setMessage('');

    try {
      await archiveTeam({
        clubSlug,
        teamSlug,
        user,
      });
      setMessage('Team archived. Roster, news, and match history are kept for records.');
      await loadSettingsData();
      window.dispatchEvent(new Event('team-updated'));
    } catch (archiveError) {
      setError(archiveError.message ?? 'Unable to archive this team.');
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="page-grid schedule-admin-page settings-admin-page">
      <section className="card">
        <div className="settings-admin-header">
          <div>
            <p className="eyebrow">Admin tools</p>
            <h1>Team Settings</h1>
            <p>
              Manage team branding, join code settings, and member roles from one shared admin workspace.
            </p>
          </div>
          <span className="settings-admin-member-pill">{members.length} Members</span>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        <div className="settings-admin-overview">
          <div className="detail-grid">
            <div className="detail-card settings-admin-join-card">
              <div className="settings-admin-join-copy">
                <p className="eyebrow">Invite Players</p>
                <h2>Send this link to teammates</h2>
                <p>
                  Players can use the invite link or enter the join code on the Join Team page. New players will appear
                  in Manage Players after they join.
                </p>
              </div>
              <div className="settings-admin-invite-details">
                <div className="settings-admin-invite-row">
                  <span>Join code</span>
                  <div className="settings-admin-invite-control">
                    <strong>{team?.joinCode ?? 'Not available yet'}</strong>
                    {canManageActiveTeam ? (
                      <button
                        className="button button--ghost settings-admin-join-action"
                        disabled={rotating}
                        onClick={handleRotateJoinCode}
                        type="button"
                      >
                        {rotating ? 'Changing code...' : 'Change Join Code'}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="settings-admin-invite-row">
                  <span>Invite link</span>
                  <div className="settings-admin-invite-control settings-admin-invite-control--link">
                    <code>{inviteLink || 'Not available yet'}</code>
                    {canManageActiveTeam ? (
                      <button
                        className="button settings-admin-join-action"
                        disabled={!team?.joinCode}
                        onClick={handleCopyInviteLink}
                        type="button"
                      >
                        Copy Invite Link
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="schedule-admin-layout settings-admin-layout">
        <section className="schedule-admin-card">
          <div className="schedule-admin-card__header">
            <div>
              <p className="eyebrow">Profile</p>
              <h2>{team?.name ? `${team.name} Profile` : 'Team Profile'}</h2>
              <p>Upload your own custom logo and set your team division.</p>
            </div>
          </div>

          {canManageActiveTeam ? (
            <form className="schedule-admin-form settings-admin-form" onSubmit={handleSubmit}>
              <div className="settings-admin-branding-grid">
                <div className="settings-admin-branding-preview">
                  <p className="eyebrow">Current logo</p>
                  <img
                    alt={`${team?.name ?? 'Team'} logo`}
                    className="settings-admin-logo-preview"
                    src={displayedLogoUrl}
                  />
                  <label className="button button--ghost settings-admin-form__file-button">
                    <input accept="image/*" className="settings-admin-form__file-input" onChange={handleLogoSelection} type="file" />
                    Change Logo
                  </label>
                  {hasUnsavedLogo ? (
                    <p className="settings-admin-unsaved-logo">New logo selected. Save settings to publish it.</p>
                  ) : null}
                </div>
                <div className="settings-admin-branding-fields">
                  <label className="field">
                    <span>Team name</span>
                    <input
                      onChange={(event) => setForm((current) => ({ ...current, teamName: event.target.value }))}
                      value={form.teamName}
                    />
                  </label>
                  <label className="field">
                    <span>Team division</span>
                    <span className="team-division-field">
                      <select
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            teamDivision: event.target.value,
                          }))
                        }
                        value={form.teamDivision}
                      >
                        {TEAM_DIVISION_OPTIONS.map((option) => (
                          <option key={option.value || 'not-set'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <TeamDivisionLabel
                        className="team-division-field__symbol"
                        showLabel={false}
                        value={form.teamDivision}
                      />
                    </span>
                  </label>
                  <button className="button settings-admin-save-button" disabled={saving} type="submit">
                    {saving ? 'Saving settings...' : hasUnsavedLogo ? 'Save Settings & Publish Logo' : 'Save Settings'}
                  </button>
                </div>
                <div className="settings-admin-logo-prompt">
                  <strong>Need help with a team logo?</strong>
                  <p>Copy and paste this into ChatGPT or your favorite AI image generator.</p>
                  <pre>{`Create a square team logo image for a pickleball team named "${form.teamName || 'Team Name'}". Use a bold sports logo style, clean vector look, strong contrast, a simple dark background behind the logo, and make it readable as a small app icon. Avoid transparent backgrounds, tiny text, and photo-realistic details.`}</pre>
                </div>
              </div>
            </form>
          ) : isTeamArchived ? (
            <div className="notice notice--info">
              This team is archived, so active team profile settings are locked.
            </div>
          ) : (
            <div className="notice notice--info">
              Captains and co-captains can edit team settings. Your current role is{' '}
              <strong>{membership?.role ?? 'member'}</strong>.
            </div>
          )}
        </section>

        <section className="schedule-admin-card">
          <div className="schedule-admin-card__header">
            <div>
              <p className="eyebrow">Club affiliation</p>
              <h2>{team?.affiliationStatus === 'approved' ? 'Connected to your club' : 'Affiliate Your Team to a Club'}</h2>
              <p>
                {team?.affiliationStatus === 'approved'
                  ? 'This team is listed with its club and can be found by other club teams.'
                  : (
                    <>
                      If your team is a member of a club within the PKL Universe, select the club and click &quot;Request Club
                      Affiliation.&quot; If your club is not listed, send an email to{' '}
                      <a href="mailto:demandgendave@gmail.com?subject=Add%20my%20club%20to%20PKL%20Universe">
                        demandgendave@gmail.com
                      </a>{' '}
                      to have your club added.
                    </>
                  )}
              </p>
            </div>
          </div>

          {team?.affiliationStatus === 'approved' ? (
            <div className="settings-club-status settings-club-status--approved">
              <div>
                <span className="status-badge status-badge--active">Approved</span>
                <h3>{affiliatedClubName || 'Approved club'}</h3>
                <p>
                  Your team is visible in this club.{' '}
                  {approvedClubTeams.length
                    ? `${approvedClubTeams.length} other team${approvedClubTeams.length === 1 ? '' : 's'} can be challenged.`
                    : 'No other approved teams are in this club yet.'}
                </p>
              </div>
            </div>
          ) : canManageActiveTeam ? (
            <div className="schedule-admin-form settings-admin-form">
              <label className="field">
                <span>Choose your club</span>
                <select
                  disabled={team?.affiliationStatus === 'pending'}
                  onChange={(event) => setRequestedClubSlug(event.target.value)}
                  value={requestedClubSlug}
                >
                  <option value="">Select your club</option>
                  {!clubOptions.length ? <option value="">No clubs available yet</option> : null}
                  {clubOptions.map((club) => (
                    <option key={club.slug} value={club.slug}>
                      {club.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button"
                disabled={
                  requestingAffiliation ||
                  !requestedClubSlug ||
                  team?.affiliationStatus === 'pending' ||
                  team?.approvedClubSlug === requestedClubSlug
                }
                onClick={handleRequestClubAffiliation}
                type="button"
              >
                {requestingAffiliation ? 'Sending request...' : 'Request Club Affiliation'}
              </button>
              {team?.affiliationStatus === 'pending' ? (
                <div className="notice notice--info">
                  Request sent. A PKL Universe admin or club admin will review it.
                </div>
              ) : null}
            </div>
          ) : isTeamArchived ? (
            <div className="notice notice--info">
              Archived teams cannot request or change club affiliation.
            </div>
          ) : (
            <div className="notice notice--info">
              Captains and co-captains can request club affiliation for this team.
            </div>
          )}
        </section>

        <section className="schedule-admin-card">
          <div className="schedule-admin-card__header">
            <div>
              <p className="eyebrow">Member access</p>
              <h2>Team roles</h2>
              <p>Review memberships and promote or demote co-captains from the same admin page.</p>
            </div>
          </div>

          {members.length > 0 ? (
            <div className="entity-list settings-admin-members">
              {members.map((memberRecord) => {
                const player = playerMap.get(memberRecord.playerId);
                const displayName = player?.fullName || player?.email || memberRecord.uid;
                const secondary = player?.email || memberRecord.uid;
                const canEdit =
                  canManageMembership &&
                  memberRecord.role !== 'captain' &&
                  memberRecord.uid !== user?.uid;

                return (
                  <div key={memberRecord.uid} className={`member-role-card member-role-card--${memberRecord.role}`}>
                    <div className="member-role-card__avatar">{buildPlayerInitials(displayName)}</div>
                    <div className="member-role-card__body">
                      <div className="member-admin__header">
                        <div className="member-role-card__identity">
                          <strong>{displayName}</strong>
                          <span>{secondary}</span>
                        </div>
                        <span className={`status-badge member-role-card__badge member-role-card__badge--${memberRecord.role}`}>
                          {formatRoleLabel(memberRecord.role)}
                        </span>
                      </div>

                      <p className="member-role-card__description">
                        {memberRecord.role === 'captain'
                          ? 'Primary team owner with full captain controls.'
                          : memberRecord.role === 'coCaptain'
                            ? 'Can help manage roster, schedule, player info, news, settings, and challenges.'
                            : 'Standard player access for team pages, availability, schedule, news, and standings.'}
                      </p>

                      {canEdit ? (
                        <div className="member-role-card__actions" aria-label={`Change role for ${displayName}`}>
                          <button
                            className={`choice-button ${memberRecord.role === 'member' ? 'choice-button--active' : ''}`}
                            disabled={updatingUid === memberRecord.uid}
                            onClick={() => handleRoleChange(memberRecord, 'member')}
                            type="button"
                          >
                            {updatingUid === memberRecord.uid && memberRecord.role === 'coCaptain'
                              ? 'Saving...'
                              : 'Member'}
                          </button>
                          <button
                            className={`choice-button ${memberRecord.role === 'coCaptain' ? 'choice-button--active' : ''}`}
                            disabled={updatingUid === memberRecord.uid}
                            onClick={() => handleRoleChange(memberRecord, 'coCaptain')}
                            type="button"
                          >
                            {updatingUid === memberRecord.uid && memberRecord.role === 'member'
                              ? 'Saving...'
                              : 'Co-captain'}
                          </button>
                        </div>
                      ) : (
                        <div className="member-role-card__locked">
                          {memberRecord.role === 'captain'
                            ? 'Locked primary captain'
                            : canManageMembership
                              ? 'You cannot change your own role here'
                              : 'Only the captain can change team roles'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p>No team members found yet.</p>
          )}
        </section>

        <section className="schedule-admin-card settings-admin-lifecycle-card">
          <div className="schedule-admin-card__header">
            <div>
              <p className="eyebrow">Team lifecycle</p>
              <h2>Archive team</h2>
              <p>
                Archive this team when it is no longer active. Archived teams are hidden from active team lists and
                cannot accept new joins, but roster, news, and match history are kept for records.
              </p>
            </div>
          </div>

          {isTeamArchived ? (
            <div className="notice notice--info">
              This team is archived. Its history is retained, but it is no longer available for new joins.
            </div>
          ) : canManage ? (
            <button className="button button--danger" disabled={archiving} onClick={handleArchiveTeam} type="button">
              {archiving ? 'Archiving team...' : 'Archive Team'}
            </button>
          ) : (
            <div className="notice notice--info">
              Captains and co-captains can archive this team when it is no longer active.
            </div>
          )}
        </section>
      </div>

      {cropImageSrc ? (
        <div className="logo-cropper" role="dialog" aria-modal="true" aria-label="Crop team logo">
          <button
            aria-label="Close logo cropper"
            className="logo-cropper__backdrop"
            onClick={clearCropper}
            type="button"
          />
          <aside className="logo-cropper__panel">
            <div className="logo-cropper__header">
              <div>
                <p className="eyebrow">Crop logo</p>
                <h2>Square logo crop</h2>
                <p className="logo-cropper__copy">
                  Reposition the image and zoom until the logo fits well inside the square preview.
                </p>
              </div>
              <button className="button button--ghost" onClick={clearCropper} type="button">
                Cancel
              </button>
            </div>

            <div className="logo-cropper__workspace">
              <div className="logo-cropper__canvas">
                <Cropper
                  aspect={1}
                  crop={crop}
                  image={cropImageSrc}
                  onCropChange={setCrop}
                  onCropComplete={(_, croppedAreaPixels) => setCropPixels(croppedAreaPixels)}
                  onZoomChange={setZoom}
                  showGrid={false}
                  zoom={zoom}
                />
              </div>

              <label className="field logo-cropper__zoom">
                <span>Zoom</span>
                <input
                  max="3"
                  min="1"
                  onChange={(event) => setZoom(Number(event.target.value))}
                  step="0.01"
                  type="range"
                  value={zoom}
                />
              </label>
            </div>

            <div className="settings-admin-form__actions">
              <button className="button" disabled={creatingCrop} onClick={handleApplyCrop} type="button">
                {creatingCrop ? 'Preparing crop...' : 'Use cropped logo'}
              </button>
              <button className="button button--ghost" onClick={clearCropper} type="button">
                Cancel
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export function ClubAffiliationAdminPage() {
  const { loading: authLoading, signOutUser, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState([]);
  const [clubForm, setClubForm] = useState(createEmptyClubForm());
  const [clubDrafts, setClubDrafts] = useState({});
  const [requests, setRequests] = useState([]);
  const [adminTeams, setAdminTeams] = useState([]);
  const [adminChallenges, setAdminChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingClub, setCreatingClub] = useState(false);
  const [updatingClubSlug, setUpdatingClubSlug] = useState('');
  const [deletingChallengeId, setDeletingChallengeId] = useState('');
  const [deletingTeamId, setDeletingTeamId] = useState('');
  const [updatingRequestId, setUpdatingRequestId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [adminSection, setAdminSection] = useState('teams');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [playerCopyForm, setPlayerCopyForm] = useState(createEmptyPlayerCopyForm());
  const [adminPlayers, setAdminPlayers] = useState([]);
  const [loadingAdminPlayers, setLoadingAdminPlayers] = useState(false);
  const [copyingPlayers, setCopyingPlayers] = useState(false);
  const [updatingTeamLogoId, setUpdatingTeamLogoId] = useState('');
  const [teamLogoCropTarget, setTeamLogoCropTarget] = useState(null);
  const [teamLogoCropImageSrc, setTeamLogoCropImageSrc] = useState('');
  const [teamLogoCropFileName, setTeamLogoCropFileName] = useState('team-logo.webp');
  const [teamLogoCrop, setTeamLogoCrop] = useState({ x: 0, y: 0 });
  const [teamLogoZoom, setTeamLogoZoom] = useState(1);
  const [teamLogoCropPixels, setTeamLogoCropPixels] = useState(null);
  const [creatingTeamLogoCrop, setCreatingTeamLogoCrop] = useState(false);
  const [clubCropTarget, setClubCropTarget] = useState(null);
  const [clubCropImageSrc, setClubCropImageSrc] = useState('');
  const [clubCropFileName, setClubCropFileName] = useState('club-logo.webp');
  const [clubCrop, setClubCrop] = useState({ x: 0, y: 0 });
  const [clubZoom, setClubZoom] = useState(1);
  const [clubCropPixels, setClubCropPixels] = useState(null);
  const [creatingClubCrop, setCreatingClubCrop] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  async function loadAdminData() {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user?.uid) {
      setClubs([]);
      setRequests([]);
      setAdminTeams([]);
      setAdminChallenges([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const platformAdmin = await isPlatformAdmin(user.uid, user.email);

      if (!platformAdmin) {
        setIsAuthorized(false);
        setClubs([]);
        setRequests([]);
        setAdminTeams([]);
        setAdminChallenges([]);
        setError('');
        return;
      }

      setIsAuthorized(true);
      const [clubData, requestData, teamData, challengeData] = await Promise.all([
        listClubs(),
        listClubAffiliationRequests(user),
        listAdminTeamSummaries(user),
        listAdminChallenges(user),
      ]);

      setClubs(clubData);
      setClubDrafts(
        clubData.reduce((drafts, club) => {
          drafts[club.slug] = createEmptyClubForm(club);
          return drafts;
        }, {}),
      );
      setRequests(requestData);
      setAdminTeams(teamData);
      setAdminChallenges(challengeData);
    } catch (loadError) {
      setError(loadError.message ?? 'Unable to load admin data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, [authLoading, user?.uid]);

  useEffect(() => {
    if (!adminMenuOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setAdminMenuOpen(false);
      }
    }

    document.body.classList.add('hub-nav-open');
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('hub-nav-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [adminMenuOpen]);

  const clubSummaries = useMemo(
    () =>
      clubs.map((club) => {
        const approvedTeamCount = adminTeams.filter((teamSummary) => teamSummary.approvedClubSlug === club.slug).length;
        const pendingRequestCount = requests.filter(
          (request) => request.requestedClubSlug === club.slug && request.status === 'pending',
        ).length;

        return {
          ...club,
          approvedTeamCount,
          pendingRequestCount,
        };
      }),
    [adminTeams, clubs, requests],
  );

  const playerCopyTeamOptions = useMemo(
    () =>
      adminTeams
        .map((team) => ({
          key: `${team.clubSlug}::${team.teamSlug}`,
          label: `${team.name} (${team.clubName})`,
          team,
        }))
        .sort((first, second) => first.label.localeCompare(second.label)),
    [adminTeams],
  );

  const filteredAdminPlayers = useMemo(() => {
    const searchText = playerCopyForm.searchText.trim().toLowerCase();

    if (!searchText) {
      return adminPlayers;
    }

    return adminPlayers.filter((player) =>
      [
        player.fullName,
        player.email,
        player.phone,
        player.sourceTeamName,
        player.sourceClubName,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(searchText)),
    );
  }, [adminPlayers, playerCopyForm.searchText]);
  const selectedPlayerCount = playerCopyForm.playerKeys.length;
  const filteredSelectedPlayerCount = filteredAdminPlayers.filter((player) =>
    playerCopyForm.playerKeys.includes(player.assignmentKey),
  ).length;
  const playerCopyTargetTeam = parsePlayerCopyTeamKey(playerCopyForm.targetTeamKey);

  useEffect(() => {
    if (!playerCopyTeamOptions.length || playerCopyForm.targetTeamKey) {
      return;
    }

    setPlayerCopyForm((current) => ({
      ...current,
      targetTeamKey: playerCopyTeamOptions[0]?.key ?? '',
    }));
  }, [playerCopyForm.targetTeamKey, playerCopyTeamOptions]);

  useEffect(() => {
    let ignore = false;

    async function loadAdminPlayers() {
      if (!user?.uid || !isAuthorized) {
        setAdminPlayers([]);
        return;
      }

      setLoadingAdminPlayers(true);
      setError('');

      try {
        const players = await listAdminPlayers(user);

        if (!ignore) {
          setAdminPlayers(players);
          setPlayerCopyForm((current) => ({
            ...current,
            playerKeys: current.playerKeys.filter((playerKey) =>
              players.some((player) => player.assignmentKey === playerKey),
            ),
          }));
        }
      } catch (loadPlayersError) {
        if (!ignore) {
          setAdminPlayers([]);
          setError(loadPlayersError.message ?? 'Unable to load players.');
        }
      } finally {
        if (!ignore) {
          setLoadingAdminPlayers(false);
        }
      }
    }

    loadAdminPlayers();

    return () => {
      ignore = true;
    };
  }, [isAuthorized, user?.uid]);

  function parsePlayerCopyTeamKey(teamKey) {
    const [clubSlug = '', teamSlug = ''] = teamKey.split('::');

    return { clubSlug, teamSlug };
  }

  function updatePlayerCopyForm(field, value) {
    setPlayerCopyForm((current) => ({
      ...current,
      [field]: value,
    }));
    setMessage('');
    setError('');
  }

  function togglePlayerCopySelection(playerKey) {
    setPlayerCopyForm((current) => {
      const isSelected = current.playerKeys.includes(playerKey);

      return {
        ...current,
        playerKeys: isSelected
          ? current.playerKeys.filter((selectedPlayerKey) => selectedPlayerKey !== playerKey)
          : [...current.playerKeys, playerKey],
      };
    });
    setMessage('');
    setError('');
  }

  function setAllPlayerCopySelections(checked) {
    setPlayerCopyForm((current) => ({
      ...current,
      playerKeys: checked ? filteredAdminPlayers.map((player) => player.assignmentKey) : [],
    }));
    setMessage('');
    setError('');
  }

  function parsePlayerAssignmentKey(playerKey) {
    const [sourceClubSlug = '', sourceTeamSlug = '', playerId = ''] = playerKey.split('::');

    return { playerId, sourceClubSlug, sourceTeamSlug };
  }

  async function handleCopyPlayersSubmit(event) {
    event.preventDefault();

    if (copyingPlayers) {
      return;
    }

    setCopyingPlayers(true);
    setMessage('');
    setError('');

    try {
      const result = await assignPlayersToTeamAsAdmin({
        playerRefs: playerCopyForm.playerKeys.map(parsePlayerAssignmentKey),
        targetClubSlug: playerCopyTargetTeam.clubSlug,
        targetTeamSlug: playerCopyTargetTeam.teamSlug,
        user,
      });
      const unlinkedCopy =
        result.unlinkedCount > 0
          ? ` ${result.unlinkedCount} assigned player${result.unlinkedCount === 1 ? '' : 's'} did not have a linked login, so only the player profile was copied.`
          : '';
      const skippedCopy =
        result.alreadyOnTargetCount > 0
          ? ` ${result.alreadyOnTargetCount} player${result.alreadyOnTargetCount === 1 ? ' was' : 's were'} already on the target team.`
          : '';

      setMessage(
        `Assigned ${result.assignedCount} player${result.assignedCount === 1 ? '' : 's'} to the target team.${unlinkedCopy}${skippedCopy}`,
      );
      setPlayerCopyForm((current) => ({ ...current, playerKeys: [] }));
      const players = await listAdminPlayers(user);
      setAdminPlayers(players);
      await loadAdminData();
    } catch (copyError) {
      setError(copyError.message ?? 'Unable to assign selected players.');
    } finally {
      setCopyingPlayers(false);
    }
  }

  function getTeamLogoUpdateKey(teamSummary) {
    return `${teamSummary.clubSlug}-${teamSummary.teamSlug}`;
  }

  function clearTeamLogoCropper() {
    setTeamLogoCropTarget(null);
    setTeamLogoCropImageSrc('');
    setTeamLogoCropFileName('team-logo.webp');
    setTeamLogoCrop({ x: 0, y: 0 });
    setTeamLogoZoom(1);
    setTeamLogoCropPixels(null);
    setCreatingTeamLogoCrop(false);
  }

  async function handleTeamLogoSelection(teamSummary, event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file) {
      return;
    }

    setError('');
    setMessage('');

    try {
      const nextCropSource = await readFileAsDataUrl(file);
      setTeamLogoCropTarget(teamSummary);
      setTeamLogoCropImageSrc(nextCropSource);
      setTeamLogoCropFileName(file.name || 'team-logo.webp');
      setTeamLogoCrop({ x: 0, y: 0 });
      setTeamLogoZoom(1);
      setTeamLogoCropPixels(null);
    } catch (selectionError) {
      setError(selectionError.message ?? 'That logo file could not be read as an image.');
    }
  }

  async function handleApplyTeamLogoCrop() {
    if (!teamLogoCropTarget || !teamLogoCropImageSrc || !teamLogoCropPixels) {
      setError('Move and zoom the team logo before applying the crop.');
      return;
    }

    const updateKey = getTeamLogoUpdateKey(teamLogoCropTarget);
    setCreatingTeamLogoCrop(true);
    setUpdatingTeamLogoId(updateKey);
    setError('');
    setMessage('');

    try {
      const croppedFile = await createCroppedSquareImageFile(
        teamLogoCropImageSrc,
        teamLogoCropPixels,
        teamLogoCropFileName,
      );

      await updateTeamLogoAsAdmin({
        clubSlug: teamLogoCropTarget.clubSlug,
        logoFile: croppedFile,
        teamSlug: teamLogoCropTarget.teamSlug,
        user,
      });

      setMessage(`${teamLogoCropTarget.name} logo updated.`);
      clearTeamLogoCropper();
      await loadAdminData();
    } catch (cropError) {
      setError(cropError.message ?? 'Unable to update that team logo.');
    } finally {
      setCreatingTeamLogoCrop(false);
      setUpdatingTeamLogoId('');
    }
  }

  function clearClubCropper() {
    setClubCropTarget(null);
    setClubCropImageSrc('');
    setClubCropFileName('club-logo.webp');
    setClubCrop({ x: 0, y: 0 });
    setClubZoom(1);
    setClubCropPixels(null);
    setCreatingClubCrop(false);
  }

  function revokeClubPreview(previewUrl) {
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
  }

  function updateClubDraft(clubSlug, updater) {
    setClubDrafts((current) => {
      const currentDraft = current[clubSlug] ?? createEmptyClubForm(clubs.find((club) => club.slug === clubSlug));

      return {
        ...current,
        [clubSlug]: updater(currentDraft),
      };
    });
  }

  async function handleClubLogoSelection(target, event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file) {
      return;
    }

    setError('');
    setMessage('');

    try {
      const nextCropSource = await readFileAsDataUrl(file);
      setClubCropTarget(target);
      setClubCropImageSrc(nextCropSource);
      setClubCropFileName(file.name || 'club-logo.webp');
      setClubCrop({ x: 0, y: 0 });
      setClubZoom(1);
      setClubCropPixels(null);
    } catch (selectionError) {
      setError(selectionError.message ?? 'That logo file could not be read as an image.');
    }
  }

  async function handleApplyClubLogoCrop() {
    if (!clubCropTarget || !clubCropImageSrc || !clubCropPixels) {
      setError('Move and zoom the logo before applying the crop.');
      return;
    }

    setCreatingClubCrop(true);
    setError('');
    setMessage('');

    try {
      const croppedFile = await createCroppedSquareImageFile(clubCropImageSrc, clubCropPixels, clubCropFileName);
      const previewUrl = URL.createObjectURL(croppedFile);

      if (clubCropTarget === 'create') {
        setClubForm((current) => {
          revokeClubPreview(current.logoPreviewUrl);
          return { ...current, logoFile: croppedFile, logoPreviewUrl: previewUrl };
        });
      } else {
        updateClubDraft(clubCropTarget, (current) => {
          revokeClubPreview(current.logoPreviewUrl);
          return { ...current, logoFile: croppedFile, logoPreviewUrl: previewUrl };
        });
      }

      clearClubCropper();
      setMessage('Club logo crop ready. Save the club to publish it.');
    } catch (cropError) {
      setError(cropError.message ?? 'Unable to crop that logo.');
    } finally {
      setCreatingClubCrop(false);
    }
  }

  async function handleCreateClub(event) {
    event.preventDefault();
    setCreatingClub(true);
    setError('');
    setMessage('');

    try {
      const club = await createClub({ ...clubForm, user });
      revokeClubPreview(clubForm.logoPreviewUrl);
      setClubForm(createEmptyClubForm());
      setMessage(`${club.name} created.`);
      await loadAdminData();
    } catch (createError) {
      setError(createError.message ?? 'Unable to create that club.');
    } finally {
      setCreatingClub(false);
    }
  }

  async function handleRenameClub(club) {
    setUpdatingClubSlug(club.slug);
    setError('');
    setMessage('');

    try {
      await renameClub({
        ...(clubDrafts[club.slug] ?? createEmptyClubForm(club)),
        clubSlug: club.slug,
        user,
      });
      revokeClubPreview(clubDrafts[club.slug]?.logoPreviewUrl);
      setMessage(`${clubDrafts[club.slug]?.clubName ?? club.name} updated.`);
      await loadAdminData();
    } catch (renameError) {
      setError(renameError.message ?? 'Unable to rename that club.');
    } finally {
      setUpdatingClubSlug('');
    }
  }

  async function handleDeleteClub(club) {
    const confirmed = window.confirm(
      `Delete ${club.name}? This only works for clubs with no teams.`,
    );

    if (!confirmed) {
      return;
    }

    setUpdatingClubSlug(club.slug);
    setError('');
    setMessage('');

    try {
      await deleteClub({
        clubSlug: club.slug,
        user,
      });
      setMessage(`${club.name} deleted.`);
      await loadAdminData();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Unable to delete that club.');
    } finally {
      setUpdatingClubSlug('');
    }
  }

  async function handleReview(request, status) {
    setUpdatingRequestId(request.id);
    setError('');
    setMessage('');

    try {
      await reviewClubAffiliationRequest({
        request,
        status,
        user,
      });
      setMessage(`${request.teamName || request.teamSlug} ${status}.`);
      await loadAdminData();
    } catch (reviewError) {
      setError(reviewError.message ?? 'Unable to review that affiliation request.');
    } finally {
      setUpdatingRequestId('');
    }
  }

  async function handleDeleteChallenge(challenge) {
    const confirmed = window.confirm(
      `Delete challenge from ${challenge.createdByTeamName || challenge.createdByTeamSlug}? Accepted challenge schedule matchups will also be removed.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingChallengeId(challenge.id);
    setError('');
    setMessage('');

    try {
      await deleteChallengeAsAdmin({
        challengeClubSlug: challenge.challengeClubSlug,
        challengeId: challenge.id,
        user,
      });
      setMessage('Challenge deleted.');
      await loadAdminData();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Unable to delete that challenge.');
    } finally {
      setDeletingChallengeId('');
    }
  }

  async function handleDeleteTeam(teamSummary) {
    const confirmed = window.confirm(
      `Delete ${teamSummary.name}? This removes the team, roster, players, news, team-owned schedule, membership links, affiliation requests, and challenges involving this team. Other teams' saved matchups against this team will stay.`,
    );

    if (!confirmed) {
      return;
    }

    const deleteKey = `${teamSummary.clubSlug}-${teamSummary.teamSlug}`;
    setDeletingTeamId(deleteKey);
    setError('');
    setMessage('');

    try {
      await deleteTeamAsAdmin({
        clubSlug: teamSummary.clubSlug,
        teamSlug: teamSummary.teamSlug,
        user,
      });
      setMessage(`${teamSummary.name} deleted.`);
      await loadAdminData();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Unable to delete that team.');
    } finally {
      setDeletingTeamId('');
    }
  }

  async function handleSignOut() {
    setAdminMenuOpen(false);
    await signOutUser();
    navigate('/', { replace: true });
  }

  if (!loading && !isAuthorized) {
    const isSignedIn = Boolean(user?.uid);

    return (
      <div className="auth-page">
        <section className="card auth-card">
          <p className="eyebrow">App admin</p>
          <h1>{isSignedIn ? 'Admin access required' : 'Log in required'}</h1>
          <p>
            {isSignedIn
              ? 'Only the PKL Universe app admin can access this area.'
              : 'Log in with the app admin Google account to access this area.'}
          </p>
          <div className="team-entry__footer">
            {!isSignedIn ? (
              <Link className="button" state={{ from: location }} to="/auth">
                Log in
              </Link>
            ) : null}
            <Link className="button button--ghost" to="/teams">
              My Teams
            </Link>
            <Link className="button button--ghost" to="/">
              Home
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-page admin-page standalone-mobile-page">
      <button
        aria-label="Close admin menu"
        className="hub-nav-overlay"
        hidden={!adminMenuOpen}
        onClick={() => setAdminMenuOpen(false)}
        type="button"
      />

      <header className="hub-topbar standalone-mobile-topbar">
        <button
          aria-controls="app-admin-sidebar"
          aria-expanded={adminMenuOpen}
          aria-label="Open admin menu"
          className="hub-nav-toggle"
          onClick={() => setAdminMenuOpen((current) => !current)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        <div className="hub-topbar__team">
          <img alt="" aria-hidden="true" className="hub-topbar__logo" src={defaultTeamLogo} />
          <div>
            <p className="hub-topbar__eyebrow">PKL Universe</p>
            <strong>App Admin</strong>
          </div>
        </div>
      </header>

      <aside
        id="app-admin-sidebar"
        className={`admin-sidebar card ${adminMenuOpen ? 'admin-sidebar--open' : ''}`}
        aria-label="App admin navigation"
      >
        <p className="eyebrow">PKL Universe</p>
        <h2>App Admin</h2>
        <p className="admin-sidebar__copy">
          Signed in as <strong>{user?.email ?? user?.displayName ?? 'Unknown user'}</strong>
        </p>
        <nav className="sidebar__nav">
          <div className="sidebar__nav-group">
            <button
              className={`nav-link admin-nav-button ${adminSection === 'teams' ? 'nav-link--active' : ''}`}
              onClick={() => {
                setAdminSection('teams');
                setAdminMenuOpen(false);
              }}
              type="button"
            >
              Teams
            </button>
            <button
              className={`nav-link admin-nav-button ${adminSection === 'clubs' ? 'nav-link--active' : ''}`}
              onClick={() => {
                setAdminSection('clubs');
                setAdminMenuOpen(false);
              }}
              type="button"
            >
              Clubs
            </button>
            <button
              className={`nav-link admin-nav-button ${adminSection === 'players' ? 'nav-link--active' : ''}`}
              onClick={() => {
                setAdminSection('players');
                setAdminMenuOpen(false);
              }}
              type="button"
            >
              Players
            </button>
            <button
              className={`nav-link admin-nav-button ${adminSection === 'tools' ? 'nav-link--active' : ''}`}
              onClick={() => {
                setAdminSection('tools');
                setAdminMenuOpen(false);
              }}
              type="button"
            >
              Challenges
            </button>
          </div>
        </nav>
        <div className="sidebar__footer-actions">
          <Link className="sidebar__footer-link" onClick={() => setAdminMenuOpen(false)} to="/teams">
            My Teams
          </Link>
          <Link className="sidebar__footer-link" onClick={() => setAdminMenuOpen(false)} to="/">
            Home
          </Link>
          <button className="sidebar__signout" onClick={handleSignOut} type="button">
            Sign out
          </button>
        </div>
      </aside>

      <section className="card auth-card">
        <p className="eyebrow">App admin</p>
        <h1>
          {adminSection === 'teams'
            ? 'Teams'
            : adminSection === 'clubs'
              ? 'Clubs'
              : adminSection === 'players'
                ? 'Player Tools'
                : 'Challenges'}
        </h1>
        <p>
          {adminSection === 'teams'
            ? 'Review each team, its club affiliation, captains, and member count.'
            : adminSection === 'clubs'
              ? 'Create clubs, manage club names, and review teams requesting club affiliation.'
              : adminSection === 'players'
                ? 'Copy existing players from one team into another without asking them to rejoin.'
                : 'Review and clean up challenge records.'}
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {adminSection === 'teams' ? (
          <section className="schedule-admin-card">
            <div className="schedule-admin-card__header">
              <div>
                <p className="eyebrow">Teams</p>
                <h2>All teams</h2>
                <p>Review each team, its club affiliation, captains, and member count.</p>
              </div>
            </div>

            {loading ? (
              <div className="state-panel">
                <p>Loading teams...</p>
              </div>
            ) : adminTeams.length > 0 ? (
              <div className="team-admin-grid">
                {adminTeams.map((teamSummary) => (
                  <article key={`${teamSummary.clubSlug}-${teamSummary.teamSlug}`} className="admin-team-card">
                    <img
                      alt={`${teamSummary.name} logo`}
                      className="admin-team-card__logo"
                      decoding="async"
                      loading="lazy"
                      src={teamSummary.logoUrl || defaultTeamLogo}
                    />
                    <div className="admin-team-card__content">
                      <div className="admin-team-card__header">
                        <div className="admin-team-card__title">
                          <strong>{teamSummary.name}</strong>
                          <span>
                            Stored under {teamSummary.clubName} ({teamSummary.clubSlug})
                          </span>
                        </div>
                        <span className="status-badge">{teamSummary.affiliationStatus}</span>
                      </div>
                      <span>
                        Club affiliation:{' '}
                        {teamSummary.approvedClubSlug
                          ? teamSummary.approvedClubSlug
                          : teamSummary.requestedClubSlug
                            ? `Requested ${teamSummary.requestedClubSlug}`
                            : 'Independent'}
                      </span>
                      <span>
                        Captains:{' '}
                        {teamSummary.captainNames.length
                          ? teamSummary.captainNames.join(', ')
                          : 'TBD'}
                      </span>
                      <span>Members: {teamSummary.memberCount}</span>
                      {getVisibleTeamDivisionLabel(teamSummary) ? (
                        <TeamDivisionLabel className="membership-card__division" value={teamSummary.teamDivision} />
                      ) : null}
                      <div className="admin-team-card__actions">
                        <label className="button button--ghost">
                          {updatingTeamLogoId === `${teamSummary.clubSlug}-${teamSummary.teamSlug}`
                            ? 'Updating logo...'
                            : 'Replace logo'}
                          <input
                            accept="image/*"
                            className="settings-admin-form__file-input"
                            disabled={updatingTeamLogoId === `${teamSummary.clubSlug}-${teamSummary.teamSlug}`}
                            onChange={(event) => handleTeamLogoSelection(teamSummary, event)}
                            type="file"
                          />
                        </label>
                        <Link
                          className="button button--ghost"
                          to={`/c/${teamSummary.clubSlug}/t/${teamSummary.teamSlug}/settings`}
                        >
                          Open team settings
                        </Link>
                        <button
                          className="button button--danger"
                          disabled={deletingTeamId === `${teamSummary.clubSlug}-${teamSummary.teamSlug}`}
                          onClick={() => handleDeleteTeam(teamSummary)}
                          type="button"
                        >
                          {deletingTeamId === `${teamSummary.clubSlug}-${teamSummary.teamSlug}`
                            ? 'Deleting team...'
                            : 'Delete team'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="notice notice--info">No teams have been created yet.</div>
            )}
          </section>
        ) : adminSection === 'clubs' ? (
          <>
            <section className="schedule-admin-card">
              <div className="schedule-admin-card__header">
                <div>
                  <p className="eyebrow">Clubs</p>
                  <h2>Create and manage clubs</h2>
                  <p>Only app admins can create real clubs. Teams remain independent until approved.</p>
                </div>
              </div>

              <form className="schedule-admin-form settings-admin-form" onSubmit={handleCreateClub}>
                <label className="field">
                  <span>Club name</span>
                  <input
                    onChange={(event) => setClubForm((current) => ({ ...current, clubName: event.target.value }))}
                    placeholder="Enter Club Name"
                    value={clubForm.clubName}
                  />
                </label>
                <label className="field">
                  <span>Club logo</span>
                  <div className="club-logo-field">
                    {clubForm.logoPreviewUrl ? (
                      <img alt="Club logo preview" className="club-admin-card__logo" src={clubForm.logoPreviewUrl} />
                    ) : (
                      <div className="club-admin-card__badge">{buildPlayerInitials(clubForm.clubName || 'Club')}</div>
                    )}
                    <input
                      accept="image/*"
                      onChange={(event) => handleClubLogoSelection('create', event)}
                      type="file"
                    />
                  </div>
                </label>
                <label className="field">
                  <span>Address</span>
                  <input
                    onChange={(event) => setClubForm((current) => ({ ...current, address: event.target.value }))}
                    placeholder="Street address"
                    value={clubForm.address}
                  />
                </label>
                <label className="field">
                  <span>City</span>
                  <input
                    onChange={(event) => setClubForm((current) => ({ ...current, city: event.target.value }))}
                    placeholder="City"
                    value={clubForm.city}
                  />
                </label>
                <label className="field">
                  <span>State</span>
                  <input
                    onChange={(event) => setClubForm((current) => ({ ...current, state: event.target.value }))}
                    placeholder="State"
                    value={clubForm.state}
                  />
                </label>
                <label className="field">
                  <span>Zip</span>
                  <input
                    onChange={(event) => setClubForm((current) => ({ ...current, zip: event.target.value }))}
                    placeholder="Zip"
                    value={clubForm.zip}
                  />
                </label>
                <label className="field">
                  <span>Number of courts</span>
                  <input
                    min="0"
                    onChange={(event) =>
                      setClubForm((current) => ({ ...current, numberOfCourts: event.target.value }))
                    }
                    placeholder="0"
                    type="number"
                    value={clubForm.numberOfCourts}
                  />
                </label>
                <button className="button" disabled={creatingClub} type="submit">
                  {creatingClub ? 'Creating club...' : 'Create club'}
                </button>
              </form>

              {clubSummaries.length > 0 ? (
                <div className="club-admin-grid">
                  {clubSummaries.map((club) => (
                    <article key={club.slug} className="club-admin-card">
                      {clubDrafts[club.slug]?.logoPreviewUrl || club.logoUrl ? (
                        <img
                          alt={`${club.name} logo`}
                          className="club-admin-card__logo"
                          decoding="async"
                          loading="lazy"
                          src={clubDrafts[club.slug]?.logoPreviewUrl || club.logoUrl}
                        />
                      ) : (
                        <div className="club-admin-card__badge">{buildPlayerInitials(club.name)}</div>
                      )}
                      <div className="club-admin-card__content">
                        <label className="field">
                          <span>Club logo</span>
                          <input
                            accept="image/*"
                            onChange={(event) => handleClubLogoSelection(club.slug, event)}
                            type="file"
                          />
                        </label>
                        <label className="field">
                          <span>Club name</span>
                          <input
                            onChange={(event) =>
                              setClubDrafts((current) => ({
                                ...current,
                                [club.slug]: {
                                  ...(current[club.slug] ?? createEmptyClubForm(club)),
                                  clubName: event.target.value,
                                },
                              }))
                            }
                            value={clubDrafts[club.slug]?.clubName ?? club.name}
                          />
                        </label>
                        <label className="field">
                          <span>Address</span>
                          <input
                            onChange={(event) =>
                              setClubDrafts((current) => ({
                                ...current,
                                [club.slug]: {
                                  ...(current[club.slug] ?? createEmptyClubForm(club)),
                                  address: event.target.value,
                                },
                              }))
                            }
                            value={clubDrafts[club.slug]?.address ?? ''}
                          />
                        </label>
                        <label className="field">
                          <span>City</span>
                          <input
                            onChange={(event) =>
                              setClubDrafts((current) => ({
                                ...current,
                                [club.slug]: {
                                  ...(current[club.slug] ?? createEmptyClubForm(club)),
                                  city: event.target.value,
                                },
                              }))
                            }
                            value={clubDrafts[club.slug]?.city ?? ''}
                          />
                        </label>
                        <label className="field">
                          <span>State</span>
                          <input
                            onChange={(event) =>
                              setClubDrafts((current) => ({
                                ...current,
                                [club.slug]: {
                                  ...(current[club.slug] ?? createEmptyClubForm(club)),
                                  state: event.target.value,
                                },
                              }))
                            }
                            value={clubDrafts[club.slug]?.state ?? ''}
                          />
                        </label>
                        <label className="field">
                          <span>Zip</span>
                          <input
                            onChange={(event) =>
                              setClubDrafts((current) => ({
                                ...current,
                                [club.slug]: {
                                  ...(current[club.slug] ?? createEmptyClubForm(club)),
                                  zip: event.target.value,
                                },
                              }))
                            }
                            value={clubDrafts[club.slug]?.zip ?? ''}
                          />
                        </label>
                        <label className="field">
                          <span>Number of courts</span>
                          <input
                            min="0"
                            onChange={(event) =>
                              setClubDrafts((current) => ({
                                ...current,
                                [club.slug]: {
                                  ...(current[club.slug] ?? createEmptyClubForm(club)),
                                  numberOfCourts: event.target.value,
                                },
                              }))
                            }
                            type="number"
                            value={clubDrafts[club.slug]?.numberOfCourts ?? ''}
                          />
                        </label>
                        <span>Slug: {club.slug}</span>
                        <span>Approved teams: {club.approvedTeamCount}</span>
                        <span>Pending requests: {club.pendingRequestCount}</span>
                        <div className="choice-row">
                          <button
                            className="button"
                            disabled={updatingClubSlug === club.slug}
                            onClick={() => handleRenameClub(club)}
                            type="button"
                          >
                            {updatingClubSlug === club.slug ? 'Saving...' : 'Save club'}
                          </button>
                          <button
                            className="button button--danger"
                            disabled={updatingClubSlug === club.slug}
                            onClick={() => handleDeleteClub(club)}
                            type="button"
                          >
                            Delete club
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notice notice--info">
                  No real clubs created yet. Create Blackhawk here when you are ready.
                </div>
              )}
            </section>

            <section className="schedule-admin-card">
              <div className="schedule-admin-card__header">
                <div>
                  <p className="eyebrow">Requests</p>
                  <h2>Club affiliation requests</h2>
                  <p>Approve or reject teams that want to become part of a club.</p>
                </div>
              </div>

              {loading ? (
                <div className="state-panel">
                  <p>Loading affiliation requests...</p>
                </div>
              ) : requests.length > 0 ? (
                <div className="entity-list">
                  {requests.map((request) => (
                    <div key={`${request.requestedClubSlug}-${request.id}`} className="affiliation-request-card">
                      <div className="affiliation-request-card__header">
                        <div className="affiliation-request-card__title">
                          <strong>{request.teamName || request.teamSlug}</strong>
                          <span className="affiliation-request-card__meta">
                            Requested {request.requestedClubName || request.requestedClubSlug} from{' '}
                            {request.teamClubSlug}/{request.teamSlug}
                          </span>
                        </div>
                        <span className="status-badge">{request.status}</span>
                      </div>

                      {request.status === 'pending' ? (
                        <div className="choice-row">
                          <button
                            className="button"
                            disabled={updatingRequestId === request.id}
                            onClick={() => handleReview(request, 'approved')}
                            type="button"
                          >
                            {updatingRequestId === request.id ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            className="button button--ghost"
                            disabled={updatingRequestId === request.id}
                            onClick={() => handleReview(request, 'rejected')}
                            type="button"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="affiliation-request-card__review">
                          Reviewed by {request.reviewedByLabel || 'an admin'}
                          {request.reviewedAtMs ? ` on ${new Date(request.reviewedAtMs).toLocaleDateString()}` : ''}.
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="notice notice--info">
                  No affiliation requests are available for your admin account.
                </div>
              )}
            </section>
          </>
        ) : adminSection === 'players' ? (
          <section className="schedule-admin-card">
            <div className="schedule-admin-card__header">
              <div>
                <p className="eyebrow">Player Tools</p>
                <h2>Assign players to a team</h2>
                <p>
                  Search all players, select the people you want, and assign them to a target team. This does not
                  remove them from any current team.
                </p>
              </div>
            </div>

            <form className="schedule-admin-form player-copy-tool" onSubmit={handleCopyPlayersSubmit}>
              <div className="player-admin-form__row">
                <label className="field">
                  <span>Find player</span>
                  <input
                    onChange={(event) => updatePlayerCopyForm('searchText', event.target.value)}
                    placeholder="Search by name, email, phone, team, or club"
                    value={playerCopyForm.searchText}
                  />
                </label>
                <label className="field">
                  <span>Target team</span>
                  <select
                    onChange={(event) => updatePlayerCopyForm('targetTeamKey', event.target.value)}
                    value={playerCopyForm.targetTeamKey}
                  >
                    <option value="">Choose target team</option>
                    {playerCopyTeamOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="player-copy-tool__header">
                <div>
                  <h3>All players</h3>
                  <p>
                    {loadingAdminPlayers
                      ? 'Loading players...'
                      : `${filteredAdminPlayers.length} of ${adminPlayers.length} player${adminPlayers.length === 1 ? '' : 's'} shown.`}
                  </p>
                </div>
                <label className="checkbox-option player-copy-tool__select-all">
                  <input
                    checked={filteredAdminPlayers.length > 0 && filteredSelectedPlayerCount === filteredAdminPlayers.length}
                    disabled={!filteredAdminPlayers.length}
                    onChange={(event) => setAllPlayerCopySelections(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Select shown</span>
                </label>
              </div>

              {loadingAdminPlayers ? (
                <div className="state-panel">
                  <p>Loading players...</p>
                </div>
              ) : filteredAdminPlayers.length > 0 ? (
                <div className="player-copy-tool__list">
                  {filteredAdminPlayers.map((player) => (
                    <label key={player.assignmentKey} className="player-copy-tool__player">
                      <input
                        checked={playerCopyForm.playerKeys.includes(player.assignmentKey)}
                        onChange={() => togglePlayerCopySelection(player.assignmentKey)}
                        type="checkbox"
                      />
                      <span className="player-copy-tool__player-name">{player.fullName || 'Unnamed player'}</span>
                      <span>{player.email || 'No email'}</span>
                      <span>{player.sourceTeamName}</span>
                      <span>{player.memberUid ? 'Linked login' : 'Profile only'}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="notice notice--info">No players match this search.</div>
              )}

              <div className="player-admin-form__actions">
                <button
                  className="button"
                  disabled={
                    copyingPlayers ||
                    !selectedPlayerCount ||
                    !playerCopyTargetTeam.clubSlug
                  }
                  type="submit"
                >
                  {copyingPlayers
                    ? 'Assigning players...'
                    : `Assign ${selectedPlayerCount || 'selected'} player${selectedPlayerCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <section className="schedule-admin-card">
            <div className="schedule-admin-card__header">
              <div>
                <p className="eyebrow">Challenges</p>
                <h2>All challenges</h2>
                <p>Review every challenge in the system and delete test or bad records.</p>
              </div>
            </div>

            {loading ? (
              <div className="state-panel">
                <p>Loading challenges...</p>
              </div>
            ) : adminChallenges.length > 0 ? (
              <div className="challenge-grid">
                {adminChallenges.map((challenge) => (
                  <article key={`${challenge.challengeClubSlug}-${challenge.id}`} className="challenge-card">
                    <div className="challenge-card__badge">CH</div>
                    <div className="challenge-card__body">
                      <div className="challenge-card__header">
                        <div className="challenge-card__title">
                          <strong>{challenge.createdByTeamName || challenge.createdByTeamSlug}</strong>
                          <span>
                            {challenge.challengeClubName || challenge.challengeClubSlug} ·{' '}
                            {challenge.visibility === 'targeted'
                              ? `To ${challenge.targetTeamName || challenge.targetTeamSlug}`
                              : 'Open challenge'}
                          </span>
                        </div>
                        <span className="status-badge">{getChallengeStatusLabel(challenge)}</span>
                      </div>
                      <div className="challenge-card__details">
                        <span>Date: {formatChallengeDate(challenge)}</span>
                        <span>Time: {formatChallengeTime(challenge)}</span>
                        <span>Court(s): {challenge.location || 'TBD'}</span>
                        <span>ID: {challenge.id}</span>
                      </div>
                      {challenge.notes ? <p className="challenge-card__notes">{challenge.notes}</p> : null}
                      <div className="challenge-card__actions">
                        <button
                          className="button button--danger"
                          disabled={deletingChallengeId === challenge.id}
                          onClick={() => handleDeleteChallenge(challenge)}
                          type="button"
                        >
                          {deletingChallengeId === challenge.id ? 'Deleting...' : 'Delete challenge'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="notice notice--info">No challenges have been created yet.</div>
            )}
          </section>
        )}
      </section>

      {teamLogoCropImageSrc ? (
        <div className="logo-cropper" role="dialog" aria-modal="true" aria-label="Crop team logo">
          <button
            aria-label="Close team logo cropper"
            className="logo-cropper__backdrop"
            onClick={clearTeamLogoCropper}
            type="button"
          />
          <aside className="logo-cropper__panel">
            <div className="logo-cropper__header">
              <div>
                <p className="eyebrow">Crop team logo</p>
                <h2>{teamLogoCropTarget?.name ?? 'Team'} logo</h2>
                <p className="logo-cropper__copy">
                  Reposition the original logo and zoom until it fits well inside the square preview.
                </p>
              </div>
              <button className="button button--ghost" onClick={clearTeamLogoCropper} type="button">
                Cancel
              </button>
            </div>

            <div className="logo-cropper__workspace">
              <div className="logo-cropper__canvas">
                <Cropper
                  aspect={1}
                  crop={teamLogoCrop}
                  image={teamLogoCropImageSrc}
                  onCropChange={setTeamLogoCrop}
                  onCropComplete={(_, croppedAreaPixels) => setTeamLogoCropPixels(croppedAreaPixels)}
                  onZoomChange={setTeamLogoZoom}
                  showGrid={false}
                  zoom={teamLogoZoom}
                />
              </div>

              <label className="field logo-cropper__zoom">
                <span>Zoom</span>
                <input
                  max="3"
                  min="1"
                  onChange={(event) => setTeamLogoZoom(Number(event.target.value))}
                  step="0.01"
                  type="range"
                  value={teamLogoZoom}
                />
              </label>
            </div>

            <div className="settings-admin-form__actions">
              <button className="button" disabled={creatingTeamLogoCrop} onClick={handleApplyTeamLogoCrop} type="button">
                {creatingTeamLogoCrop ? 'Updating logo...' : 'Use cropped logo'}
              </button>
              <button className="button button--ghost" onClick={clearTeamLogoCropper} type="button">
                Cancel
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {clubCropImageSrc ? (
        <div className="logo-cropper" role="dialog" aria-modal="true" aria-label="Crop club logo">
          <button
            aria-label="Close logo cropper"
            className="logo-cropper__backdrop"
            onClick={clearClubCropper}
            type="button"
          />
          <aside className="logo-cropper__panel">
            <div className="logo-cropper__header">
              <div>
                <p className="eyebrow">Crop logo</p>
                <h2>Square club logo crop</h2>
                <p className="logo-cropper__copy">
                  Reposition the image and zoom until the club logo fits well inside the square preview.
                </p>
              </div>
              <button className="button button--ghost" onClick={clearClubCropper} type="button">
                Cancel
              </button>
            </div>

            <div className="logo-cropper__workspace">
              <div className="logo-cropper__canvas">
                <Cropper
                  aspect={1}
                  crop={clubCrop}
                  image={clubCropImageSrc}
                  onCropChange={setClubCrop}
                  onCropComplete={(_, croppedAreaPixels) => setClubCropPixels(croppedAreaPixels)}
                  onZoomChange={setClubZoom}
                  showGrid={false}
                  zoom={clubZoom}
                />
              </div>

              <label className="field logo-cropper__zoom">
                <span>Zoom</span>
                <input
                  max="3"
                  min="1"
                  onChange={(event) => setClubZoom(Number(event.target.value))}
                  step="0.01"
                  type="range"
                  value={clubZoom}
                />
              </label>
            </div>

            <div className="settings-admin-form__actions">
              <button className="button" disabled={creatingClubCrop} onClick={handleApplyClubLogoCrop} type="button">
                {creatingClubCrop ? 'Preparing crop...' : 'Use cropped logo'}
              </button>
              <button className="button button--ghost" onClick={clearClubCropper} type="button">
                Cancel
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
