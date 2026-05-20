import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import FirestoreDebugPanel from '../components/FirestoreDebugPanel';
import MatchScheduleWhen from '../components/MatchScheduleWhen';
import { useAuth } from '../context/AuthContext';
import { createFirestoreStepError, extractFirestoreDebugInfo } from '../lib/firestoreDebug';
import { formatIsoDateForDisplay } from '../lib/matchScheduleDisplay';
import { markScheduleViewed } from '../lib/scheduleAttention';
import { ACTIVITY_ICON_BY_TYPE } from '../lib/activityIcons';
import { normalizeStoredHeadshotUrl, resolvePlayerAvatarUrl, resolveProfileAvatarUrl } from '../lib/profilePhotos';
import {
  ACTIVITY_TYPES,
  MATCH_PLAYER_COUNT_OPTIONS,
  PLAYER_AVAILABLE_DAYS,
  PLAYER_SKILL_LEVELS,
  TEAM_MEMBER_LIMIT,
  acceptChallenge,
  CHALLENGE_ACCEPT_SCHEDULE_TBD_ID,
  CHALLENGE_ACCEPT_SCHEDULE_TBD_LABEL,
  MAX_PROPOSED_CHALLENGE_WINDOWS,
  addNewsComment,
  addClubManager,
  archiveClubEvent,
  assignPlayersToTeamAsAdmin,
  buildPairingSummary,
  buildStandingsSummary,
  archiveTeam,
  backfillUserProfileFromPlayer,
  cancelChallenge,
  canManageClub,
  createClub,
  createChallenge,
  deleteActivityLog,
  deleteClub,
  deleteChallengeAsAdmin,
  deleteClubEvent,
  deleteGame,
  deleteNewsComment,
  deleteNewsPost,
  deleteTeamAsAdmin,
  dropTeamMember,
  declineChallenge,
  getMembership,
  getTeam,
  readTeamMembership,
  getUserProfileData,
  getUserProfileAvatarsByUid,
  isPlatformAdmin,
  listAdminActivity,
  listAdminPlayers,
  listAdminTeamSummaries,
  listAdminChallenges,
  listApprovedClubTeams,
  listClubChallenges,
  listClubActivity,
  listClubAffiliationRequests,
  listClubEvents,
  listClubManagers,
  listClubs,
  listGames,
  listNewsPosts,
  listPlayers,
  listTeamChallenges,
  listTeamMembers,
  renameClub,
  RESET_FIRESTORE_TEST_DATA_PHRASE,
  resetFirestoreTestData,
  removeClubManager,
  reviewClubAffiliationRequest,
  rotateTeamJoinCode,
  saveGame,
  saveGamePairings,
  saveNewsPost,
  savePlayer,
  saveClubEvent,
  saveUserPlayerProfile,
  ensureUserActiveTeamContext,
  setLastActiveTeam,
  subscribeChallengeHub,
  subscribeTeamGames,
  subscribeNewsPosts,
  toggleNewsReaction,
  updateChallenge,
  updateNewsComment,
  updateTeamLogoAsAdmin,
  updateTeamMemberRole,
  updateTeamMemberRoleAsAdmin,
  updateTeamSettings,
} from '../lib/data';
import blackhawkPickleballCourts from '../../blackhawk_pickleball_courts.webp';
import defaultTeamLogo from '../../default_team_logo.webp';

/** Match scoring structure — keep in sync with score entry (best of three games). */
const MATCH_FORMAT_LABEL = 'Match Format: Best 2 out of 3 games.';

function canManageRole(role) {
  return role === 'captain' || role === 'coCaptain';
}

function normalizeMatchPlayerCount(value) {
  const count = Number(value);
  return MATCH_PLAYER_COUNT_OPTIONS.includes(count) ? count : 2;
}

function isCaptainRole(role) {
  return role === 'captain';
}

function formatRecord(wins, losses) {
  return `${wins}-${losses}`;
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
    linkedRosterPlayerIds: (game.linkedRosterPlayers ?? []).map((player) => player.id).filter(Boolean),
    location: game.location ?? '',
    linkedTeamClubSlug: game.linkedTeamClubSlug ?? '',
    linkedTeamName: game.linkedTeamName ?? '',
    linkedTeamSlug: game.linkedTeamSlug ?? '',
    matchScores: createMatchScoreDrafts(game.matchScores),
    matchStatus: game.matchStatus ?? 'scheduled',
    opponent: game.opponent ?? '',
    opponentScore: game.opponentScore ?? '',
    playersNeeded: normalizeMatchPlayerCount(game.playersNeeded),
    rosterPlayerIds: [...(game.rosterPlayerIds ?? [])],
    teamScore: game.teamScore ?? '',
    timeLabel: game.dateTbd === true || timeLabel === 'Time TBD' ? '' : timeLabel,
  };
}

function createMatchScoreDrafts(matchScores = []) {
  return [0, 1, 2].map((index) => ({
    opponentScore: matchScores[index]?.opponentScore ?? '',
    teamScore: matchScores[index]?.teamScore ?? '',
  }));
}

function createScoreEntryDraft(game = null) {
  return {
    matchScores: createMatchScoreDrafts(game?.matchScores),
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
    linkedRosterPlayerIds: [],
    linkedTeamClubSlug: '',
    linkedTeamName: '',
    linkedTeamSlug: '',
    location: '',
    matchScores: createMatchScoreDrafts(),
    matchStatus: 'scheduled',
    opponent: '',
    opponentScore: '',
    playersNeeded: 2,
    rosterPlayerIds: [],
    teamScore: '',
    timeLabel: '',
  };
}

function createEmptyProposedWindow() {
  return {
    hour: '',
    isoDate: '',
    minute: '00',
    period: 'AM',
  };
}

function createEmptyChallengeForm() {
  return {
    dateTbd: true,
    hour: '',
    isoDate: '',
    location: '',
    minute: '00',
    period: 'AM',
    playersNeeded: 2,
    createdByPlayerId: '',
    proposedWindows: Array.from({ length: MAX_PROPOSED_CHALLENGE_WINDOWS }, () => createEmptyProposedWindow()),
    targetTeamKey: '',
    visibility: 'targeted',
  };
}

function getAttendanceStatus(game, playerId) {
  return game.attendance?.[playerId] ?? 'unknown';
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

function getPlayerName(player, fallback = 'Player') {
  const firstLast = [player?.firstName, player?.lastName].filter(Boolean).join(' ').trim();
  return player?.fullName || player?.displayName || firstLast || player?.email || fallback;
}

function getCommunityPlayerKey(player) {
  return getCommunityPlayerKeys(player)[0] ?? getPlayerName(player).toLowerCase().replace(/\s+/g, '-');
}

function getCommunityPlayerKeys(player) {
  const nameKey = getPlayerName(player).toLowerCase().replace(/\s+/g, '-');
  return [player?.uid, player?.email?.toLowerCase(), nameKey]
    .map((value) => (value ?? '').trim())
    .filter(Boolean);
}

function getVisibleMatchScores(game) {
  const scores = Array.isArray(game?.matchScores) ? game.matchScores : [];
  const hasThirdSet = scores[2]?.teamScore !== null || scores[2]?.opponentScore !== null;
  const columnCount = hasThirdSet ? 3 : 2;

  return Array.from({ length: columnCount }, (_, index) => ({
    opponentScore: scores[index]?.opponentScore,
    teamScore: scores[index]?.teamScore,
  }));
}

function getSetWinner(score) {
  if (score?.teamScore === null || score?.teamScore === undefined || score?.opponentScore === null || score?.opponentScore === undefined) {
    return '';
  }

  const teamScore = Number(score.teamScore);
  const opponentScore = Number(score.opponentScore);

  if (!Number.isFinite(teamScore) || !Number.isFinite(opponentScore)) {
    return '';
  }

  if (teamScore > opponentScore) {
    return 'team';
  }

  if (opponentScore > teamScore) {
    return 'opponent';
  }

  return '';
}

function hasSplitFirstTwoSets(matchScores = []) {
  const firstWinner = getSetWinner(matchScores[0]);
  const secondWinner = getSetWinner(matchScores[1]);

  return Boolean(firstWinner && secondWinner && firstWinner !== secondWinner);
}

function shouldShowThirdScoreDraft(matchScores = []) {
  const third = matchScores[2] ?? {};

  return hasSplitFirstTwoSets(matchScores) || third.teamScore !== '' || third.opponentScore !== '';
}

function scoreDraftIsBlank(matchScores = []) {
  return matchScores.every((score) => score.teamScore === '' && score.opponentScore === '');
}

function getMatchCourtLabel(location = '') {
  const trimmed = (location ?? '').trim();
  return trimmed || 'Court TBD';
}

function formatMatchFooterDate(game) {
  if (!game?.isoDate) {
    return 'Date TBD';
  }

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    year: 'numeric',
  }).format(new Date(`${game.isoDate}T12:00:00`));

  return `${dateLabel} · ${game.timeLabel || 'Time TBD'}`;
}

function getMatchPlayerRoleRank(player) {
  if (player?.memberRole === 'captain') {
    return 0;
  }

  if (player?.memberRole === 'coCaptain') {
    return 1;
  }

  return 2;
}

function sortMatchPlayersForDisplay(players = []) {
  return [...players].sort((left, right) => {
    const roleDifference = getMatchPlayerRoleRank(left) - getMatchPlayerRoleRank(right);

    if (roleDifference !== 0) {
      return roleDifference;
    }

    return (left.fullName || '').localeCompare(right.fullName || '');
  });
}

function MatchCardPlayerAvatar({ fullName = 'Player', headshotUrl = '' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(headshotUrl) && !imageFailed;

  return (
    <span className="match-card-score-row__player-avatar">
      {showPhoto ? (
        <img
          alt=""
          decoding="async"
          onError={() => setImageFailed(true)}
          src={headshotUrl}
        />
      ) : (
        buildPlayerInitials(fullName)
      )}
    </span>
  );
}

function MatchCardScoreRow({
  aggregateScore,
  fallbackLogoUrl,
  isOpponent = false,
  isWinner = false,
  name,
  players = [],
  scores,
}) {
  const sortedPlayers = sortMatchPlayersForDisplay(players);

  return (
    <div className={`match-card-score-row ${isOpponent ? 'match-card-score-row--opponent' : ''}`}>
      <div className="match-card-score-row__identity">
        <img
          alt=""
          className="match-card-score-row__team-logo"
          decoding="async"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = defaultTeamLogo;
          }}
          src={fallbackLogoUrl || defaultTeamLogo}
        />
        <div className="match-card-score-row__players">
          {sortedPlayers.length ? (
            sortedPlayers.map((player, index) => (
              <span key={player.id || player.fullName} className="match-card-score-row__player-group">
                {index > 0 ? <span className="match-card-score-row__player-separator">|</span> : null}
                <span className="match-card-score-row__player">
                  <MatchCardPlayerAvatar
                    fullName={player.fullName || 'Player'}
                    headshotUrl={resolvePlayerAvatarUrl({ player })}
                  />
                  <strong>{player.fullName || 'Player'}</strong>
                </span>
              </span>
            ))
          ) : (
            <strong>{name}</strong>
          )}
        </div>
      </div>
      <span className={`match-card-score-row__aggregate ${isWinner ? 'match-card-score-row__aggregate--winner' : ''}`}>
        {aggregateScore ?? '-'}
      </span>
      {scores.map((score, index) => {
        const winner = getSetWinner(score);
        const value = isOpponent ? score.opponentScore : score.teamScore;

        return (
          <span
            key={`set-${index}`}
            className={`match-card-score-row__set ${winner === (isOpponent ? 'opponent' : 'team') ? 'match-card-score-row__set--won' : ''}`}
          >
            {value ?? '--'}
          </span>
        );
      })}
    </div>
  );
}

function CourtIcon() {
  return (
    <svg aria-hidden="true" className="match-card-footer__icon match-card-footer__icon--court" viewBox="0 0 32 20">
      <path d="M2.5 3.5h27v13h-27z" />
      <path d="M10.8 3.5v13M21.2 3.5v13" />
      <path d="M2.5 10h8.3M21.2 10h8.3" />
      <path className="match-card-footer__court-dash" d="M16 4.8v10.4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" className="match-card-footer__icon" viewBox="0 0 24 24">
      <path d="M12 7v5l3 2" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

function ScheduleMatchCard({
  actions = null,
  game,
  homeLogoUrl = '',
  homePlayers = [],
  homeTeamName = '',
}) {
  const scores = getVisibleMatchScores(game);
  const matchTypeLabel = normalizeMatchPlayerCount(game.playersNeeded) === 1 ? 'Singles' : 'Doubles';
  const opponentName = game.opponent || 'Opponent TBD';
  const opponentPlayers = game.linkedRosterPlayers ?? [];
  const matchTitle = `${homeTeamName || 'Team'} VS ${opponentName} | ${matchTypeLabel} Match`;
  const teamAggregateScore = Number(game.teamScore);
  const opponentAggregateScore = Number(game.opponentScore);
  const hasAggregateWinner =
    Number.isFinite(teamAggregateScore) &&
    Number.isFinite(opponentAggregateScore) &&
    teamAggregateScore !== opponentAggregateScore;

  return (
    <article className="schedule-match-card schedule-match-card--scoreboard">
      <div className="match-card-scoreboard__topline">
        <span>{matchTitle}</span>
        {actions ? <div className="match-card-scoreboard__top-actions">{actions}</div> : null}
      </div>

      <div className="match-card-score-table" aria-label={`${homeTeamName || 'Team'} versus ${opponentName} scores`}>
        <MatchCardScoreRow
          aggregateScore={game.teamScore}
          fallbackLogoUrl={homeLogoUrl}
          isWinner={hasAggregateWinner && teamAggregateScore > opponentAggregateScore}
          name={homeTeamName || 'Team'}
          players={homePlayers}
          scores={scores}
        />
        <MatchCardScoreRow
          aggregateScore={game.opponentScore}
          fallbackLogoUrl={game.linkedTeamLogoUrl}
          isOpponent
          isWinner={hasAggregateWinner && opponentAggregateScore > teamAggregateScore}
          name={opponentName}
          players={opponentPlayers}
          scores={scores}
        />
      </div>

      <div className="match-card-footer">
        <div className="match-card-footer__primary">
          <div className="match-card-footer__details">
            <span>
              <ClockIcon />
              {formatMatchFooterDate(game)}
            </span>
          </div>
          <div className="match-card-footer__details">
            <span>
              <CourtIcon />
              {getMatchCourtLabel(game.location)}
            </span>
          </div>
        </div>
        <p className="match-card-footer__format">{MATCH_FORMAT_LABEL}</p>
      </div>

    </article>
  );
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
    const inRoster = (game.rosterPlayerIds ?? []).includes(playerId);
    const inPairings = (game.pairings ?? []).some((pairing) => (pairing.playerIds ?? []).includes(playerId));

    return isMatchCompleted(game) && (inRoster || inPairings);
  }).length;
}

function buildPlayerRecord(games, playerId) {
  const record = {
    losses: 0,
    wins: 0,
  };

  if (!playerId) {
    return record;
  }

  games.forEach((game) => {
    const wasRostered = (game.rosterPlayerIds ?? []).includes(playerId);

    if (!isMatchCompleted(game) || !wasRostered) {
      return;
    }

    if (game.result === 'win') {
      record.wins += 1;
    } else if (game.result === 'loss') {
      record.losses += 1;
    }
  });

  return record;
}

function formatPlayerWinRate(record) {
  const gamesPlayed = record.wins + record.losses;

  if (!gamesPlayed) {
    return '0%';
  }

  return `${Math.round((record.wins / gamesPlayed) * 100)}%`;
}

function isMatchCompleted(game) {
  return game?.matchStatus === 'completed' || game?.matchStatus === 'final';
}

function getGameTimeSortValue(game) {
  const timeParts = parseTimeLabel(game?.timeLabel);

  if (!timeParts.hour) {
    return -1;
  }

  const hour = Number(timeParts.hour);
  const minute = Number(timeParts.minute) || 0;
  const normalizedHour = (hour % 12) + (timeParts.period === 'PM' ? 12 : 0);

  return normalizedHour * 60 + minute;
}

function sortGamesByMostRecent(games = []) {
  return [...games].sort((left, right) => {
    const leftDate = left?.isoDate ?? '';
    const rightDate = right?.isoDate ?? '';

    if (leftDate && rightDate && leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }

    if (leftDate !== rightDate) {
      return leftDate ? -1 : 1;
    }

    const timeDifference = getGameTimeSortValue(right) - getGameTimeSortValue(left);

    if (timeDifference !== 0) {
      return timeDifference;
    }

    return String(left?.opponent ?? '').localeCompare(String(right?.opponent ?? ''));
  });
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

function NewsFeedIntro({ copy, eyebrow = 'News Feed', title }) {
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

function NewsAuthorAvatar({ name, photoUrl = '' }) {
  return (
    <span className="news-feed-card__avatar">
      {photoUrl ? <img alt="" decoding="async" src={photoUrl} /> : buildPlayerInitials(name || 'Teammate')}
    </span>
  );
}

function resolveNewsAuthorPhotoUrl(uid, storedPhotoUrl = '', authorAvatarsByUid = {}) {
  if (uid && authorAvatarsByUid[uid]) {
    return authorAvatarsByUid[uid];
  }

  return normalizeStoredHeadshotUrl(storedPhotoUrl) || storedPhotoUrl || '';
}

const NEWS_REACTION_OPTIONS = [
  { emoji: '👍', label: 'Like', type: 'like' },
  { emoji: '👎', label: 'Disagree', type: 'thumbsDown' },
  { emoji: '❤️', label: 'Love', type: 'love' },
  { emoji: '🙌', label: 'Celebrate', type: 'thumbsUp' },
  { emoji: '😂', label: 'Laugh', type: 'laugh' },
  { emoji: '😢', label: 'Sad', type: 'cry' },
  { emoji: '😡', label: 'Angry', type: 'angry' },
];

function NewsFeed({
  authorAvatarsByUid = {},
  canModerate = false,
  commentDrafts = {},
  commentEditDraft = '',
  currentUser,
  deletingCommentId = '',
  deletingPostId = '',
  editingCommentId = '',
  editingPostId = '',
  newsPosts = [],
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
    return <div className="notice notice--info">No community posts yet.</div>;
  }

  return (
    <div className="news-feed">
      {newsPosts.map((post) => {
        const canManagePost = canModerate || post.authorUid === currentUser?.uid;
        const isEditingPost = editingPostId === post.id;
        const userReaction = post.reactions?.find((reaction) => reaction.uid === currentUser?.uid);
        const reactionCounts = (post.reactions ?? []).reduce((counts, reaction) => {
          counts[reaction.type] = (counts[reaction.type] ?? 0) + 1;
          return counts;
        }, {});

        return (
          <article key={post.id} className="news-feed-card">
            <div className="news-feed-card__header">
              <div className="news-feed-card__author">
                <NewsAuthorAvatar
                  name={post.authorName}
                  photoUrl={resolveNewsAuthorPhotoUrl(post.authorUid, post.authorPhotoUrl, authorAvatarsByUid)}
                />
                <div>
                  <strong>{post.authorName || 'Teammate'}</strong>
                  <span>{formatNewsPostDate(post)}</span>
                </div>
              </div>
            </div>

            {isEditingPost ? (
              <form className="news-edit-form" onSubmit={(event) => {
                event.preventDefault();
                onSavePostEdit?.(post);
              }}>
                <label className="field news-form__full">
                  <span>Edit post</span>
                  <textarea
                    onChange={(event) => onPostEditChange?.(event.target.value)}
                    rows={4}
                    value={postEditDraft}
                  />
                </label>
                <label className="news-composer__file">
                  Change Image
                  <input
                    accept="image/*"
                    onChange={(event) => onPostEditImageSelected?.(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                </label>
                {postEditImagePreviewUrl ? (
                  <div className="news-composer__preview">
                    <img alt="Selected post" src={postEditImagePreviewUrl} />
                  </div>
                ) : null}
                <div className="news-edit-form__actions">
                  <button className="button" disabled={savingPostId === post.id} type="submit">
                    {savingPostId === post.id ? 'Saving...' : 'Save Post'}
                  </button>
                  <button className="button button--ghost" onClick={onCancelPostEdit} type="button">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="news-feed-card__body">
                  {post.body ? <p className="news-feed-card__text">{post.body}</p> : null}
                  {post.linkUrl ? (
                    <p className="news-feed-card__text">
                      <a href={post.linkUrl} rel="noreferrer" target="_blank">{post.linkUrl}</a>
                    </p>
                  ) : null}
                  {post.imageUrl ? (
                    <div className="news-feed-card__image-wrap">
                      <img alt="" className="news-feed-card__image" src={post.imageUrl} />
                    </div>
                  ) : null}
                </div>

                <div className="news-feed-card__actions">
                  <div className="news-reaction-picker" aria-label="React to post">
                    {NEWS_REACTION_OPTIONS.map((reaction) => (
                      <button
                        key={reaction.type}
                        aria-label={`${reaction.label} reaction`}
                        className={`news-reaction-button ${userReaction?.type === reaction.type ? 'news-reaction-button--active' : ''}`}
                        disabled={!currentUser?.uid || reactingPostId === post.id}
                        onClick={() => onReactionToggle?.(post, reaction.type)}
                        title={reaction.label}
                        type="button"
                      >
                        <span aria-hidden="true">{reaction.emoji}</span>
                        {reactionCounts[reaction.type] ? (
                          <small>{reactionCounts[reaction.type]}</small>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  {canManagePost ? (
                    <div className="news-feed-card__manage">
                      <button
                        aria-label="Edit post"
                        className="news-icon-button"
                        onClick={() => onEditPost?.(post)}
                        title="Edit post"
                        type="button"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        aria-label="Delete post"
                        className="news-icon-button news-icon-button--danger"
                        disabled={deletingPostId === post.id}
                        onClick={() => onDeletePost?.(post)}
                        title="Delete post"
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            )}

            <div className="news-feed-comments">
              {(post.comments ?? []).map((comment) => {
                const canManageComment = canModerate || comment.authorUid === currentUser?.uid;
                const isEditingComment = editingCommentId === comment.id;

                return (
                  <div key={comment.id} className="news-feed-comment">
                    <NewsAuthorAvatar
                      name={comment.authorName}
                      photoUrl={resolveNewsAuthorPhotoUrl(
                        comment.authorUid,
                        comment.authorPhotoUrl,
                        authorAvatarsByUid,
                      )}
                    />
                    <div className="news-feed-comment__body">
                      <strong>{comment.authorName || 'Teammate'}</strong>
                      {isEditingComment ? (
                        <form className="news-feed-comment-form" onSubmit={(event) => {
                          event.preventDefault();
                          onSaveCommentEdit?.(post, comment);
                        }}>
                          <input
                            onChange={(event) => onCommentEditChange?.(event.target.value)}
                            value={commentEditDraft}
                          />
                          <button disabled={savingCommentId === comment.id} type="submit">
                            Save
                          </button>
                          <button onClick={onCancelCommentEdit} type="button">
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <p>{comment.body}</p>
                          {canManageComment ? (
                            <div className="news-feed-icon-actions">
                              <button
                                aria-label="Edit comment"
                                className="news-icon-button"
                                onClick={() => onEditComment?.(comment)}
                                title="Edit comment"
                                type="button"
                              >
                                <PencilIcon />
                              </button>
                              <button
                                aria-label="Delete comment"
                                className="news-icon-button news-icon-button--danger"
                                disabled={deletingCommentId === comment.id}
                                onClick={() => onDeleteComment?.(post, comment)}
                                title="Delete comment"
                                type="button"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              <form className="news-feed-comment-form" onSubmit={(event) => onCommentSubmit?.(event, post)}>
                <input
                  onChange={(event) => onCommentChange?.(post.id, event.target.value)}
                  placeholder="Write a comment..."
                  value={commentDrafts[post.id] ?? ''}
                />
                <button
                  aria-label="Send comment"
                  className="news-feed-comment-submit"
                  disabled={!currentUser?.uid || !(commentDrafts[post.id] ?? '').trim()}
                  title="Send comment"
                  type="submit"
                >
                  <SendIcon />
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
  emptyMessage = 'No news posts published yet.',
  newsPosts = [],
  onDelete,
  onEdit,
  selectedPostId = '',
}) {
  if (!newsPosts.length) {
    return <div className="notice notice--info">{emptyMessage}</div>;
  }

  return (
    <div className="newsroom-list">
      {newsPosts.map((post) => (
        <article
          key={post.id}
          className={`newsroom-post-row ${selectedPostId === post.id ? 'newsroom-post-row--active' : ''}`}
        >
          <button className="newsroom-post-row__main" onClick={() => onEdit?.(post)} type="button">
            <div className="newsroom-post-row__top">
              <div>
                <p className="newsroom-post-row__meta">{formatNewsPostDate(post)}</p>
                <h3 className="newsroom-post-row__title">{post.title}</h3>
              </div>
              <div className="newsroom-post-row__chips">
                {post.imageUrl ? <span className="newsroom-post-row__chip newsroom-post-row__chip--active">Image</span> : null}
                {post.linkUrl ? <span className="newsroom-post-row__chip">Link</span> : null}
              </div>
            </div>
            <p className="newsroom-post-row__excerpt">{buildNewsExcerpt(post.body)}</p>
          </button>
          <div className="newsroom-post-row__footer">
            <span className="newsroom-post-row__date">
              {post.commentCount ?? 0} comments · {post.reactionCount ?? 0} reactions
            </span>
            <div className="newsroom-post-row__actions">
              <button className="button button--ghost" onClick={() => onEdit?.(post)} type="button">
                Edit
              </button>
              <button
                className="button button--danger"
                disabled={deletingId === post.id}
                onClick={() => onDelete?.(post)}
                type="button"
              >
                {deletingId === post.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
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

/** Score lines — suggests entering per-game results */
function EnterScoresIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M5 5h14a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm0 6h14a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1zm0 6h10a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z" />
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

function SendIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M3.5 20.2 21 12 3.5 3.8 3 10l10 2-10 2 .5 6.2z" />
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
    openToChallenges: team.openToChallenges === true,
    teamName: team.name ?? '',
  };
}

function buildDefaultCourtLabels(numberOfCourts = '') {
  const courtCount = Number(numberOfCourts);

  if (!Number.isInteger(courtCount) || courtCount <= 0) {
    return [];
  }

  return Array.from({ length: courtCount }, (_, index) => String(index + 1));
}

function createCourtLabelsText(club = {}) {
  const labels = Array.isArray(club.courtLabels) && club.courtLabels.length
    ? club.courtLabels
    : buildDefaultCourtLabels(club.numberOfCourts);

  return labels.join('\n');
}

function parseCourtLabelsText(value = '') {
  return value
    .split(/[\n,]+/)
    .map((label) => label.trim())
    .filter(Boolean);
}

function buildCourtOptionsFromClub(club = null) {
  if (!club) {
    return [];
  }

  const labels = Array.isArray(club.courtLabels) && club.courtLabels.length
    ? club.courtLabels
    : buildDefaultCourtLabels(club.numberOfCourts);

  return labels.map((label) => ({
    label: label.match(/^court\b/i) ? label : `Court ${label}`,
    value: label.match(/^court\b/i) ? label : `Court ${label}`,
  }));
}

function createEmptyClubForm(club = {}) {
  return {
    address: club.address ?? '',
    city: club.city ?? '',
    clubName: club.name ?? '',
    courtLabelsText: createCourtLabelsText(club),
    logoFile: null,
    logoPreviewUrl: '',
    numberOfCourts: club.numberOfCourts ?? '',
    state: club.state ?? '',
    zip: club.zip ?? '',
  };
}

function createEmptyClubEventForm(event = null) {
  return {
    bulletPointsText: event?.bulletPoints?.join('\n') ?? '',
    costLabel: event?.costLabel ?? '',
    description: event?.description ?? '',
    detailsHeading: event?.detailsHeading ?? 'What to expect',
    endDate: event?.endDate ?? '',
    eventId: event?.id ?? '',
    eventType: event?.eventType ?? 'singleDay',
    flyerFile: null,
    locationLabel: event?.locationLabel ?? '',
    registrationInfo: formatRegistrationInfo(event?.registrationInfo ?? 'Click to register.'),
    registrationUrl: event?.registrationUrl ?? '',
    startDate: event?.startDate ?? '',
    status: event?.status ?? 'draft',
    timeLabel: event?.timeLabel ?? '',
    title: event?.title ?? '',
  };
}

function formatEventDateRange(event) {
  if (event.startDate && event.endDate && event.endDate !== event.startDate) {
    return `${event.startDate} - ${event.endDate}`;
  }

  return event.startDate || 'Date TBD';
}

function formatEventCost(costLabel) {
  return costLabel?.trim() || 'Cost TBD';
}

function formatRegistrationInfo(registrationInfo = '') {
  return registrationInfo.replace(/\blink\b/gi, 'button');
}

function createEmptyPlayerCopyForm() {
  return {
    playerKeys: [],
    searchText: '',
    targetTeamKey: '',
  };
}

function getInitialAdminSection(pathname) {
  if (pathname === '/admin/activity') {
    return 'activity';
  }

  if (pathname === '/admin/events') {
    return 'events';
  }

  return 'teams';
}

function createEmptyActivityFilters() {
  return {
    clubId: '',
    endDate: '',
    teamId: '',
    type: '',
    startDate: '',
  };
}

const ACTIVITY_TYPE_META = {
  [ACTIVITY_TYPES.CHALLENGE_CREATED]: { icon: 'CH', label: 'Challenge Created' },
  [ACTIVITY_TYPES.CHALLENGE_ACCEPTED]: { icon: 'OK', label: 'Challenge Accepted' },
  [ACTIVITY_TYPES.CHALLENGE_DECLINED]: { icon: 'NO', label: 'Challenge Declined' },
  [ACTIVITY_TYPES.MATCH_SCHEDULED]: { icon: 'Cal', label: 'Match Scheduled' },
  [ACTIVITY_TYPES.MATCH_COMPLETED]: { icon: 'W', label: 'Match Completed' },
  [ACTIVITY_TYPES.SCORE_REPORTED]: { icon: '11', label: 'Score Reported' },
  [ACTIVITY_TYPES.TEAM_CREATED]: { icon: 'T', label: 'Team Created' },
  [ACTIVITY_TYPES.PLAYER_ADDED]: { icon: '+', label: 'Player Added' },
  [ACTIVITY_TYPES.PLAYER_JOINED_TEAM]: { icon: '+', label: 'Player Joined' },
  [ACTIVITY_TYPES.EVENT_CREATED]: { icon: 'Evt', label: 'Event Created' },
  [ACTIVITY_TYPES.EVENT_REGISTERED]: { icon: 'Reg', label: 'Event Registered' },
  [ACTIVITY_TYPES.STANDINGS_UPDATED]: { icon: 'Up', label: 'Standings Updated' },
};

function getActivityTypeMeta(type) {
  return ACTIVITY_TYPE_META[type] ?? { icon: '•', label: type || 'Activity' };
}

function formatActivityTimestamp(timestampMs) {
  if (!timestampMs) {
    return 'Just now';
  }

  const elapsedMs = Date.now() - timestampMs;
  const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);

  return `${elapsedDays}d ago`;
}

function createEmptyRosterForm() {
  return {
    active: true,
    availableDays: [],
    firstName: '',
    headshotFile: null,
    lastName: '',
    notes: '',
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

function PlayerWeeklyAvailabilityReadout({
  availableDays = [],
  legend = 'Best days to play',
  compactLabels = false,
}) {
  const selectedDayIds = new Set(Array.isArray(availableDays) ? availableDays : []);
  const hasSelection = PLAYER_AVAILABLE_DAYS.some((day) => selectedDayIds.has(day.id));

  return (
    <fieldset className="field checkbox-fieldset weekly-availability weekly-availability--readonly">
      <legend>{legend}</legend>
      <div
        className="checkbox-grid"
        role="group"
        aria-label={hasSelection ? legend : `${legend}: none selected yet`}
      >
        {PLAYER_AVAILABLE_DAYS.map((day) => {
          const isSelected = selectedDayIds.has(day.id);
          const label = compactLabels ? day.label.slice(0, 3) : day.label;

          return (
            <div
              key={day.id}
              className={`checkbox-option ${isSelected ? 'checkbox-option--selected' : ''}`}
              title={compactLabels ? day.label : undefined}
            >
              <span>{label}</span>
            </div>
          );
        })}
      </div>
      {!hasSelection ? <p className="weekly-availability__empty-note">No days selected yet.</p> : null}
    </fieldset>
  );
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
          disabled={disabled}
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
          disabled={disabled}
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

function MatchupLabelField({ linkedTeamClubSlug = '', linkedTeamSlug = '', onChange, opponent = '', teams = [] }) {
  const selectedTeamKey = linkedTeamClubSlug && linkedTeamSlug ? `${linkedTeamClubSlug}/${linkedTeamSlug}` : '';
  const hasExistingUnlistedValue = opponent && !selectedTeamKey && !teams.some((team) => team.name === opponent);

  return (
    <label className="field">
      <span>Opponent team</span>
      <select
        disabled={teams.length === 0 && !hasExistingUnlistedValue}
        onChange={(event) => {
          const selectedTeam = teams.find((team) => `${team.clubSlug}/${team.teamSlug}` === event.target.value) ?? null;
          onChange(selectedTeam);
        }}
        value={selectedTeamKey || (hasExistingUnlistedValue ? opponent : '')}
      >
        <option value="">Choose opponent team</option>
        {hasExistingUnlistedValue ? <option value={opponent}>{opponent}</option> : null}
        {teams.map((team) => (
          <option key={`${team.clubSlug}/${team.teamSlug}`} value={`${team.clubSlug}/${team.teamSlug}`}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScheduleMatchLineupPicker({ disabled, hint, label, max, onChange, players, selectedIds }) {
  const sorted = useMemo(() => {
    return [...players].sort((left, right) =>
      (left.fullName || '').localeCompare(right.fullName || '', undefined, { sensitivity: 'base' }),
    );
  }, [players]);

  function togglePlayer(playerId) {
    const next = new Set(selectedIds);

    if (next.has(playerId)) {
      next.delete(playerId);
    } else if (next.size < max) {
      next.add(playerId);
    }

    onChange(Array.from(next));
  }

  return (
    <fieldset className="schedule-admin-form__lineup">
      <legend>{label}</legend>
      <p className="schedule-admin-form__lineup-hint">{hint}</p>
      {sorted.length ? (
        <ul className="schedule-admin-form__lineup-list">
          {sorted.map((player) => {
            const checked = selectedIds.includes(player.id);
            const maxedOut = !checked && selectedIds.length >= max;

            return (
              <li key={player.id}>
                <label
                  className={`schedule-admin-form__lineup-option${maxedOut ? ' schedule-admin-form__lineup-option--maxed' : ''}`}
                >
                  <input
                    checked={checked}
                    disabled={disabled || maxedOut}
                    onChange={() => togglePlayer(player.id)}
                    type="checkbox"
                  />
                  <span>{player.fullName || 'Player'}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="schedule-admin-form__lineup-empty">No players on this roster yet.</p>
      )}
    </fieldset>
  );
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
    winPct: gamesPlayed ? summary.wins / gamesPlayed : 0,
    wins: summary.wins,
  };
}

function buildClubStandingsRow(teamSummary, games, currentTeamKey) {
  const teamKey = `${teamSummary.clubSlug}/${teamSummary.teamSlug}`;

  return {
    ...getTeamStandingsStats(games),
    clubSlug: teamSummary.clubSlug,
    isCurrentTeam: teamKey === currentTeamKey,
    logoUrl: teamSummary.logoUrl ?? '',
    name: teamSummary.name ?? teamSummary.teamName ?? teamSummary.teamSlug,
    teamSlug: teamSummary.teamSlug,
  };
}

function normalizeStandingsTeamName(value = '') {
  return String(value).trim().toLowerCase();
}

function buildClubStandingsRowsFromGames(teamsForStandings, gamesByTeamKey, currentTeamKey) {
  return teamsForStandings.map((teamSummary) => {
    const key = `${teamSummary.clubSlug}/${teamSummary.teamSlug}`;
    return buildClubStandingsRow(teamSummary, gamesByTeamKey.get(key) ?? [], currentTeamKey);
  });
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
  const sortedRows = sortStandingsRows(rows);

  if (loading) {
    return (
      <div className="standings-league-card">
        <div className="standings-league-card__header">
          <div>
            <p className="eyebrow">Club Standings</p>
            <h2>Building the standings table...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!sortedRows.length) {
    return null;
  }

  return (
    <div className="standings-league-card">
      <div className="standings-league-card__header">
        <div>
          <p className="eyebrow">Club Standings</p>
          <h2>Team Rankings</h2>
          <p>Teams are ranked by wins, then losses, win percentage, and point differential.</p>
        </div>
        <span>{sortedRows.length} team{sortedRows.length === 1 ? '' : 's'}</span>
      </div>

      <div className="standings-table" role="table" aria-label="Club standings">
        <div className="standings-table__row standings-table__row--head" role="row">
          <span role="columnheader">Rank</span>
          <span aria-label="Current team marker" role="columnheader" />
          <span role="columnheader">Team</span>
          <span role="columnheader">GP</span>
          <span role="columnheader">W</span>
          <span role="columnheader">L</span>
          <span role="columnheader">Win %</span>
          <span role="columnheader">PF</span>
          <span role="columnheader">PA</span>
          <span role="columnheader">Diff</span>
        </div>

        {sortedRows.map((row, index) => (
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
    </div>
  );
}

function StandingsSummary({ clubStandingsLoading = false, clubStandingsRows = [], games, team }) {
  const standings = useMemo(() => buildStandingsSummary(games), [games]);
  const opponentLogoByName = useMemo(
    () =>
      new Map(
        clubStandingsRows.map((row) => [
          normalizeStandingsTeamName(row.name),
          row.logoUrl || defaultTeamLogo,
        ]),
      ),
    [clubStandingsRows],
  );
  const totalDecisions = standings.wins + standings.losses;
  const winPercent = totalDecisions ? Math.round(Number(standings.winPct) * 100) : 0;

  return (
    <div className="standings-summary">
      <ClubStandingsBoard loading={clubStandingsLoading} rows={clubStandingsRows} />

      {standings.completedGames.length > 0 ? (
        <>
          <div className="standings-hero standings-hero--combined">
            <div className="standings-hero__main standings-hero__main--combined">
              <div className="standings-hero__record">
                <span className="standings-hero__label">Overall record</span>
                <strong>{formatRecord(standings.wins, standings.losses)}</strong>
                <span>
                  W-L · {standings.completedGames.length} completed matchup{standings.completedGames.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="standings-hero__metric">
                <span>Win rate</span>
                <strong>{winPercent}%</strong>
              </div>
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
                  const opponentLogoUrl = opponentLogoByName.get(normalizeStandingsTeamName(row.opponent)) || defaultTeamLogo;

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
                          <span>Match result</span>
                          <strong>{row.wins}-{row.losses}</strong>
                        </div>
                        <div className="standings-scoreboard__team standings-scoreboard__team--opponent">
                          <img
                            alt={`${row.opponent} logo`}
                            decoding="async"
                            loading="lazy"
                            src={opponentLogoUrl}
                          />
                          <span>{row.opponent}</span>
                        </div>
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

export function ActivityPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [activityClubName, setActivityClubName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadActivity() {
      if (!user?.uid) {
        setActivities([]);
        setActivityClubName('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const team = await getTeam(clubSlug, teamSlug);
        const isApprovedClubTeam =
          team?.affiliationStatus === 'approved' &&
          team?.approvedClubSlug &&
          team.approvedClubSlug !== 'independent';
        const activityClubSlug = isApprovedClubTeam ? team.approvedClubSlug : clubSlug;
        const nextActivities = await listClubActivity({
          clubSlug: activityClubSlug,
          limitCount: 75,
          teamOnly: !isApprovedClubTeam,
          teamSlug,
          user,
        });

        if (!ignore) {
          setActivities(nextActivities);
          setActivityClubName(team?.approvedClubName || team?.clubName || activityClubSlug);
        }
      } catch (loadError) {
        if (!ignore) {
          setActivities([]);
          setActivityClubName('');
          setError(loadError.message ?? 'Unable to load recent activity.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadActivity();

    return () => {
      ignore = true;
    };
  }, [clubSlug, teamSlug, user?.uid]);

  return (
    <div className="page-grid activity-page">
      <section className="card activity-page__feed-card">
        <div className="activity-page__section-header">
          <div>
            <p className="eyebrow activity-page__eyebrow">Activity</p>
            <h2>Recent Activity</h2>
            <p>
              Latest team, competition, match, standings, and event updates
              {activityClubName ? ` across ${activityClubName}.` : '.'}
            </p>
          </div>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {loading ? (
          <div className="state-panel">
            <p>Loading recent activity...</p>
          </div>
        ) : error ? null : activities.length > 0 ? (
          <div className="activity-feed">
            {activities.map((activity) => {
              const typeMeta = getActivityTypeMeta(activity.type);
              const iconSrc = ACTIVITY_ICON_BY_TYPE[activity.type];

              return (
                <article key={activity.id} className="activity-feed__item">
                  <div className="activity-feed__icon">
                    {iconSrc ? <img alt="" aria-hidden="true" src={iconSrc} /> : typeMeta.icon}
                  </div>
                  <div className="activity-feed__body">
                    <div className="activity-feed__header">
                      <div>
                        <h3>{activity.description}</h3>
                      </div>
                      <time dateTime={activity.timestampMs ? new Date(activity.timestampMs).toISOString() : undefined}>
                        {formatActivityTimestamp(activity.timestampMs)}
                      </time>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="notice notice--info">
            No activity has occurred yet. New team, player, challenge, and match updates will appear here.
          </div>
        )}
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

function buildDisplayedTeamRosterPlayers(members, players) {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const activeMembers = members.filter((member) => member.status !== 'inactive');
  const linkedRosterPlayers = activeMembers
    .map((member) => playersById.get(member.playerId) || playersById.get(member.uid))
    .filter(Boolean);
  const rosterSource = linkedRosterPlayers.length ? linkedRosterPlayers : players;

  return rosterSource
    .filter((player) => player.active !== false)
    .slice(0, TEAM_MEMBER_LIMIT);
}

function ClubEventsPanel({ clubName = '', clubSlug, managerToolsLabel = 'Club manager tools', managerView = false, user }) {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(createEmptyClubEventForm());
  const [editingEventId, setEditingEventId] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [archivingEventId, setArchivingEventId] = useState('');
  const [deletingEventId, setDeletingEventId] = useState('');
  const [eventMessage, setEventMessage] = useState('');
  const [eventError, setEventError] = useState('');
  const [showEventForm, setShowEventForm] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [previewFlyerEvent, setPreviewFlyerEvent] = useState(null);

  async function loadEvents() {
    if (!clubSlug) {
      setEvents([]);
      return;
    }

    setEvents(await listClubEvents({ clubSlug, includeDrafts: managerView, user }));
  }

  useEffect(() => {
    let ignore = false;

    setLoadingEvents(true);
    setEventError('');
    loadEvents()
      .catch((loadError) => {
        if (!ignore) {
          setEvents([]);
          setEventError(loadError.message ?? 'Unable to load club events.');
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadingEvents(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [clubSlug, managerView, user?.uid]);

  function updateEventForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setEventMessage('');
    setEventError('');
  }

  function startNewEvent() {
    setEditingEventId('');
    setForm(createEmptyClubEventForm());
    setShowEventForm(true);
    setEventMessage('');
    setEventError('');
  }

  function startEditEvent(event) {
    setEditingEventId(event.id);
    setForm(createEmptyClubEventForm(event));
    setShowEventForm(true);
    setEventMessage('');
    setEventError('');
  }

  function cancelEventEdit() {
    setEditingEventId('');
    setForm(createEmptyClubEventForm());
    setShowEventForm(false);
    setEventError('');
  }

  async function handleEventSubmit(event) {
    event.preventDefault();
    setSavingEvent(true);
    setEventMessage('');
    setEventError('');

    try {
      await saveClubEvent({
        bulletPoints: form.bulletPointsText,
        clubSlug,
        costLabel: form.costLabel,
        description: form.description,
        detailsHeading: form.detailsHeading,
        endDate: form.endDate,
        eventId: editingEventId,
        eventType: form.eventType,
        flyerFile: form.flyerFile,
        locationLabel: form.locationLabel,
        registrationInfo: form.registrationInfo,
        registrationUrl: form.registrationUrl,
        startDate: form.startDate,
        status: form.status,
        timeLabel: form.timeLabel,
        title: form.title,
        user,
      });
      setEventMessage(editingEventId ? 'Event updated.' : 'Event created.');
      setEditingEventId('');
      setForm(createEmptyClubEventForm());
      setShowEventForm(false);
      await loadEvents();
    } catch (submitError) {
      setEventError(submitError.message ?? 'Unable to save that event.');
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleArchiveEvent(event) {
    if (!window.confirm(`Archive ${event.title}?`)) {
      return;
    }

    setArchivingEventId(event.id);
    setEventMessage('');
    setEventError('');

    try {
      await archiveClubEvent({ clubSlug, eventId: event.id, user });
      setEventMessage('Event archived.');
      await loadEvents();
    } catch (archiveError) {
      setEventError(archiveError.message ?? 'Unable to archive that event.');
    } finally {
      setArchivingEventId('');
    }
  }

  async function handleDeleteEvent(event) {
    const confirmed = window.confirm(
      `Delete ${event.title}? This permanently removes the event listing and flyer image.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingEventId(event.id);
    setEventMessage('');
    setEventError('');

    try {
      await deleteClubEvent({ clubSlug, eventId: event.id, user });
      setEventMessage('Event deleted.');
      if (editingEventId === event.id) {
        cancelEventEdit();
      }
      await loadEvents();
    } catch (deleteError) {
      setEventError(deleteError.message ?? 'Unable to delete that event.');
    } finally {
      setDeletingEventId('');
    }
  }

  return (
    <div className="club-events-panel">
      {eventError ? <div className="notice notice--error">{eventError}</div> : null}

      {managerView ? (
        <section className="schedule-admin-card club-events-manager-card">
          <div className="schedule-admin-card__header">
            <div>
              <p className="eyebrow">{managerToolsLabel}</p>
              <h2>Events</h2>
              <p>Create event listings for {clubName || 'this club'}.</p>
            </div>
            <button className="button" onClick={startNewEvent} type="button">
              New Event
            </button>
          </div>

          {showEventForm ? (
            <form className="schedule-admin-form club-event-form" onSubmit={handleEventSubmit}>
              <div className="player-admin-form__row">
                <label className="field">
                  <span>Title</span>
                  <input onChange={(event) => updateEventForm('title', event.target.value)} value={form.title} />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select onChange={(event) => updateEventForm('status', event.target.value)} value={form.status}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>
              <label className="field field--wide">
                <span>Description</span>
                <textarea onChange={(event) => updateEventForm('description', event.target.value)} rows={4} value={form.description} />
              </label>
              <div className="player-admin-form__row">
                <label className="field">
                  <span>Details heading</span>
                  <input onChange={(event) => updateEventForm('detailsHeading', event.target.value)} value={form.detailsHeading} />
                </label>
                <label className="field">
                  <span>Event type</span>
                  <select onChange={(event) => updateEventForm('eventType', event.target.value)} value={form.eventType}>
                    <option value="singleDay">Single-day event</option>
                    <option value="multiDay">Multi-day event</option>
                    <option value="boxLeague">Box league</option>
                  </select>
                </label>
              </div>
              <label className="field field--wide">
                <span>Bullet points</span>
                <textarea
                  onChange={(event) => updateEventForm('bulletPointsText', event.target.value)}
                  placeholder="One bullet per line"
                  rows={5}
                  value={form.bulletPointsText}
                />
              </label>
              <div className="player-admin-form__row">
                <label className="field">
                  <span>Start date</span>
                  <input onChange={(event) => updateEventForm('startDate', event.target.value)} type="date" value={form.startDate} />
                </label>
                <label className="field">
                  <span>End date</span>
                  <input onChange={(event) => updateEventForm('endDate', event.target.value)} type="date" value={form.endDate} />
                </label>
              </div>
              <div className="player-admin-form__row">
                <label className="field">
                  <span>Time</span>
                  <input onChange={(event) => updateEventForm('timeLabel', event.target.value)} placeholder="5PM - 7PM" value={form.timeLabel} />
                </label>
                <label className="field">
                  <span>Location</span>
                  <input
                    onChange={(event) => updateEventForm('locationLabel', event.target.value)}
                    placeholder="Sports Complex Pickleball Courts"
                    value={form.locationLabel}
                  />
                </label>
              </div>
              <div className="player-admin-form__row">
                <label className="field">
                  <span>Cost</span>
                  <input onChange={(event) => updateEventForm('costLabel', event.target.value)} placeholder="$25 per person" value={form.costLabel} />
                </label>
                <label className="field">
                  <span>Signup URL</span>
                  <input
                    onChange={(event) => updateEventForm('registrationUrl', event.target.value)}
                    placeholder="https://..."
                    type="url"
                    value={form.registrationUrl}
                  />
                </label>
              </div>
              <label className="field field--wide">
                <span>Registration information</span>
                <textarea
                  onChange={(event) => updateEventForm('registrationInfo', event.target.value)}
                  placeholder="Click to register."
                  rows={3}
                  value={form.registrationInfo}
                />
              </label>
              <label className="field">
                <span>Flyer image</span>
                <input accept="image/*" onChange={(event) => updateEventForm('flyerFile', event.target.files?.[0] ?? null)} type="file" />
              </label>
              <div className="player-admin-form__primary-actions">
                <button className="button" disabled={savingEvent} type="submit">
                  {savingEvent ? 'Saving...' : editingEventId ? 'Save Event' : 'Create Event'}
                </button>
                <button className="button button--ghost" onClick={cancelEventEdit} type="button">
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {loadingEvents ? (
        <div className="state-panel">
          <p>Loading club events...</p>
        </div>
      ) : events.length > 0 ? (
        <div className="club-events-grid">
          {events.map((event) => (
            <article key={event.id} className={`club-event-card ${event.flyerImageUrl ? '' : 'club-event-card--no-flyer'}`}>
              {event.flyerImageUrl ? (
                <button
                  className="club-event-card__flyer-button"
                  onClick={() => setPreviewFlyerEvent(event)}
                  type="button"
                >
                  <img alt={`${event.title} flyer`} className="club-event-card__flyer" src={event.flyerImageUrl} />
                  <span>View flyer</span>
                </button>
              ) : null}
              <div className="club-event-card__body">
                <div className="club-event-card__header">
                  <div>
                    <p className="eyebrow">{event.eventType === 'boxLeague' ? 'Box league' : 'Club event'}</p>
                    <h2>{event.title}</h2>
                  </div>
                  {managerView ? <span className="status-badge">{event.status}</span> : null}
                </div>
                {event.description ? <p className="club-event-card__description">{event.description}</p> : null}
                <div className="club-event-card__meta">
                  <span>{formatEventDateRange(event)}</span>
                  <span>{event.timeLabel || 'Time TBD'}</span>
                  <span>{event.locationLabel || 'Location TBD'}</span>
                  <span>{formatEventCost(event.costLabel)}</span>
                </div>
                {event.detailsHeading || event.bulletPoints.length > 0 ? (
                  <div className="club-event-card__details">
                    <h3>{event.detailsHeading || 'Details'}</h3>
                    {event.bulletPoints.length > 0 ? (
                      <ul>
                        {event.bulletPoints.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {event.registrationInfo ? (
                  <p className="club-event-card__registration">{formatRegistrationInfo(event.registrationInfo)}</p>
                ) : null}
                <div className="club-event-card__actions">
                  {event.registrationUrl ? (
                    <a className="button" href={event.registrationUrl} rel="noreferrer" target="_blank">
                      Register
                    </a>
                  ) : null}
                  {managerView ? (
                    <>
                      <button className="button button--ghost" onClick={() => startEditEvent(event)} type="button">
                        Edit
                      </button>
                      <button
                        className="button button--danger"
                        disabled={archivingEventId === event.id}
                        onClick={() => handleArchiveEvent(event)}
                        type="button"
                      >
                        {archivingEventId === event.id ? 'Archiving...' : 'Archive'}
                      </button>
                      <button
                        className="button button--danger"
                        disabled={deletingEventId === event.id}
                        onClick={() => handleDeleteEvent(event)}
                        type="button"
                      >
                        {deletingEventId === event.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="notice notice--info">No club events are currently scheduled.</div>
      )}

      {previewFlyerEvent ? (
        <div className="club-event-flyer-preview" role="dialog" aria-modal="true" aria-label={`${previewFlyerEvent.title} flyer`}>
          <button
            aria-label="Close flyer preview"
            className="club-event-flyer-preview__backdrop"
            onClick={() => setPreviewFlyerEvent(null)}
            type="button"
          />
          <div className="club-event-flyer-preview__panel">
            <div className="club-event-flyer-preview__header">
              <h2>{previewFlyerEvent.title}</h2>
              <button className="button button--ghost" onClick={() => setPreviewFlyerEvent(null)} type="button">
                Close
              </button>
            </div>
            <img alt={`${previewFlyerEvent.title} flyer`} src={previewFlyerEvent.flyerImageUrl} />
          </div>
        </div>
      ) : null}
    </div>
  );
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
  const [activeClubTab, setActiveClubTab] = useState('events');
  const [clubPlayerSearch, setClubPlayerSearch] = useState('');
  const [publishedEventCount, setPublishedEventCount] = useState(0);

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
        setPublishedEventCount(0);
        return;
      }

      const [approvedTeams, clubs, publishedEvents] = await Promise.all([
        listApprovedClubTeams(approvedClubSlug),
        listClubs().catch(() => []),
        listClubEvents({ clubSlug: approvedClubSlug }).catch(() => []),
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
        setPublishedEventCount(publishedEvents.filter((event) => event.status === 'published').length);
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
          setPublishedEventCount(0);
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
                  <span>
                    <strong>{publishedEventCount}</strong>
                    <small>Events</small>
                  </span>
                </span>
              </Link>
            ) : null}

            <div className="club-teams-page__toolbar">
              <div className="club-teams-page__tabs" role="tablist" aria-label="Club hub sections">
                <button
                  aria-controls="club-hub-events-panel"
                  aria-selected={activeClubTab === 'events'}
                  className={activeClubTab === 'events' ? 'club-teams-page__tab--active' : ''}
                  onClick={() => setActiveClubTab('events')}
                  role="tab"
                  type="button"
                >
                  Events
                </button>
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

            {activeClubTab === 'events' ? (
              <div id="club-hub-events-panel" role="tabpanel">
                <ClubEventsPanel
                  clubName={clubName}
                  clubSlug={approvedClubSlug}
                  managerView={false}
                  user={user}
                />
              </div>
            ) : activeClubTab === 'teams' ? (
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
            ) : activeClubTab === 'players' ? (
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
                          <strong>{clubPlayer.record.wins}-{clubPlayer.record.losses}</strong>
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
            ) : null}
          </>
        ) : (
          <p>No other club teams are connected here yet.</p>
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

export function ClubEventsStandalonePage() {
  const { clubSlug } = useParams();
  const { user } = useAuth();
  const [club, setClub] = useState(null);
  const [managerAccess, setManagerAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadClubEventAccess() {
      const [clubs, access] = await Promise.all([
        listClubs().catch(() => []),
        canManageClub({ clubSlug, user }).catch(() => false),
      ]);

      if (!ignore) {
        setClub(clubs.find((item) => item.slug === clubSlug) ?? null);
        setManagerAccess(access);
      }
    }

    setLoading(true);
    setError('');
    loadClubEventAccess()
      .catch((loadError) => {
        if (!ignore) {
          setError(loadError.message ?? 'Unable to load club events.');
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
  }, [clubSlug, user?.uid]);

  return (
    <div className="auth-page standalone-mobile-page">
      <section className="card">
        <p className="eyebrow">Club manager</p>
        <h1>{club?.name ? `${club.name} Events` : 'Club Events'}</h1>
        <p>Manage event listings for club members and players.</p>
        <div className="choice-row">
          <Link className="button button--ghost" to="/teams">
            My Teams
          </Link>
          <Link className="button button--ghost" to="/admin">
            App Admin
          </Link>
        </div>

        {loading ? (
          <div className="state-panel">
            <p>Loading club events...</p>
          </div>
        ) : error ? (
          <div className="notice notice--error">{error}</div>
        ) : managerAccess ? (
          <ClubEventsPanel clubName={club?.name ?? ''} clubSlug={clubSlug} managerView user={user} />
        ) : (
          <div className="notice notice--error">You do not have club manager access for this club.</div>
        )}
      </section>
    </div>
  );
}

export function ClubEventsPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadClubEventsContext() {
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
    loadClubEventsContext()
      .catch((loadError) => {
        if (!ignore) {
          setTeam(null);
          setClub(null);
          setError(loadError.message ?? 'Unable to load club events yet.');
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
  const hasApprovedClub = team?.affiliationStatus === 'approved' && approvedClubSlug && approvedClubSlug !== 'independent';

  return (
    <div className="page-grid club-events-page">
      <section className="card">
        <p className="eyebrow">Club Events</p>
        <h1>{hasApprovedClub ? `${clubName} Events` : 'Events'}</h1>
        <p>Find club events, clinics, socials, and other pickleball programs in one place.</p>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {loading ? (
          <div className="state-panel">
            <p>Loading club events...</p>
          </div>
        ) : hasApprovedClub ? (
          <ClubEventsPanel clubName={clubName} clubSlug={approvedClubSlug} user={user} />
        ) : (
          <div className="notice notice--info">
            Club events are available after this team is connected to an approved club.
          </div>
        )}
      </section>
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
  const [clubTeamSummaries, setClubTeamSummaries] = useState([]);
  const [clubName, setClubName] = useState('');
  const [activeTeamTab, setActiveTeamTab] = useState('our-team');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadTeamPage() {
      const [teamData, playerData, memberData, gameData, membershipData] = await Promise.all([
        getTeam(clubSlug, teamSlug),
        listPlayers(clubSlug, teamSlug),
        listTeamMembers(clubSlug, teamSlug),
        listGames(clubSlug, teamSlug),
        user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
      ]);

      let nextClubTeamSummaries = [];
      let nextClubName = '';
      const approvedClubSlug = teamData?.approvedClubSlug ?? '';

      if (
        teamData?.affiliationStatus === 'approved' &&
        approvedClubSlug &&
        approvedClubSlug !== 'independent'
      ) {
        const [approvedTeams, clubs] = await Promise.all([
          listApprovedClubTeams(approvedClubSlug),
          listClubs().catch(() => []),
        ]);

        nextClubName = clubs.find((club) => club.slug === approvedClubSlug)?.name ?? formatClubTeamsClubName(approvedClubSlug);
        nextClubTeamSummaries = await Promise.all(
          approvedTeams.map(async (clubTeam) => {
            const isCurrentTeam = clubTeam.clubSlug === clubSlug && clubTeam.teamSlug === teamSlug;
            const [teamMembers, teamPlayers, teamGames] = isCurrentTeam
              ? [memberData, playerData, gameData]
              : await Promise.all([
                  listTeamMembers(clubTeam.clubSlug, clubTeam.teamSlug),
                  listPlayers(clubTeam.clubSlug, clubTeam.teamSlug),
                  listGames(clubTeam.clubSlug, clubTeam.teamSlug),
                ]);
            const stats = getTeamStandingsStats(teamGames);
            const activeMembers = teamMembers.filter((member) => member.status !== 'inactive');

            return {
              ...clubTeam,
              ...stats,
              captainNames: buildClubTeamCaptainNames(teamMembers, teamPlayers),
              memberCount: activeMembers.length || teamMembers.length,
              rosterPlayers: buildDisplayedTeamRosterPlayers(teamMembers, teamPlayers),
            };
          }),
        );

        const rosterPlayersForAvatars = nextClubTeamSummaries.flatMap((clubTeam) => clubTeam.rosterPlayers ?? []);
        const playerAvatarsByUid = await getUserProfileAvatarsByUid(
          rosterPlayersForAvatars.map((player) => player.uid).filter(Boolean),
        );

        nextClubTeamSummaries = nextClubTeamSummaries.map((clubTeam) => ({
          ...clubTeam,
          rosterPlayers: (clubTeam.rosterPlayers ?? []).map((player) => ({
            ...player,
            headshotUrl:
              (player.uid && playerAvatarsByUid[player.uid]) ||
              resolvePlayerAvatarUrl({ player }),
          })),
        }));
      }

      if (!ignore) {
        setTeam(teamData);
        setPlayers(playerData);
        setMembers(memberData);
        setGames(gameData);
        setMembership(membershipData);
        setClubTeamSummaries(nextClubTeamSummaries);
        setClubName(nextClubName);
        setActiveTeamTab('our-team');
        setError('');
      }
    }

    loadTeamPage().catch((loadError) => {
      if (!ignore) {
        setTeam(null);
        setPlayers([]);
        setMembers([]);
        setGames([]);
        setMembership(null);
        setClubTeamSummaries([]);
        setClubName('');
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
        record: { losses: 0, wins: 0 },
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
  const canShowTeamTabs = clubTeamSummaries.length > 1;
  const isAllTeamsView = canShowTeamTabs && activeTeamTab === 'all-teams';
  const teamTitle = team?.name ? `The ${team.name} Team` : 'The Team';
  const pageEyebrow = isAllTeamsView ? 'Team directory' : 'Current roster';
  const pageTitle = isAllTeamsView ? `${clubName || 'Club'} Teams` : teamTitle;
  const pageCopy = isAllTeamsView
    ? `Browse all teams in ${clubName || 'your club'} with rosters and records.`
    : `Meet the ${team?.name ?? 'team'} players who make up the team.`;
  const pageCountLabel = isAllTeamsView
    ? `${clubTeamSummaries.length} Team${clubTeamSummaries.length === 1 ? '' : 's'}`
    : `${rosterPlayerCount} Members`;
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
            <p className="eyebrow">{pageEyebrow}</p>
            <h1>{pageTitle}</h1>
            <p className="team-members-card__copy">{pageCopy}</p>
          </div>
          <div className="team-members-card__count">{pageCountLabel}</div>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {canShowTeamTabs ? (
          <div className="team-members-card__tabs-row">
            <div className="availability-tabs" aria-label="Team views">
              <button
                className={`availability-tabs__button ${activeTeamTab === 'our-team' ? 'availability-tabs__button--active' : ''}`}
                onClick={() => setActiveTeamTab('our-team')}
                type="button"
              >
                Our Team ({rosterPlayerCount})
              </button>
              <button
                className={`availability-tabs__button ${activeTeamTab === 'all-teams' ? 'availability-tabs__button--active' : ''}`}
                onClick={() => setActiveTeamTab('all-teams')}
                type="button"
              >
                All Teams ({clubTeamSummaries.length})
              </button>
            </div>
          </div>
        ) : null}

        {activeTeamTab === 'our-team' || !canShowTeamTabs ? (
          <>
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
                        <strong>{entry.record.wins}-{entry.record.losses}</strong>
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
          </>
        ) : (
          <div className="team-members-team-grid">
              {clubTeamSummaries.map((clubTeam) => {
                const isCurrentTeam = clubTeam.clubSlug === clubSlug && clubTeam.teamSlug === teamSlug;

                return (
                  <article
                    key={`${clubTeam.clubSlug}-${clubTeam.teamSlug}`}
                    className={`home-team-card${isCurrentTeam ? ' home-team-card--current' : ''}`}
                  >
                    <img
                      alt={`${clubTeam.name} logo`}
                      className="home-team-card__logo"
                      decoding="async"
                      loading="lazy"
                      src={clubTeam.logoUrl || defaultTeamLogo}
                    />
                    <div className="home-team-card__body">
                      <div className="home-team-card__header">
                        <h3>
                          {clubTeam.name}
                          {isCurrentTeam ? ' (your team)' : ''}
                        </h3>
                        <span>
                          {clubTeam.gamesPlayed} match{clubTeam.gamesPlayed === 1 ? '' : 'es'} ·{' '}
                          {clubTeam.wins}-{clubTeam.losses} W-L
                        </span>
                      </div>
                      <div className="home-team-card__players">
                        {clubTeam.rosterPlayers?.length ? (
                          clubTeam.rosterPlayers.map((player) => (
                            <div key={player.id} className="home-team-card__player">
                              {player.headshotUrl ? (
                                <img alt={`${getPlayerName(player)} headshot`} src={player.headshotUrl} />
                              ) : (
                                <span>{buildPlayerInitials(getPlayerName(player))}</span>
                              )}
                              <strong>{getPlayerName(player)}</strong>
                            </div>
                          ))
                        ) : (
                          <span>Roster pending</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
        )}
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
      window.dispatchEvent(new Event('team-updated'));
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
  const profileHeadshotUrl = resolveProfileAvatarUrl(
    {
      ...(userProfile ?? {}),
      photoURL: userProfile?.photoURL ?? user?.photoURL ?? '',
    },
    user?.photoURL ?? '',
  );
  const profileFirstName = userProfile?.firstName || player?.firstName || 'Not set';
  const profileLastName = userProfile?.lastName || player?.lastName || 'Not set';

  return (
    <div className="page-grid schedule-admin-page">
      <section className="card">
        <p className="eyebrow">Profile</p>
        <h1>Your player profile</h1>

        {error ? <div className="notice notice--error">{error}</div> : null}

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
  const [playerAvatarsByUid, setPlayerAvatarsByUid] = useState({});
  const [members, setMembers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [updatingPlayerId, setUpdatingPlayerId] = useState('');
  const [updatingUid, setUpdatingUid] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const canManage = canManageRole(membership?.role);
  const canManageMembership = isCaptainRole(membership?.role);
  const memberByPlayerId = useMemo(
    () => new Map(members.filter((member) => member.playerId).map((member) => [member.playerId, member])),
    [members],
  );
  const memberByUid = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );
  const playerCards = useMemo(
    () => players.map((player) => ({
      member: memberByPlayerId.get(player.id) ?? memberByUid.get(player.uid),
      player,
    })),
    [memberByPlayerId, memberByUid, players],
  );

  async function loadRosterData() {
    const [playerData, memberData, membershipData] = await Promise.all([
      listPlayers(clubSlug, teamSlug),
      listTeamMembers(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    const avatarMap = await getUserProfileAvatarsByUid(
      playerData.map((player) => player.uid).filter(Boolean),
    );

    setPlayers(playerData);
    setPlayerAvatarsByUid(avatarMap);
    setMembers(memberData);
    setMembership(membershipData);
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
      setMessage('Player dropped from the team.');
      await loadRosterData();
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to drop that player right now.');
    } finally {
      setUpdatingPlayerId('');
    }
  }

  async function handleRoleChange(memberRecord, nextRole, playerName) {
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
      setMessage(`${playerName || 'Player'} role updated to ${formatRoleLabel(nextRole).toLowerCase()}.`);
      await loadRosterData();
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to update that team role.');
    } finally {
      setUpdatingUid('');
    }
  }

  return (
    <div className="page-grid schedule-admin-page">
      <section className="card">
        <p className="eyebrow">Roster admin</p>
        <h1>Manage Players</h1>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {canManage ? (
          <>
            <section className="schedule-admin-card roster-management-card">
              <div className="schedule-admin-card__header">
                <div>
                  <h2>Team roster</h2>
                  <p>Review each player, update co-captain access, or remove players from this team.</p>
                </div>
                <span className="team-members-card__count">
                  {players.length} player{players.length === 1 ? '' : 's'}
                </span>
              </div>

              {playerCards.length > 0 ? (
                <div className="roster-player-grid">
                  {playerCards.map(({ member, player }) => {
                    const displayName = player.fullName || player.email || 'Unnamed player';
                    const role = member?.role ?? 'member';
                    const canEditRole =
                      canManageMembership &&
                      member &&
                      role !== 'captain' &&
                      member.uid !== user?.uid;
                    const roleLockLabel =
                      role === 'captain'
                        ? 'Locked primary captain'
                        : canManageMembership
                          ? member?.uid === user?.uid
                            ? 'You cannot change your own role here'
                            : 'Role controls unavailable until this roster entry is linked'
                          : 'Only the captain can change team roles';
                    const playerAvatarUrl =
                      (player.uid && playerAvatarsByUid[player.uid]) ||
                      resolvePlayerAvatarUrl({ player });

                    return (
                      <article key={player.id} className={`member-role-card roster-player-card member-role-card--${role}`}>
                        <div className="member-role-card__avatar roster-player-card__avatar">
                          {playerAvatarUrl ? (
                            <img alt="" src={playerAvatarUrl} />
                          ) : (
                            buildPlayerInitials(displayName)
                          )}
                        </div>
                        <div className="member-role-card__body">
                          <div className="member-admin__header">
                            <div className="member-role-card__identity">
                              <strong>{displayName}</strong>
                              <span>{player.email || member?.uid || 'No email on file'}</span>
                            </div>
                            <span className={`status-badge member-role-card__badge member-role-card__badge--${role}`}>
                              {formatRoleLabel(role)}
                            </span>
                          </div>

                          <div className="roster-player-card__details">
                            <span>
                              <small>First name</small>
                              <strong>{player.firstName || 'Not set'}</strong>
                            </span>
                            <span>
                              <small>Last name</small>
                              <strong>{player.lastName || 'Not set'}</strong>
                            </span>
                            <span>
                              <small>Skill level</small>
                              <strong>{player.skillLevel || 'Not set'}</strong>
                            </span>
                          </div>

                          <PlayerWeeklyAvailabilityReadout
                            availableDays={player.availableDays}
                            compactLabels
                            legend="Best days to play"
                          />

                          {canEditRole ? (
                            <div className="member-role-card__actions" aria-label={`Change role for ${displayName}`}>
                              <button
                                className={`choice-button ${role === 'member' ? 'choice-button--active' : ''}`}
                                disabled={updatingUid === member.uid}
                                onClick={() => handleRoleChange(member, 'member', displayName)}
                                type="button"
                              >
                                {updatingUid === member.uid && role === 'coCaptain' ? 'Saving...' : 'Member'}
                              </button>
                              <button
                                className={`choice-button ${role === 'coCaptain' ? 'choice-button--active' : ''}`}
                                disabled={updatingUid === member.uid}
                                onClick={() => handleRoleChange(member, 'coCaptain', displayName)}
                                type="button"
                              >
                                {updatingUid === member.uid && role === 'member' ? 'Saving...' : 'Co-captain'}
                              </button>
                            </div>
                          ) : (
                            <div className="member-role-card__locked">{roleLockLabel}</div>
                          )}

                          <div className="roster-player-card__actions">
                            <button
                              className="button button--danger"
                              disabled={updatingPlayerId === player.id}
                              onClick={() => handleDropPlayer(player)}
                              type="button"
                            >
                              {updatingPlayerId === player.id ? 'Dropping...' : 'Drop from Team'}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p>Share the team join code to add the first player.</p>
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
  const [membership, setMembership] = useState(null);
  const [players, setPlayers] = useState([]);
  const [courtOptions, setCourtOptions] = useState([]);
  const [matchTeamOptions, setMatchTeamOptions] = useState([]);
  const [teamProfile, setTeamProfile] = useState({ logoUrl: '', name: '' });
  const [activeTab, setActiveTab] = useState('scheduled');
  const [editorMode, setEditorMode] = useState('');
  const [editingGameId, setEditingGameId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(createEmptyScheduleAdminForm());
  const [scoreEditorGameId, setScoreEditorGameId] = useState('');
  const [scoreForm, setScoreForm] = useState(createScoreEntryDraft());
  const [deletingGameId, setDeletingGameId] = useState('');
  const [deleteConfirmGame, setDeleteConfirmGame] = useState(null);
  const [linkedMatchPlayers, setLinkedMatchPlayers] = useState([]);

  const canManage = canManageRole(membership?.role);
  const isCreateEditorOpen = editorMode === 'create';
  const isEditEditorOpen = editorMode === 'edit';
  const isEditorOpen = isCreateEditorOpen || isEditEditorOpen;
  const editingGame = isEditEditorOpen ? games.find((game) => game.id === editingGameId) ?? null : null;
  const scoringGame = scoreEditorGameId ? games.find((game) => game.id === scoreEditorGameId) ?? null : null;

  async function loadScheduleData() {
    const [gameData, membershipData, playerData, memberData, teamData, clubData] = await Promise.all([
      listGames(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
      listPlayers(clubSlug, teamSlug),
      listTeamMembers(clubSlug, teamSlug),
      getTeam(clubSlug, teamSlug),
      listClubs({ includeIndependent: true }),
    ]);
    const roleByPlayerId = new Map(
      memberData
        .filter((member) => member.playerId)
        .map((member) => [member.playerId, member.role ?? '']),
    );
    const activeClubSlug =
      teamData?.affiliationStatus === 'approved' && teamData?.approvedClubSlug
        ? teamData.approvedClubSlug
        : clubSlug;
    const activeClub = clubData.find((club) => club.slug === activeClubSlug) ?? null;
    const approvedTeamOptions =
      activeClubSlug && activeClubSlug !== 'independent'
        ? await listApprovedClubTeams(activeClubSlug).catch(() => [])
        : [];
    const opponentTeamOptions = approvedTeamOptions.filter(
      (team) => !(team.clubSlug === clubSlug && team.teamSlug === teamSlug),
    );
    const playerAvatarsByUid = await getUserProfileAvatarsByUid(
      playerData.map((player) => player.uid).filter(Boolean),
    );

    setGames(gameData);
    setMembership(membershipData);
    setPlayers(
      playerData.map((player) => ({
        ...player,
        memberRole: roleByPlayerId.get(player.id) ?? '',
        headshotUrl:
          (player.uid && playerAvatarsByUid[player.uid]) ||
          resolvePlayerAvatarUrl({ player }),
      })),
    );
    setCourtOptions(buildCourtOptionsFromClub(activeClub));
    setMatchTeamOptions(opponentTeamOptions);
    setTeamProfile({
      logoUrl: teamData?.logoUrl ?? '',
      name: teamData?.name ?? teamSlug,
    });
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

  useEffect(() => {
    if (!clubSlug || !teamSlug) {
      return;
    }

    markScheduleViewed(clubSlug, teamSlug);
    window.dispatchEvent(new Event('schedule-viewed'));
  }, [clubSlug, teamSlug]);

  useEffect(() => {
    if (!isEditorOpen || !isCreateEditorOpen || !form.linkedTeamClubSlug || !form.linkedTeamSlug) {
      setLinkedMatchPlayers([]);
      return;
    }

    let cancelled = false;

    listPlayers(form.linkedTeamClubSlug, form.linkedTeamSlug)
      .then((rows) => {
        if (!cancelled) {
          setLinkedMatchPlayers(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLinkedMatchPlayers([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isEditorOpen, isCreateEditorOpen, form.linkedTeamClubSlug, form.linkedTeamSlug]);

  const scheduledGames = useMemo(
    () => sortGamesByMostRecent(games.filter((game) => !isMatchCompleted(game))),
    [games],
  );
  const completedGames = useMemo(
    () => sortGamesByMostRecent(games.filter((game) => isMatchCompleted(game))),
    [games],
  );
  const visibleGames = activeTab === 'completed' ? completedGames : scheduledGames;

  function openCreateEditor() {
    setEditorMode('create');
    setScoreEditorGameId('');
    setEditingGameId('');
    setForm(createEmptyScheduleAdminForm());
    setError('');
    setMessage('');
  }

  function openEditEditor(game) {
    setEditorMode('edit');
    setScoreEditorGameId('');
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

  function openScoreEditor(game) {
    setEditorMode('');
    setEditingGameId('');
    setScoreEditorGameId(game.id);
    setScoreForm(createScoreEntryDraft(game));
    setError('');
    setMessage('');
  }

  function closeScoreEditor() {
    setScoreEditorGameId('');
    setScoreForm(createScoreEntryDraft());
  }

  function clearScoreDraft() {
    setScoreForm(createScoreEntryDraft());
    setError('');
  }

  function updateScoreDraft(index, field, value) {
    setScoreForm((current) => ({
      ...current,
      matchScores: current.matchScores.map((score, scoreIndex) =>
        scoreIndex === index
          ? {
              ...score,
              [field]: value,
            }
          : score,
      ),
    }));
  }

  async function handleEditorSubmit(event) {
    event.preventDefault();

    if (isEditEditorOpen && !editingGame) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const savedGameId = await saveGame({
        ...form,
        clubSlug,
        gameId: editingGame?.id,
        teamSlug,
        user,
      });

      const homeRosterIds = form.rosterPlayerIds.slice(0, form.playersNeeded);
      const homePairings = [{ courtLabel: 'Court 1', playerIds: homeRosterIds }];

      await saveGamePairings({
        clubSlug,
        gameId: savedGameId,
        pairings: homePairings,
        rosterPlayerIds: homeRosterIds,
        teamSlug,
      });

      const isLinkedOpponent = Boolean(form.linkedTeamClubSlug && form.linkedTeamSlug);
      const mirrorGameId =
        editingGame?.linkedGameId ||
        (isLinkedOpponent ? `manual-${savedGameId}-${form.linkedTeamSlug}` : '');

      if (isLinkedOpponent && mirrorGameId && isCreateEditorOpen) {
        const awayRosterIds = form.linkedRosterPlayerIds.slice(0, form.playersNeeded);

        await saveGamePairings({
          clubSlug: form.linkedTeamClubSlug,
          gameId: mirrorGameId,
          pairings: [{ courtLabel: 'Court 1', playerIds: awayRosterIds }],
          rosterPlayerIds: awayRosterIds,
          teamSlug: form.linkedTeamSlug,
        });
      }

      setMessage(isCreateEditorOpen ? 'Match created.' : 'Matchup updated.');
      closeEditor();
      if (isCreateEditorOpen) {
        setActiveTab('scheduled');
      }
      await loadScheduleData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save that matchup.');
    } finally {
      setSaving(false);
    }
  }

  async function handleScoreSubmit(event) {
    event.preventDefault();

    if (!scoringGame) {
      return;
    }

    const resettingScores = scoreDraftIsBlank(scoreForm.matchScores);
    const firstTwoScoresComplete = scoreForm.matchScores
      .slice(0, 2)
      .every((score) => score.teamScore !== '' && score.opponentScore !== '');

    if (!resettingScores && !firstTwoScoresComplete) {
      setError('Enter scores for the first two games.');
      return;
    }

    if (!resettingScores && hasSplitFirstTwoSets(scoreForm.matchScores)) {
      const thirdScore = scoreForm.matchScores[2] ?? {};

      if (thirdScore.teamScore === '' || thirdScore.opponentScore === '') {
        setError('Enter the third game score because the teams split the first two games.');
        return;
      }
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await saveGame({
        ...createScheduleAdminDraft(scoringGame),
        clubSlug,
        gameId: scoringGame.id,
        matchScores: resettingScores ? [] : scoreForm.matchScores,
        matchStatus: resettingScores ? 'scheduled' : 'completed',
        opponentScore: resettingScores ? '' : undefined,
        teamSlug,
        teamScore: resettingScores ? '' : undefined,
        user,
      });
      setMessage(resettingScores ? 'Scores cleared. Match reset to scheduled.' : 'Scores entered.');
      closeScoreEditor();
      await loadScheduleData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save those scores.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteMatch() {
    const game = deleteConfirmGame;

    if (!game) {
      return;
    }

    setDeletingGameId(game.id);
    setError('');

    try {
      await deleteGame({ clubSlug, gameId: game.id, teamSlug, user });
      setDeleteConfirmGame(null);
      if (scoreEditorGameId === game.id) {
        closeScoreEditor();
      }
      if (editingGameId === game.id) {
        closeEditor();
      }
      await loadScheduleData();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Unable to delete that match.');
      setDeleteConfirmGame(null);
    } finally {
      setDeletingGameId('');
    }
  }

  return (
    <div className="page-grid schedule-page">
      <section className="card">
        <div className="schedule-page__header">
          <div className="schedule-page__header-copy">
            <p className="eyebrow">Schedule</p>
            <h1>Matches</h1>
            <p className="schedule-page__copy">
              See scheduled matches, scores, and who is rostered for each matchup.
            </p>
          </div>
          {canManage ? (
            <button className="button" onClick={openCreateEditor} type="button">
              Create Match
            </button>
          ) : null}
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {isEditorOpen ? (
          <div
            className="match-form-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={isCreateEditorOpen ? 'Create match' : 'Edit match'}
          >
            <button
              aria-label="Close match form"
              className="match-form-dialog__backdrop"
              onClick={closeEditor}
              type="button"
            />
            <section className="schedule-admin-card schedule-admin-card--editor">
              <div className="schedule-admin-card__header">
                <div>
                  <h2>{isCreateEditorOpen ? 'Create Match' : `Edit ${editingGame?.opponent || 'match'}`}</h2>
                  <p>
                    {isCreateEditorOpen
                      ? 'Add a match when details are set. Pick who is playing so names show on match cards.'
                      : 'Update date, time, court, and your lineup. Opposing captains set who plays on their side.'}
                  </p>
                </div>
              </div>

              {error ? <div className="notice notice--error">{error}</div> : null}

              <form className="schedule-admin-form schedule-admin-form--compact" onSubmit={handleEditorSubmit}>
                <div className="schedule-admin-form__main-fields">
                  <MatchupLabelField
                    linkedTeamClubSlug={form.linkedTeamClubSlug}
                    linkedTeamSlug={form.linkedTeamSlug}
                    onChange={(selectedTeam) =>
                      setForm((current) => ({
                        ...current,
                        linkedRosterPlayerIds:
                          selectedTeam?.clubSlug && selectedTeam?.teamSlug ? current.linkedRosterPlayerIds : [],
                        linkedTeamClubSlug: selectedTeam?.clubSlug ?? '',
                        linkedTeamName: selectedTeam?.name ?? '',
                        linkedTeamSlug: selectedTeam?.teamSlug ?? '',
                        opponent: selectedTeam?.name ?? '',
                      }))
                    }
                    opponent={form.opponent}
                    teams={matchTeamOptions}
                  />
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
                  onChange={(nextTimeLabel) =>
                    setForm((current) => ({
                      ...current,
                      dateTbd: nextTimeLabel ? false : current.dateTbd,
                      timeLabel: nextTimeLabel,
                    }))
                  }
                  value={form.timeLabel}
                />
                <label className="field schedule-admin-form__players-needed-field">
                  <span>Players needed</span>
                  <select
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setForm((current) => ({
                        ...current,
                        linkedRosterPlayerIds: current.linkedRosterPlayerIds.slice(0, next),
                        playersNeeded: next,
                        rosterPlayerIds: current.rosterPlayerIds.slice(0, next),
                      }));
                    }}
                    value={form.playersNeeded}
                  >
                    {MATCH_PLAYER_COUNT_OPTIONS.map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field schedule-admin-form__court-field">
                  <span>Court</span>
                  <select
                    onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                    value={form.location}
                  >
                    <option value="">Court TBD</option>
                    {form.location && !courtOptions.some((court) => court.value === form.location) ? (
                      <option value={form.location}>{form.location}</option>
                    ) : null}
                    {courtOptions.map((court) => (
                      <option key={court.value} value={court.value}>
                        {court.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="schedule-admin-form__match-format-note">{MATCH_FORMAT_LABEL}</p>

              <ScheduleMatchLineupPicker
                disabled={saving}
                hint={`Choose up to ${form.playersNeeded} from ${teamProfile.name || 'your team'}. Names show on your match cards.`}
                label={`${teamProfile.name || 'Your team'} lineup`}
                max={form.playersNeeded}
                onChange={(ids) => setForm((current) => ({ ...current, rosterPlayerIds: ids }))}
                players={players}
                selectedIds={form.rosterPlayerIds}
              />

              {isCreateEditorOpen && form.linkedTeamClubSlug && form.linkedTeamSlug ? (
                <ScheduleMatchLineupPicker
                  disabled={saving}
                  hint={`Choose up to ${form.playersNeeded} from ${form.opponent || 'the opponent'}. Their names appear on your schedule when both teams use PKL Universe.`}
                  label={`${form.opponent || 'Opponent'} lineup`}
                  max={form.playersNeeded}
                  onChange={(ids) => setForm((current) => ({ ...current, linkedRosterPlayerIds: ids }))}
                  players={linkedMatchPlayers}
                  selectedIds={form.linkedRosterPlayerIds}
                />
              ) : null}

                <div className="schedule-admin-form__actions">
                  <button className="button" disabled={saving} type="submit">
                    {saving ? 'Saving...' : isCreateEditorOpen ? 'Create Match' : 'Save Match'}
                  </button>
                  <button className="button button--ghost" onClick={closeEditor} type="button">
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {scoringGame ? (
          <div className="score-entry-dialog" role="dialog" aria-modal="true" aria-label="Enter match scores">
            <button
              aria-label="Close score entry"
              className="score-entry-dialog__backdrop"
              onClick={closeScoreEditor}
              type="button"
            />
            <form className="score-entry-dialog__panel" onSubmit={handleScoreSubmit}>
              <div className="score-entry-dialog__header">
                <div>
                  <p className="eyebrow">Best of three</p>
                  <h2>Enter Scores</h2>
                  <p>
                    {teamProfile.name || 'Team'} vs. {scoringGame.opponent || 'Opponent TBD'}
                  </p>
                </div>
              </div>

              <div className="score-entry-grid">
                {(shouldShowThirdScoreDraft(scoreForm.matchScores) ? [0, 1, 2] : [0, 1]).map((index) => (
                  <fieldset key={index} className="score-entry-set">
                    <legend>Game {index + 1}</legend>
                    <label className="field">
                      <span>{teamProfile.name || 'Team'}</span>
                      <input
                        inputMode="numeric"
                        onChange={(event) => updateScoreDraft(index, 'teamScore', event.target.value)}
                        value={scoreForm.matchScores[index]?.teamScore ?? ''}
                      />
                    </label>
                    <label className="field">
                      <span>{scoringGame.opponent || 'Opponent'}</span>
                      <input
                        inputMode="numeric"
                        onChange={(event) => updateScoreDraft(index, 'opponentScore', event.target.value)}
                        value={scoreForm.matchScores[index]?.opponentScore ?? ''}
                      />
                    </label>
                  </fieldset>
                ))}
              </div>

              <p className="score-entry-dialog__hint">
                Game 3 appears when the teams split the first two games.
              </p>

              <div className="schedule-admin-form__actions">
                <button className="button" disabled={saving} type="submit">
                  {saving ? 'Saving scores...' : 'Save scores'}
                </button>
                <button className="button button--ghost" disabled={saving} onClick={clearScoreDraft} type="button">
                  Clear
                </button>
                <button className="button button--ghost" onClick={closeScoreEditor} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {games.length > 0 ? (
          <div className="schedule-view-tabs-row">
            <div className="availability-tabs" aria-label="Schedule views">
              <button
                className={`availability-tabs__button ${activeTab === 'scheduled' ? 'availability-tabs__button--active' : ''}`}
                onClick={() => setActiveTab('scheduled')}
                type="button"
              >
                Scheduled ({scheduledGames.length})
              </button>
              <button
                className={`availability-tabs__button ${activeTab === 'completed' ? 'availability-tabs__button--active' : ''}`}
                onClick={() => setActiveTab('completed')}
                type="button"
              >
                Completed ({completedGames.length})
              </button>
            </div>
            {canManage ? (
              <p className="schedule-view-tabs-row__hint">
                <span className="schedule-view-tabs-row__hint-icon" aria-hidden="true">
                  <EnterScoresIcon />
                </span>
                <span>Click this icon on a match to enter scores.</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {games.length > 0 && visibleGames.length > 0 ? (
          <div className="schedule-grid">
            {visibleGames.map((game) => {
              const rosterPairings = buildRosterPairings(game, players);

              return (
                <ScheduleMatchCard
                  key={game.id}
                  actions={
                    canManage ? (
                      <>
                        <button
                          aria-label={`Enter scores for match vs ${game.opponent || 'opponent'}`}
                          className="news-icon-button news-icon-button--primary"
                          onClick={() => openScoreEditor(game)}
                          title="Enter match scores"
                          type="button"
                        >
                          <EnterScoresIcon />
                        </button>
                        <button
                          aria-label={`Edit match vs ${game.opponent || 'opponent'}`}
                          className="news-icon-button"
                          onClick={() => openEditEditor(game)}
                          title="Edit match"
                          type="button"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          aria-label={`Delete match vs ${game.opponent || 'opponent'}`}
                          className="news-icon-button news-icon-button--danger"
                          disabled={deletingGameId === game.id}
                          onClick={() => {
                            setError('');
                            setDeleteConfirmGame(game);
                          }}
                          title="Delete match"
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                      </>
                    ) : null
                  }
                  game={game}
                  homeLogoUrl={teamProfile.logoUrl}
                  homePlayers={rosterPairings.flatMap((pairing) => pairing.players)}
                  homeTeamName={teamProfile.name}
                />
              );
            })}
          </div>
        ) : games.length === 0 ? (
          <p>No matchups saved yet.</p>
        ) : (
          <p>{activeTab === 'completed' ? 'No completed matchups yet.' : 'No scheduled matchups yet.'}</p>
        )}
      </section>

      {deleteConfirmGame ? (
        <div
          className="club-challenge-dialog club-challenge-dialog--layered"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-match-dialog-title"
        >
          <button
            aria-label="Close delete match confirmation"
            className="club-challenge-dialog__backdrop"
            disabled={Boolean(deletingGameId)}
            onClick={() => setDeleteConfirmGame(null)}
            type="button"
          />
          <div className="club-challenge-dialog__panel">
            <p className="eyebrow">Matches</p>
            <h2 id="delete-match-dialog-title">
              Delete match vs {deleteConfirmGame.opponent || 'this opponent'}?
            </h2>
            <p>
              For linked club matches, scores are removed on both teams&rsquo; schedules. Standings update from what
              remains on the schedule.
              {deleteConfirmGame.source === 'challenge' ? (
                <> The club challenge will be marked cancelled.</>
              ) : null}{' '}
              This cannot be undone.
            </p>
            <div className="club-challenge-dialog__actions">
              <button
                className="button button--ghost"
                disabled={Boolean(deletingGameId)}
                onClick={() => setDeleteConfirmGame(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button button--danger"
                disabled={Boolean(deletingGameId)}
                onClick={() => void confirmDeleteMatch()}
                type="button"
              >
                {deletingGameId ? 'Deleting…' : 'Delete match'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
  const [standingsUpdatedAt, setStandingsUpdatedAt] = useState('');
  const standingsUpdateTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let initialSnapshotsRemaining = 0;
    const gamesByTeamKey = new Map();
    const unsubscribers = [];

    function updateRows(teamsForStandings, currentTeamKey) {
      setClubStandingsRows(buildClubStandingsRowsFromGames(teamsForStandings, gamesByTeamKey, currentTeamKey));
      setGames(gamesByTeamKey.get(currentTeamKey) ?? []);
    }

    function noteLiveStandingsUpdate() {
      const label = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());

      setStandingsUpdatedAt(label);

      if (standingsUpdateTimerRef.current) {
        window.clearTimeout(standingsUpdateTimerRef.current);
      }

      standingsUpdateTimerRef.current = window.setTimeout(() => {
        setStandingsUpdatedAt('');
      }, 8000);
    }

    setClubStandingsLoading(true);
    setError('');
    setStandingsUpdatedAt('');

    getTeam(clubSlug, teamSlug)
      .then(async (teamData) => {
        if (cancelled) {
          return;
        }

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
                teamSlug,
              },
            ];

        initialSnapshotsRemaining = teamsForStandings.length;

        teamsForStandings.forEach((clubTeam) => {
          const key = `${clubTeam.clubSlug}/${clubTeam.teamSlug}`;
          const unsubscribe = subscribeTeamGames(
            { clubSlug: clubTeam.clubSlug, teamSlug: clubTeam.teamSlug },
            (teamGames) => {
              if (cancelled) {
                return;
              }

              const wasLive = initialSnapshotsRemaining === 0;
              gamesByTeamKey.set(key, teamGames);
              updateRows(teamsForStandings, currentTeamKey);

              if (initialSnapshotsRemaining > 0) {
                initialSnapshotsRemaining -= 1;

                if (initialSnapshotsRemaining === 0) {
                  setClubStandingsLoading(false);
                }

                return;
              }

              if (wasLive) {
                noteLiveStandingsUpdate();
              }
            },
            (subscriptionError) => {
              if (!cancelled) {
                setError(subscriptionError.message ?? 'Unable to keep standings updated.');
              }
            },
          );

          unsubscribers.push(unsubscribe);
        });

        if (teamsForStandings.length === 0) {
          setClubStandingsLoading(false);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError.message ?? 'Unable to load standings yet.');
        }
      })

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());

      if (standingsUpdateTimerRef.current) {
        window.clearTimeout(standingsUpdateTimerRef.current);
      }
    };
  }, [clubSlug, teamSlug]);

  return (
    <div className="page-grid standings-page">
      <section className="card standings-page__card">
        <div className="standings-page__header">
          <div>
            <p className="eyebrow">Standings</p>
            <h1>Standings</h1>
            <p className="standings-page__copy">
              See how your team ranks across the club, with wins, losses, scoring edge, and head-to-head results.
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

export function NewsPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const imageInputId = `news-image-${clubSlug}-${teamSlug}`;
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityPlayers, setCommunityPlayers] = useState([]);
  const [communityRankings, setCommunityRankings] = useState([]);
  const [communityTeams, setCommunityTeams] = useState([]);
  const [newsPosts, setNewsPosts] = useState([]);
  const [authorAvatarsByUid, setAuthorAvatarsByUid] = useState({});
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
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [feedDebug, setFeedDebug] = useState(null);
  const [communityError, setCommunityError] = useState('');
  const [communityDebug, setCommunityDebug] = useState(null);
  const [accessDebug, setAccessDebug] = useState(null);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');

  function buildHomeDebugContext(extra = {}) {
    return {
      clubSlug,
      email: user?.email ?? '',
      teamSlug,
      uid: user?.uid ?? '',
      ...extra,
    };
  }

  async function runHomeFirestoreStep(step, context, task) {
    try {
      return await task();
    } catch (error) {
      throw createFirestoreStepError(step, error, context);
    }
  }

  function repairMembershipInBackground(membershipData) {
    if (!user?.uid || !membershipData) {
      return;
    }

    getMembership(clubSlug, teamSlug, user.uid, user).catch((error) => {
      const debugInfo = extractFirestoreDebugInfo(error, {
        step: 'getMembershipRepair',
        ...buildHomeDebugContext({ membershipFound: true }),
      });
      console.warn('[NewsPage:membershipRepair]', debugInfo, error);
      setAccessDebug(debugInfo);
    });
  }

  async function loadNewsAccess() {
    const context = buildHomeDebugContext();

    const [membershipData, platformAdmin] = await Promise.all([
      user?.uid
        ? runHomeFirestoreStep('readTeamMembership', context, () =>
            readTeamMembership(clubSlug, teamSlug, user.uid),
          )
        : Promise.resolve(null),
      user?.uid ? isPlatformAdmin(user.uid, user.email) : Promise.resolve(false),
    ]);

    if (user?.uid && membershipData) {
      repairMembershipInBackground(membershipData);
      try {
        const activeTeamSaved = await runHomeFirestoreStep(
          'ensureUserActiveTeamContext',
          { ...context, membershipFound: true },
          () => ensureUserActiveTeamContext({ clubSlug, teamSlug, uid: user.uid }),
        );

        if (!activeTeamSaved) {
          setAccessDebug({
            step: 'ensureUserActiveTeamContext',
            ...context,
            membershipFound: true,
            message: 'Active team context was not saved.',
            activeTeamSaved: false,
            timestamp: new Date().toISOString(),
          });
        } else {
          setAccessDebug({
            step: 'readTeamMembership',
            ...context,
            membershipFound: true,
            role: membershipData.role ?? '',
            activeTeamSaved: true,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        setAccessDebug(extractFirestoreDebugInfo(error, { ...context, membershipFound: true }));
        throw error;
      }
    } else {
      setAccessDebug({
        step: 'readTeamMembership',
        ...context,
        membershipFound: Boolean(membershipData),
        role: membershipData?.role ?? '',
        timestamp: new Date().toISOString(),
      });
    }

    setMembership(membershipData);
    setIsAppAdmin(platformAdmin);
  }

  async function loadCommunityOverview() {
    const context = buildHomeDebugContext();

    const membershipData = user?.uid
      ? await runHomeFirestoreStep('readTeamMembership', context, () =>
          readTeamMembership(clubSlug, teamSlug, user.uid),
        )
      : null;

    if (membershipData) {
      repairMembershipInBackground(membershipData);
      await runHomeFirestoreStep(
        'ensureUserActiveTeamContext',
        { ...context, membershipFound: true },
        () => ensureUserActiveTeamContext({ clubSlug, teamSlug, uid: user.uid }),
      );
    }

    const teamData = await runHomeFirestoreStep('getTeam', context, () => getTeam(clubSlug, teamSlug));
    const activeClubSlug =
      teamData?.affiliationStatus === 'approved' && teamData?.approvedClubSlug
        ? teamData.approvedClubSlug
        : clubSlug;
    const teams = await runHomeFirestoreStep(
      'listApprovedClubTeams',
      { ...context, activeClubSlug, membershipFound: Boolean(membershipData) },
      () =>
        activeClubSlug && activeClubSlug !== 'independent'
          ? listApprovedClubTeams(activeClubSlug)
          : Promise.resolve([
              {
                clubSlug,
                logoUrl: teamData?.logoUrl ?? '',
                name: teamData?.name ?? teamSlug,
                teamSlug,
              },
            ]),
    );
    const teamEntries = await Promise.all(
      teams.map(async (clubTeam) => {
        const teamPath = `${clubTeam.clubSlug}/${clubTeam.teamSlug}`;
        const [members, players, games] = await Promise.all([
          listTeamMembers(clubTeam.clubSlug, clubTeam.teamSlug).catch((error) => {
            console.warn('[NewsPage:communityTeamLoad]', teamPath, 'listTeamMembers', error);
            return [];
          }),
          listPlayers(clubTeam.clubSlug, clubTeam.teamSlug).catch((error) => {
            console.warn('[NewsPage:communityTeamLoad]', teamPath, 'listPlayers', error);
            return [];
          }),
          listGames(clubTeam.clubSlug, clubTeam.teamSlug).catch((error) => {
            console.warn('[NewsPage:communityTeamLoad]', teamPath, 'listGames', error);
            return [];
          }),
        ]);
        const playersById = new Map(players.map((player) => [player.id, player]));
        const rosterPlayers = members
          .filter((member) => member.status !== 'inactive')
          .map((member) => playersById.get(member.playerId || member.uid))
          .filter(Boolean);
        const displayedPlayers = (rosterPlayers.length ? rosterPlayers : players)
          .filter((player) => player.active !== false)
          .slice(0, TEAM_MEMBER_LIMIT);
        const completedMatchCount = buildStandingsSummary(games).completedGames.length;

        return {
          games,
          players,
          team: {
            ...clubTeam,
            matchesPlayed: completedMatchCount,
            rosterPlayers: displayedPlayers,
          },
        };
      }),
    );
    const playerAliasKeys = new Map();
    const playerCardsByKey = new Map();
    const rosterPlayersForAvatars = teamEntries.flatMap(({ players }) =>
      players.filter((player) => player.active !== false),
    );
    const playerAvatarsByUid = await getUserProfileAvatarsByUid(
      rosterPlayersForAvatars.map((player) => player.uid).filter(Boolean),
    );

    teamEntries.forEach(({ games, players, team }) => {
      players
        .filter((player) => player.active !== false)
        .forEach((player) => {
          const identityKeys = getCommunityPlayerKeys(player);
          const playerKey = identityKeys.map((key) => playerAliasKeys.get(key)).find(Boolean) ?? getCommunityPlayerKey(player);
          const existingPlayer = playerCardsByKey.get(playerKey);
          const gamesPlayed = countGamesPlayed(games, player.id);
          identityKeys.forEach((key) => {
            playerAliasKeys.set(key, playerKey);
          });

          playerCardsByKey.set(playerKey, {
            gamesPlayed: Math.max(existingPlayer?.gamesPlayed ?? 0, gamesPlayed),
            headshotUrl:
              (player.uid && playerAvatarsByUid[player.uid]) ||
              resolvePlayerAvatarUrl({ player }),
            id: playerKey,
            name: existingPlayer?.name || getPlayerName(player),
            teamNames: [...new Set([...(existingPlayer?.teamNames ?? []), team.name].filter(Boolean))],
          });
        });
    });
    const playerCards = Array.from(playerCardsByKey.values())
      .sort((left, right) => left.name.localeCompare(right.name));
    const currentTeamKey = `${clubSlug}/${teamSlug}`;
    const rankingRows = sortStandingsRows(
      teamEntries.map(({ games, team }) => buildClubStandingsRow(team, games, currentTeamKey)),
    ).slice(0, 3);

    return {
      players: playerCards,
      rankings: rankingRows,
      teams: teamEntries
        .map(({ team }) => ({
          ...team,
          rosterPlayers: team.rosterPlayers.map((player) => ({
            ...player,
            headshotUrl:
              (player.uid && playerAvatarsByUid[player.uid]) ||
              resolvePlayerAvatarUrl({ player }),
          })),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  }

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = null;

    async function connectNewsFeed() {
      await loadNewsAccess();

      if (!isMounted) {
        return;
      }

      unsubscribe = subscribeNewsPosts(
        clubSlug,
        teamSlug,
        (posts) => {
          if (isMounted) {
            setNewsPosts(posts);
          }
        },
        (subscribeError) => {
          if (isMounted) {
            const debugInfo = extractFirestoreDebugInfo(subscribeError, {
              step: 'subscribeNewsPosts',
              ...buildHomeDebugContext(),
            });
            setFeedError(subscribeError.message ?? 'Unable to listen for community feed updates.');
            setFeedDebug(debugInfo);
          }
        },
      );
    }

    setFeedError('');
    setFeedDebug(null);
    connectNewsFeed().catch((loadError) => {
      if (isMounted) {
        const debugInfo = extractFirestoreDebugInfo(loadError, {
          step: 'connectNewsFeed',
          ...buildHomeDebugContext(),
        });
        setFeedError(loadError.message ?? 'Unable to load community feed yet.');
        setFeedDebug(debugInfo);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [clubSlug, teamSlug, user?.email, user?.uid]);

  useEffect(() => {
    const authorUids = new Set();

    newsPosts.forEach((post) => {
      if (post.authorUid) {
        authorUids.add(post.authorUid);
      }

      post.comments?.forEach((comment) => {
        if (comment.authorUid) {
          authorUids.add(comment.authorUid);
        }
      });
    });

    if (!authorUids.size) {
      setAuthorAvatarsByUid({});
      return;
    }

    let ignore = false;

    getUserProfileAvatarsByUid([...authorUids])
      .then((avatarMap) => {
        if (!ignore) {
          setAuthorAvatarsByUid(avatarMap);
        }
      })
      .catch(() => {
        if (!ignore) {
          setAuthorAvatarsByUid({});
        }
      });

    return () => {
      ignore = true;
    };
  }, [newsPosts]);

  useEffect(() => {
    let ignore = false;

    setCommunityLoading(true);
    setCommunityError('');
    setCommunityDebug(null);
    loadCommunityOverview()
      .then(({ players, rankings, teams }) => {
        if (!ignore) {
          setCommunityTeams(teams);
          setCommunityPlayers(players);
          setCommunityRankings(rankings);
          setCommunityError('');
          setCommunityDebug(null);
        }
      })
      .catch((loadError) => {
        if (!ignore) {
          const debugInfo = extractFirestoreDebugInfo(loadError, {
            step: 'loadCommunityOverview',
            ...buildHomeDebugContext(),
          });
          setCommunityError(loadError.message ?? 'Unable to load the community directory.');
          setCommunityDebug(debugInfo);
          setCommunityTeams([]);
          setCommunityPlayers([]);
          setCommunityRankings([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setCommunityLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
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
    setActionError('');
    setMessage('');

    try {
      if (user?.uid) {
        await ensureUserActiveTeamContext({ clubSlug, teamSlug, uid: user.uid });
      }

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
    } catch (submitError) {
      setActionError(submitError.message ?? 'Unable to share that post.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePost(post) {
    setDeletingPostId(post.id);
    setActionError('');
    setMessage('');

    try {
      await deleteNewsPost({ clubSlug, post, teamSlug });
      setMessage('Post deleted.');
    } catch (deleteError) {
      setActionError(deleteError.message ?? 'Unable to delete that post.');
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
    setActionError('');
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

    setActionError('');

    try {
      const resizedFile = await createResizedNewsImageFile(file);
      if (postEditImagePreviewUrl) {
        URL.revokeObjectURL(postEditImagePreviewUrl);
      }

      setPostEditImageFile(resizedFile);
      setPostEditImagePreviewUrl(URL.createObjectURL(resizedFile));
    } catch (selectionError) {
      setActionError(selectionError.message ?? 'Unable to prepare that image.');
    }
  }

  async function handleSavePostEdit(post) {
    setSavingPostId(post.id);
    setActionError('');
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
    } catch (editError) {
      setActionError(editError.message ?? 'Unable to update that post.');
    } finally {
      setSavingPostId('');
    }
  }

  async function handleCommentSubmit(event, post) {
    event.preventDefault();
    setActionError('');
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
    } catch (commentError) {
      setActionError(commentError.message ?? 'Unable to post that comment.');
    }
  }

  async function handleDeleteComment(post, comment) {
    setDeletingCommentId(comment.id);
    setActionError('');
    setMessage('');

    try {
      await deleteNewsComment({
        clubSlug,
        commentId: comment.id,
        postId: post.id,
        teamSlug,
      });
    } catch (deleteError) {
      setActionError(deleteError.message ?? 'Unable to delete that comment.');
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
    setActionError('');
    setMessage('');
  }

  function handleCancelCommentEdit() {
    setEditingCommentId('');
    setCommentEditDraft('');
  }

  async function handleSaveCommentEdit(post, comment) {
    setSavingCommentId(comment.id);
    setActionError('');
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
    } catch (editError) {
      setActionError(editError.message ?? 'Unable to update that comment.');
    } finally {
      setSavingCommentId('');
    }
  }

  async function handleReactionToggle(post, reactionType = 'like') {
    setReactingPostId(post.id);
    setActionError('');

    try {
      await toggleNewsReaction({
        clubSlug,
        post,
        teamSlug,
        type: reactionType,
        user,
      });
    } catch (reactionError) {
      setActionError(reactionError.message ?? 'Unable to update that reaction.');
    } finally {
      setReactingPostId('');
    }
  }

  async function handleImageSelected(file) {
    if (!file) {
      removeSelectedImage();
      return;
    }

    setActionError('');

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
      setActionError(selectionError.message ?? 'Unable to prepare that image.');
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
      <aside className="card home-news-card">
        <NewsFeedIntro
          copy="Share photos, practice notes, match moments, and club updates."
          title="Community Feed"
        />

        {feedError ? <div className="notice notice--error">{feedError}</div> : null}
        <FirestoreDebugPanel debugInfo={feedDebug} label="Feed permission debug" />
        {actionError ? <div className="notice notice--error">{actionError}</div> : null}
        {accessDebug && (feedError || communityError) ? (
          <FirestoreDebugPanel debugInfo={accessDebug} label="Team access debug" />
        ) : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {isComposerOpen ? (
          <form className="news-composer" onSubmit={handleSubmit}>
            <label className="field">
              <span>What&apos;s happening?</span>
              <textarea
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                placeholder="Share a photo, practice note, drill idea, match recap, shout-out, or community update..."
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
              What&apos;s happening?
            </button>
            <button className="button" onClick={() => setIsComposerOpen(true)} type="button">
              Create Post
            </button>
          </div>
        )}

        <NewsFeed
          authorAvatarsByUid={authorAvatarsByUid}
          canModerate={isAppAdmin}
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
      </aside>

      <section className="card home-community-card">
        <div className="news-feed-intro">
          <div className="news-feed-intro__content">
            <p className="eyebrow">Home</p>
            <h1>Community Directory</h1>
            <p className="news-feed-intro__copy">Browse teams and players in your club community.</p>
          </div>
        </div>

        {communityError ? <div className="notice notice--error">{communityError}</div> : null}
        <FirestoreDebugPanel debugInfo={communityDebug} label="Community directory debug" />

        {communityLoading ? (
          <div className="state-panel">
            <p>Loading community directory...</p>
          </div>
        ) : (
          <div className="home-community">
            <section className="home-rankings-card" aria-label="Top team rankings">
              <div className="home-rankings-card__header">
                <div>
                  <p className="eyebrow">Top 3</p>
                  <h2>Team Rankings</h2>
                </div>
                <Link className="home-rankings-card__link" to="../standings">
                  View standings
                </Link>
              </div>
              {communityRankings.length > 0 ? (
                <div className="home-rankings-list">
                  {communityRankings.map((row, index) => (
                    <article key={`${row.clubSlug}-${row.teamSlug}`} className="home-ranking-row">
                      <span className="home-ranking-row__rank">#{index + 1}</span>
                      <img alt={`${row.name} logo`} src={row.logoUrl || defaultTeamLogo} />
                      <div className="home-ranking-row__team">
                        <strong>{row.name}</strong>
                        <span>{formatRecord(row.wins, row.losses)} W-L</span>
                      </div>
                      <span className="home-ranking-row__rate">
                        {Math.round(Number(row.winPct) * 100)}%
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notice notice--info">Rankings appear after teams are listed.</div>
              )}
            </section>

            <section className="home-community-section">
              <div className="home-community-section__header">
                <div>
                  <h2>Team Directory</h2>
                </div>
                <span>{communityTeams.length} team{communityTeams.length === 1 ? '' : 's'}</span>
              </div>
              {communityTeams.length > 0 ? (
                <div className="home-team-grid">
                  {communityTeams.map((clubTeam) => (
                    <article key={`${clubTeam.clubSlug}-${clubTeam.teamSlug}`} className="home-team-card">
                      <img
                        alt={`${clubTeam.name} logo`}
                        className="home-team-card__logo"
                        src={clubTeam.logoUrl || defaultTeamLogo}
                      />
                      <div className="home-team-card__body">
                        <div className="home-team-card__header">
                          <h3>{clubTeam.name}</h3>
                          <span>{clubTeam.matchesPlayed} match{clubTeam.matchesPlayed === 1 ? '' : 'es'} played</span>
                        </div>
                        <div className="home-team-card__players">
                          {clubTeam.rosterPlayers.length > 0 ? (
                            clubTeam.rosterPlayers.map((player) => (
                              <div key={player.id} className="home-team-card__player">
                                {player.headshotUrl ? (
                                  <img alt={`${getPlayerName(player)} headshot`} src={player.headshotUrl} />
                                ) : (
                                  <span>{buildPlayerInitials(getPlayerName(player))}</span>
                                )}
                                <strong>{getPlayerName(player)}</strong>
                              </div>
                            ))
                          ) : (
                            <span>Roster pending</span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notice notice--info">No teams are listed yet.</div>
              )}
            </section>

            <section className="home-community-section">
              <div className="home-community-section__header">
                <div>
                  <h2>Player Directory</h2>
                </div>
                <span>{communityPlayers.length} player{communityPlayers.length === 1 ? '' : 's'}</span>
              </div>
              {communityPlayers.length > 0 ? (
                <div className="home-player-grid">
                  {communityPlayers.map((player) => (
                    <article key={player.id} className="home-player-card">
                      {player.headshotUrl ? (
                        <img alt={`${player.name} headshot`} className="home-player-card__avatar" src={player.headshotUrl} />
                      ) : (
                        <div className="home-player-card__avatar home-player-card__avatar--initials">
                          {buildPlayerInitials(player.name)}
                        </div>
                      )}
                      <div>
                        <strong>{player.name}</strong>
                        <span>
                          {player.gamesPlayed} game{player.gamesPlayed === 1 ? '' : 's'} played ·{' '}
                          {player.teamNames.length} team{player.teamNames.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notice notice--info">No players are listed yet.</div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

export function NewsroomPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [newsPosts, setNewsPosts] = useState([]);
  const [authorAvatarsByUid, setAuthorAvatarsByUid] = useState({});
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
  const manageableNewsPosts = useMemo(
    () => newsPosts.filter((post) => !post.teamSlug || post.teamSlug === teamSlug),
    [newsPosts, teamSlug],
  );
  const filterCounts = useMemo(
    () => ({
      all: manageableNewsPosts.length,
      hasImage: manageableNewsPosts.filter((post) => Boolean(post.imageUrl)).length,
      hasLink: manageableNewsPosts.filter((post) => Boolean(post.linkUrl)).length,
    }),
    [manageableNewsPosts],
  );
  const filteredPosts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return manageableNewsPosts.filter((post) => {
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
  }, [filterMode, manageableNewsPosts, searchTerm]);

  async function loadNewsData() {
    const membershipData = user?.uid ? await getMembership(clubSlug, teamSlug, user.uid, user) : null;
    if (user?.uid && membershipData) {
      await setLastActiveTeam({ clubSlug, teamSlug, uid: user.uid });
    }
    const posts = await listNewsPosts(clubSlug, teamSlug);

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

  useEffect(() => {
    const authorUids = new Set();

    newsPosts.forEach((post) => {
      if (post.authorUid) {
        authorUids.add(post.authorUid);
      }

      post.comments?.forEach((comment) => {
        if (comment.authorUid) {
          authorUids.add(comment.authorUid);
        }
      });
    });

    if (!authorUids.size) {
      setAuthorAvatarsByUid({});
      return;
    }

    let ignore = false;

    getUserProfileAvatarsByUid([...authorUids])
      .then((avatarMap) => {
        if (!ignore) {
          setAuthorAvatarsByUid(avatarMap);
        }
      })
      .catch(() => {
        if (!ignore) {
          setAuthorAvatarsByUid({});
        }
      });

    return () => {
      ignore = true;
    };
  }, [newsPosts]);

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
            {filteredPosts.length} shown
            {filteredPosts.length !== manageableNewsPosts.length ? ` of ${manageableNewsPosts.length}` : ''}
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
          <NewsFeed authorAvatarsByUid={authorAvatarsByUid} newsPosts={newsPosts} />
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
  if (challenge.selectedWindowLabel) {
    return challenge.selectedWindowLabel;
  }

  if (challenge.schedulingMode === 'proposed_windows' && challenge.proposedWindows?.length) {
    return `${challenge.proposedWindows.length} proposed time${challenge.proposedWindows.length === 1 ? '' : 's'}`;
  }

  if (challenge.dateTbd || !challenge.isoDate) {
    return 'Date TBD';
  }

  return formatIsoDateForDisplay(challenge.isoDate);
}

function formatChallengeTime(challenge) {
  if (challenge.schedulingMode === 'proposed_windows' && challenge.proposedWindows?.length && !challenge.selectedWindowLabel) {
    return 'Pick a time on accept';
  }

  const normalizedTime = (challenge.timeLabel ?? '').replace(':undefined', ':00');

  return challenge.dateTbd ? 'Time TBD' : normalizedTime || 'Time TBD';
}

function formatProposedWindowTimeLabel(window) {
  if (!window?.hour) {
    return '';
  }

  return `${window.hour}:${window.minute || '00'} ${window.period || 'AM'}`;
}

function proposedWindowFromChallenge(window) {
  const match = String(window?.timeLabel ?? '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  return {
    hour: match?.[1] ?? '',
    isoDate: window?.isoDate ?? '',
    minute: match?.[2] ?? '00',
    period: match?.[3]?.toUpperCase() ?? 'AM',
  };
}

function buildChallengeTimeLabel(form) {
  if (form.dateTbd || !form.hour) {
    return '';
  }

  return `${form.hour}:${form.minute} ${form.period}`;
}

function createChallengeFormFromChallenge(challenge) {
  const match = String(challenge.timeLabel ?? '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const storedWindows = Array.isArray(challenge.proposedWindows) ? challenge.proposedWindows : [];
  const proposedWindows = Array.from({ length: MAX_PROPOSED_CHALLENGE_WINDOWS }, (_, index) => {
    const storedWindow = storedWindows[index];

    return storedWindow ? proposedWindowFromChallenge(storedWindow) : createEmptyProposedWindow();
  });

  return {
    dateTbd: challenge.schedulingMode === 'proposed_windows' ? true : challenge.dateTbd === true,
    hour: challenge.schedulingMode === 'fixed' ? match?.[1] ?? '' : '',
    isoDate: challenge.schedulingMode === 'fixed' ? challenge.isoDate ?? '' : '',
    location: challenge.location && challenge.location !== 'Location TBD' ? challenge.location : '',
    minute: challenge.schedulingMode === 'fixed' ? match?.[2] ?? '00' : '00',
    period: challenge.schedulingMode === 'fixed' ? match?.[3]?.toUpperCase() ?? 'AM' : 'AM',
    playersNeeded: normalizeMatchPlayerCount(challenge.playersNeeded),
    createdByPlayerId: challenge.createdByPlayerId ?? '',
    proposedWindows,
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
  const [challengePlayers, setChallengePlayers] = useState([]);
  const [clubChallenges, setClubChallenges] = useState([]);
  const [teamChallenges, setTeamChallenges] = useState([]);
  const [challengeCourtOptions, setChallengeCourtOptions] = useState([]);
  const [form, setForm] = useState(createEmptyChallengeForm());
  const [editingChallengeId, setEditingChallengeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingChallengeId, setUpdatingChallengeId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [postedChallengeTab, setPostedChallengeTab] = useState('proposed');
  const [appliedChallengeTargetKey, setAppliedChallengeTargetKey] = useState('');
  const [challengeFormOpen, setChallengeFormOpen] = useState(false);
  const [incomingChallengeIndex, setIncomingChallengeIndex] = useState(0);
  const [acceptPlayerSelections, setAcceptPlayerSelections] = useState({});
  const [acceptWindowSelections, setAcceptWindowSelections] = useState({});
  const [cancelConfirmChallenge, setCancelConfirmChallenge] = useState(null);

  const canManage = canManageRole(membership?.role);
  const challengeTargetTeamKey = location.state?.challengeTargetTeamKey ?? '';
  const challengeTargetTeamName = location.state?.challengeTargetTeamName ?? '';
  const challengeClubSlug =
    team?.affiliationStatus === 'approved' && team?.approvedClubSlug ? team.approvedClubSlug : '';
  const activeChallengePlayers = challengePlayers.filter((player) => player.active !== false);
  const challengeSubmitDisabled =
    saving ||
    (form.visibility === 'targeted' && !form.targetTeamKey) ||
    (normalizeMatchPlayerCount(form.playersNeeded) === 1 && !form.createdByPlayerId) ||
    (normalizeMatchPlayerCount(form.playersNeeded) === 2 && activeChallengePlayers.length < 2);
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
      setChallengePlayers([]);
      setClubChallenges([]);
      setTeamChallenges([]);
      setChallengeCourtOptions([]);
      return;
    }

    const [approvedTeams, openChallenges, relevantChallenges, playersData, clubData] = await Promise.all([
      listApprovedClubTeams(approvedClubSlug).catch(() => []),
      listClubChallenges(approvedClubSlug).catch(() => []),
      listTeamChallenges({ challengeClubSlug: approvedClubSlug, clubSlug, teamSlug }).catch(() => []),
      listPlayers(clubSlug, teamSlug).catch(() => []),
      listClubs({ includeIndependent: true }).catch(() => []),
    ]);
    const approvedClub = clubData.find((club) => club.slug === approvedClubSlug) ?? null;

    setEligibleTeams(
      approvedTeams.filter((approvedTeam) => approvedTeam.clubSlug !== clubSlug || approvedTeam.teamSlug !== teamSlug),
    );
    setClubChallenges(
      openChallenges.filter(
        (challenge) => challenge.createdByTeamClubSlug !== clubSlug || challenge.createdByTeamSlug !== teamSlug,
      ),
    );
    setTeamChallenges(relevantChallenges);
    setChallengePlayers(playersData);
    setChallengeCourtOptions(buildCourtOptionsFromClub(approvedClub));
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
    if (!challengeClubSlug) {
      return undefined;
    }

    return subscribeChallengeHub(
      { challengeClubSlug, clubSlug, teamSlug },
      ({ clubChallenges: nextClubChallenges, teamChallenges: nextTeamChallenges }) => {
        setClubChallenges(nextClubChallenges);
        setTeamChallenges(nextTeamChallenges);
      },
      (subscriptionError) => {
        setError(subscriptionError.message ?? 'Unable to keep club challenges updated.');
      },
    );
  }, [challengeClubSlug, clubSlug, teamSlug]);

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
    setChallengeFormOpen(true);
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
        createdByPlayerId: normalizeMatchPlayerCount(form.playersNeeded) === 1 ? form.createdByPlayerId : '',
        dateTbd: form.dateTbd,
        isoDate: form.isoDate,
        location: form.location,
        playersNeeded: form.playersNeeded,
        proposedWindows: form.dateTbd ? form.proposedWindows : [],
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
      setMessage(editingChallengeId ? 'Challenge updated.' : '');
      if (!editingChallengeId) {
        setPostedChallengeTab('proposed');
      }
      setChallengeFormOpen(false);
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
    setChallengeFormOpen(true);
  }

  function handleCancelEditChallenge() {
    setForm(createEmptyChallengeForm());
    setEditingChallengeId('');
    setError('');
    setChallengeFormOpen(false);
  }

  function handleOpenChallengeForm() {
    setForm(createEmptyChallengeForm());
    setEditingChallengeId('');
    setError('');
    setChallengeFormOpen(true);
  }

  function handleStartChallengeToTeam(targetTeam) {
    if (
      !canManage ||
      !targetTeam ||
      (targetTeam.clubSlug === clubSlug && targetTeam.teamSlug === teamSlug)
    ) {
      return;
    }

    setForm({
      ...createEmptyChallengeForm(),
      targetTeamKey: `${targetTeam.clubSlug}:${targetTeam.teamSlug}`,
      visibility: 'targeted',
    });
    setEditingChallengeId('');
    setError('');
    setMessage(`Send a challenge to ${targetTeam.name}.`);
    setChallengeFormOpen(true);
  }

  function handleScrollToSection(sectionId) {
    requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function handleAcceptChallenge(challenge) {
    setUpdatingChallengeId(challenge.id);
    setError('');
    setMessage('');

    try {
      const acceptedByPlayerId =
        normalizeMatchPlayerCount(challenge.playersNeeded) === 1 ? acceptPlayerSelections[challenge.id] ?? '' : '';

      await acceptChallenge({
        acceptedByPlayerId,
        challengeClubSlug: challenge.challengeClubSlug,
        challengeId: challenge.id,
        clubSlug,
        selectedWindowId: acceptWindowSelections[challenge.id] ?? '',
        teamSlug,
        user,
      });
      setMessage('Challenge accepted and added to both schedules.');
      await loadChallengeData();
      window.dispatchEvent(new Event('team-updated'));
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

  function openCancelChallengeConfirm(challenge) {
    setError('');
    setCancelConfirmChallenge(challenge);
  }

  async function confirmCancelChallenge() {
    const challenge = cancelConfirmChallenge;

    if (!challenge) {
      return;
    }

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
      setCancelConfirmChallenge(null);
      setMessage('Challenge cancelled.');
      await loadChallengeData();
    } catch (cancelError) {
      setError(cancelError.message ?? 'Unable to cancel that challenge.');
    } finally {
      setUpdatingChallengeId('');
    }
  }

  function getChallengePlayerName(player) {
    return player.fullName || player.displayName || player.email || 'Player';
  }

  function renderAcceptSinglesSelector(challenge) {
    if (normalizeMatchPlayerCount(challenge.playersNeeded) !== 1) {
      return null;
    }

    return (
      <label className="field challenge-singles-select">
        <span>Who will play singles?</span>
        <select
          disabled={updatingChallengeId === challenge.id}
          onChange={(event) =>
            setAcceptPlayerSelections((current) => ({
              ...current,
              [challenge.id]: event.target.value,
            }))
          }
          value={acceptPlayerSelections[challenge.id] ?? ''}
        >
          <option value="">Choose player</option>
          {activeChallengePlayers.map((player) => (
            <option key={player.id} value={player.id}>
              {getChallengePlayerName(player)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderAcceptWindowSelector(challenge) {
    const proposedWindows = Array.isArray(challenge.proposedWindows) ? challenge.proposedWindows : [];

    if (!proposedWindows.length) {
      return null;
    }

    const selectedWindowId = acceptWindowSelections[challenge.id] ?? '';

    const isTbdSelected = selectedWindowId === CHALLENGE_ACCEPT_SCHEDULE_TBD_ID;

    return (
      <div className="challenge-time-slots">
        <p className="challenge-time-slots__title">Pick a time or keep scheduling open</p>
        <div className="challenge-time-slots__grid" role="radiogroup" aria-label="Pick a time or keep scheduling open">
          {proposedWindows.map((window, index) => {
            const isSelected = selectedWindowId === window.id;

            return (
              <label
                key={window.id || `window-${index}`}
                className={`challenge-time-slot ${isSelected ? 'challenge-time-slot--selected' : ''}`}
              >
                <input
                  checked={isSelected}
                  className="challenge-time-slot__input"
                  disabled={updatingChallengeId === challenge.id}
                  name={`challenge-window-${challenge.id}`}
                  onChange={() =>
                    setAcceptWindowSelections((current) => ({
                      ...current,
                      [challenge.id]: window.id,
                    }))
                  }
                  type="radio"
                />
                <span className="challenge-time-slot__badge">Option {index + 1}</span>
                <MatchScheduleWhen
                  className="challenge-time-slot__schedule"
                  isoDate={window.isoDate}
                  location={window.location}
                  timeLabel={window.timeLabel}
                />
              </label>
            );
          })}
          <label
            className={`challenge-time-slot challenge-time-slot--tbd ${isTbdSelected ? 'challenge-time-slot--selected' : ''}`}
          >
            <input
              checked={isTbdSelected}
              className="challenge-time-slot__input"
              disabled={updatingChallengeId === challenge.id}
              name={`challenge-window-${challenge.id}`}
              onChange={() =>
                setAcceptWindowSelections((current) => ({
                  ...current,
                  [challenge.id]: CHALLENGE_ACCEPT_SCHEDULE_TBD_ID,
                }))
              }
              type="radio"
            />
            <span className="challenge-time-slot__badge">Option {proposedWindows.length + 1}</span>
            <span className="challenge-time-slot__label">{CHALLENGE_ACCEPT_SCHEDULE_TBD_LABEL}</span>
            <span className="challenge-time-slot__hint">Accept now and coordinate a time later.</span>
          </label>
        </div>
      </div>
    );
  }

  function getAcceptDisabledReason(challenge) {
    if (updatingChallengeId === challenge.id) {
      return '';
    }

    if (challenge.proposedWindows?.length && !acceptWindowSelections[challenge.id]) {
      return 'Choose a time option (or Option 4 to keep date and time TBD) before accepting.';
    }

    if (normalizeMatchPlayerCount(challenge.playersNeeded) === 1 && !acceptPlayerSelections[challenge.id]) {
      return 'Choose who will play singles before accepting this challenge.';
    }

    if (normalizeMatchPlayerCount(challenge.playersNeeded) === 2 && activeChallengePlayers.length < 2) {
      return 'This team needs two active players before accepting a doubles challenge.';
    }

    return '';
  }

  function isAcceptDisabled(challenge) {
    return updatingChallengeId === challenge.id || Boolean(getAcceptDisabledReason(challenge));
  }

  function renderAcceptRequirementNotice(challenge) {
    const reason = getAcceptDisabledReason(challenge);

    return reason ? <div className="notice notice--info challenge-accept-requirement">{reason}</div> : null;
  }

  function renderChallengeCard(challenge, actions = null) {
    const sourceTeam =
      challenge.createdByTeamClubSlug === clubSlug && challenge.createdByTeamSlug === teamSlug
        ? team
        : eligibleTeams.find(
            (eligibleTeam) =>
              eligibleTeam.clubSlug === challenge.createdByTeamClubSlug &&
              eligibleTeam.teamSlug === challenge.createdByTeamSlug,
          );
    const sourceTeamName = challenge.createdByTeamName || sourceTeam?.name || challenge.createdByTeamSlug || 'Team';
    const sourceTeamLogo = sourceTeam?.logoUrl || defaultTeamLogo;
    const targetLabel =
      challenge.visibility === 'targeted'
        ? `To ${challenge.targetTeamName || challenge.targetTeamSlug}`
        : 'Open to club teams';
    const scheduleGameId =
      challenge.createdByTeamClubSlug === clubSlug && challenge.createdByTeamSlug === teamSlug
        ? challenge.homeGameId
        : challenge.awayGameId;
    const proposedWindows = Array.isArray(challenge.proposedWindows) ? challenge.proposedWindows : [];
    const hasProposedWindows =
      challenge.schedulingMode === 'proposed_windows' && proposedWindows.length > 0;
    const showFixedSchedule =
      !hasProposedWindows && (challenge.isoDate || (!challenge.dateTbd && challenge.timeLabel));

    return (
      <article key={challenge.id} className="challenge-card">
        <div className="challenge-card__badge">
          <img alt={`${sourceTeamName} logo`} src={sourceTeamLogo} />
        </div>
        <div className="challenge-card__body">
          <div className="challenge-card__header">
            <div className="challenge-card__title">
              <strong>{challenge.createdByTeamName || challenge.createdByTeamSlug}</strong>
              <span>{targetLabel}</span>
            </div>
            <time dateTime={challenge.createdAtMs ? new Date(challenge.createdAtMs).toISOString() : undefined}>
              {formatActivityTimestamp(challenge.createdAtMs)}
            </time>
            <span className="status-badge">{getChallengeStatusLabel(challenge)}</span>
          </div>

          <div className="challenge-card__details">
            {showFixedSchedule ? (
              <MatchScheduleWhen
                className="challenge-card__schedule-summary"
                isoDate={challenge.isoDate}
                location={challenge.location}
                timeLabel={challenge.timeLabel}
              />
            ) : null}
            {!showFixedSchedule && !hasProposedWindows && challenge.dateTbd ? (
              <span className="challenge-card__meta">Date and time TBD</span>
            ) : null}
            {challenge.status === 'accepted' && challenge.selectedWindowLabel ? (
              <span className="challenge-card__meta challenge-card__meta--accent">
                {challenge.selectedWindowLabel}
              </span>
            ) : null}
            <span className="challenge-card__meta">
              {normalizeMatchPlayerCount(challenge.playersNeeded)} players
            </span>
            <span className="challenge-card__meta">{challenge.location || 'Court TBD'}</span>
            {challenge.status === 'accepted' && scheduleGameId ? (
              <span className="challenge-card__meta challenge-card__meta--accent">Match scheduled</span>
            ) : null}
          </div>
          {hasProposedWindows ? (
            <div className="challenge-card__windows-panel">
              <p className="challenge-card__windows-title">
                {challenge.status === 'accepted' ? 'Accepted time' : 'Proposed times'}
              </p>
              <div className="challenge-card__windows-grid">
                {proposedWindows.map((window, index) => {
                  const isSelected = challenge.selectedWindowId === window.id;

                  return (
                    <div
                      key={window.id || `window-${index}`}
                      className={`challenge-card__window-slot${isSelected ? ' challenge-card__window-slot--selected' : ''}`}
                    >
                      <span className="challenge-card__windows-option">Option {index + 1}</span>
                      <MatchScheduleWhen
                        className="challenge-card__window-schedule"
                        isoDate={window.isoDate}
                        location={window.location}
                        timeLabel={window.timeLabel}
                      />
                      {isSelected ? <span className="status-badge">Selected</span> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {normalizeMatchPlayerCount(challenge.playersNeeded) === 1 && challenge.createdByPlayerName ? (
            <div className="challenge-card__details">
              <span>{challenge.createdByTeamName || challenge.createdByTeamSlug}: {challenge.createdByPlayerName}</span>
              {challenge.acceptedByPlayerName ? (
                <span>{challenge.acceptedByTeamName || challenge.acceptedByTeamSlug}: {challenge.acceptedByPlayerName}</span>
              ) : null}
            </div>
          ) : null}
          {actions || (challenge.status === 'accepted' && scheduleGameId) ? (
            <div className={`challenge-card__actions${actions ? ' challenge-card__actions--manage' : ''}`}>
              {challenge.status === 'accepted' && scheduleGameId ? (
                <Link className="button button--ghost" to="../schedule">
                  View Matches
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
  useEffect(() => {
    if (incomingChallengeIndex >= incomingChallenges.length) {
      setIncomingChallengeIndex(Math.max(0, incomingChallenges.length - 1));
    }
  }, [incomingChallengeIndex, incomingChallenges.length]);

  const selectedIncomingChallenge = incomingChallenges[incomingChallengeIndex] ?? null;
  const featuredIncomingChallenge = selectedIncomingChallenge;
  const featuredChallengerTeam = featuredIncomingChallenge
    ? eligibleTeams.find(
        (eligibleTeam) =>
          eligibleTeam.clubSlug === featuredIncomingChallenge.createdByTeamClubSlug &&
          eligibleTeam.teamSlug === featuredIncomingChallenge.createdByTeamSlug,
      )
    : null;
  const featuredChallengerName =
    featuredIncomingChallenge?.createdByTeamName ||
    featuredChallengerTeam?.name ||
    featuredIncomingChallenge?.createdByTeamSlug ||
    'A club team';
  const featuredTeamName = team?.name ?? teamSlug;
  const featuredTeamLogo = team?.logoUrl || defaultTeamLogo;
  const featuredChallengerLogo = featuredChallengerTeam?.logoUrl || defaultTeamLogo;
  const postedChallenges = teamChallenges.filter(
    (challenge) => challenge.createdByTeamClubSlug === clubSlug && challenge.createdByTeamSlug === teamSlug,
  );
  const proposedPostedChallenges = postedChallenges.filter((challenge) => challenge.status === 'open');
  const acceptedPostedChallenges = postedChallenges.filter((challenge) => challenge.status === 'accepted');
  const closedPostedChallenges = postedChallenges.filter((challenge) =>
    ['cancelled', 'declined'].includes(challenge.status),
  );
  const openClubChallenges = clubChallenges.filter((challenge) => challenge.status === 'open');
  const teamsOpenToChallenges = useMemo(() => {
    const others = eligibleTeams.filter((eligibleTeam) => eligibleTeam.openToChallenges);
    const selfOpen = team?.openToChallenges === true;
    const selfCard = selfOpen
      ? {
          clubSlug,
          logoUrl: team?.logoUrl ?? '',
          name: team?.name ?? teamSlug,
          openToChallenges: true,
          teamSlug,
        }
      : null;
    const othersNoDup = others.filter(
      (t) => !(t.clubSlug === clubSlug && t.teamSlug === teamSlug),
    );
    const merged = selfCard ? [selfCard, ...othersNoDup] : [...othersNoDup];
    merged.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    return merged;
  }, [clubSlug, eligibleTeams, team, teamSlug]);
  const teamsOpenToChallengesCount = teamsOpenToChallenges.length;
  const otherTeamsOpenToChallengesCount = useMemo(
    () => eligibleTeams.filter((eligibleTeam) => eligibleTeam.openToChallenges).length,
    [eligibleTeams],
  );
  const teamsLookingToBeChallengedCount = Math.max(
    0,
    teamsOpenToChallengesCount - (team?.openToChallenges === true ? 1 : 0),
  );
  const hasOtherTeamsOpenToChallenges = otherTeamsOpenToChallengesCount > 0;
  const directoryOnlySelfOpen = teamsOpenToChallengesCount > 0 && !hasOtherTeamsOpenToChallenges;
  const visiblePostedChallenges =
    postedChallengeTab === 'accepted'
      ? acceptedPostedChallenges
      : postedChallengeTab === 'closed'
        ? closedPostedChallenges
        : proposedPostedChallenges;
  const pendingSentChallengeCount = proposedPostedChallenges.length;
  const emptyHeroState =
    pendingSentChallengeCount > 0
      ? {
          actionLabel: 'View Sent Challenges',
          body:
            pendingSentChallengeCount === 1
              ? 'Track the challenge below while the other captain responds.'
              : 'Track those challenges below while the other captains respond.',
          eyebrow: 'Challenges Pending',
          onAction: () => {
            setPostedChallengeTab('proposed');
            handleScrollToSection('competition-hub-sent');
          },
          title: `${featuredTeamName} has ${pendingSentChallengeCount} challenge${
            pendingSentChallengeCount === 1 ? '' : 's'
          } waiting for a response`,
        }
      : hasOtherTeamsOpenToChallenges
        ? {
            actionLabel: '',
            body: "Click on another team's logo, and invite them to challenge.",
            eyebrow: 'Pick your matchup',
            onAction: () => {},
            title: `${teamsLookingToBeChallengedCount} team${
              teamsLookingToBeChallengedCount === 1 ? '' : 's'
            } looking to be challenged`,
          }
        : directoryOnlySelfOpen
          ? {
              actionLabel: '',
              body: "You're on the board—nice. When more teams join in, they'll show up below. Until then, Challenge a Team works for anyone in the club.",
              eyebrow: 'Your crew is on the list',
              onAction: () => {},
              title: "You're inviting challenges",
            }
          : {
            actionLabel: canManage ? 'Challenge a Team' : '',
            body: 'Choose a club opponent, then propose date, court, and format. The other captain can accept or decline.',
            eyebrow: 'Ready to Compete',
            onAction: handleOpenChallengeForm,
            title: 'Challenge a team and lock in your next match',
          };
  return (
    <div className="page-grid schedule-admin-page">
      <section className="card competition-hub-page">
        <div className="competition-hub-header">
          <div>
            <p className="eyebrow">Competition</p>
            <h1>Competition Hub</h1>
            <p>Send a challenge to another team in your club when you are ready to schedule a match.</p>
          </div>
          {canManage ? (
            <button
              className="button competition-hub-header__action"
              disabled={!challengeClubSlug}
              onClick={handleOpenChallengeForm}
              title={!challengeClubSlug ? 'Club affiliation approval is required before sending challenges.' : 'Challenge a team'}
              type="button"
            >
              <img alt="" aria-hidden="true" src={ACTIVITY_ICON_BY_TYPE.challenge_created} />
              <span>Challenge a Team</span>
            </button>
          ) : null}
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {loading ? (
          <div className="state-panel">
            <p>Loading club challenges...</p>
          </div>
        ) : !challengeClubSlug ? (
          <div className="notice notice--info competition-hub-approval-notice">
            Club challenges are available after this team is approved for a club affiliation.
          </div>
        ) : (
          <div className="challenge-page">
            {featuredIncomingChallenge ? (
              <section
                className={`competition-challenge-hero${
                  featuredIncomingChallenge.proposedWindows?.length
                    ? ' competition-challenge-hero--with-slots'
                    : ''
                }`}
              >
                <div className="competition-challenge-hero__icon">
                  <img alt="" aria-hidden="true" src={ACTIVITY_ICON_BY_TYPE.challenge_created} />
                </div>
                <div className="competition-challenge-hero__copy">
                  <p className="eyebrow">You&apos;ve Been Challenged</p>
                  <h2>{featuredChallengerName} has challenged {featuredTeamName}</h2>
                  <p>
                    {featuredIncomingChallenge.schedulingMode === 'proposed_windows' &&
                    featuredIncomingChallenge.proposedWindows?.length
                      ? `Pick one of ${featuredIncomingChallenge.proposedWindows.length} proposed times, or accept with date and time still TBD.`
                      : `Respond by ${formatChallengeDate(featuredIncomingChallenge)} to secure your match.`}
                  </p>
                </div>
                <div className="competition-challenge-hero__matchup" aria-label={`${featuredChallengerName} versus ${featuredTeamName}`}>
                  <img alt={`${featuredChallengerName} logo`} src={featuredChallengerLogo} />
                  <span>vs</span>
                  <img alt={`${featuredTeamName} logo`} src={featuredTeamLogo} />
                </div>
                <div className="competition-challenge-hero__actions">
                  {renderAcceptWindowSelector(featuredIncomingChallenge)}
                  <div className="competition-challenge-hero__button-row">
                    {renderAcceptSinglesSelector(featuredIncomingChallenge)}
                    <button
                      className="button"
                      disabled={isAcceptDisabled(featuredIncomingChallenge)}
                      onClick={() => handleAcceptChallenge(featuredIncomingChallenge)}
                      title={getAcceptDisabledReason(featuredIncomingChallenge)}
                      type="button"
                    >
                      {updatingChallengeId === featuredIncomingChallenge.id ? 'Accepting...' : 'Accept Challenge'}
                    </button>
                    <button
                      className="button button--ghost"
                      disabled={updatingChallengeId === featuredIncomingChallenge.id}
                      onClick={() => handleDeclineChallenge(featuredIncomingChallenge)}
                      type="button"
                    >
                      Decline Challenge
                    </button>
                  </div>
                  {renderAcceptRequirementNotice(featuredIncomingChallenge)}
                </div>
              </section>
            ) : (
              <section
                className={`competition-challenge-hero competition-challenge-hero--empty${
                  !emptyHeroState.actionLabel && canManage ? ' competition-challenge-hero--no-action' : ''
                }`}
              >
                <div className="competition-challenge-hero__icon">
                  <img alt="" aria-hidden="true" src={ACTIVITY_ICON_BY_TYPE.challenge_created} />
                </div>
                <div className="competition-challenge-hero__copy">
                  <p className="eyebrow">{emptyHeroState.eyebrow}</p>
                  <h2>{emptyHeroState.title}</h2>
                  <p>{emptyHeroState.body}</p>
                </div>
                {emptyHeroState.actionLabel || !canManage ? (
                  <div className="competition-challenge-hero__actions">
                    {emptyHeroState.actionLabel ? (
                      <button className="button" onClick={emptyHeroState.onAction} type="button">
                        {emptyHeroState.actionLabel}
                      </button>
                    ) : (
                      <span className="competition-challenge-hero__note">Captains can send team challenges.</span>
                    )}
                  </div>
                ) : null}
              </section>
            )}

            {canManage && challengeFormOpen ? (
              <div className="challenge-form-dialog" role="dialog" aria-modal="true" aria-label="Challenge a team">
                <button
                  aria-label="Close challenge form"
                  className="challenge-form-dialog__backdrop"
                  onClick={handleCancelEditChallenge}
                  type="button"
                />
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
                  <button className="button button--ghost challenge-form-dialog__close" onClick={handleCancelEditChallenge} type="button">
                    Close
                  </button>
                </div>

                <form
                  className={`schedule-admin-form challenge-form challenge-form--${form.visibility}`}
                  onSubmit={handleCreateChallenge}
                >
                  <div className="challenge-form__section">
                    <div className="challenge-form__section-copy">
                      <h3>Who do you want to play?</h3>
                      <p>
                        Choose a team below, or pick a logo from the directory of teams that opted in to challenges.
                      </p>
                    </div>
                    <div className="challenge-form__audience-row">
                      {editingChallengeId && form.visibility === 'open' ? (
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
                            <option value="open">Open to club (legacy)</option>
                          </select>
                        </label>
                      ) : null}
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
                                  {eligibleTeam.openToChallenges ? ' · Open to challenges' : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                    </div>
                    {form.visibility === 'targeted' && eligibleTeams.length === 0 ? (
                      <div className="notice notice--info challenge-form__hint">
                        No other club teams are available to challenge here yet.
                      </div>
                    ) : null}
                  </div>

                  <div className="challenge-form__section">
                    <div className="challenge-form__section-copy">
                      <h3>When and where?</h3>
                      <p>
                        Propose up to three time windows, set one fixed time, or leave date/time TBD for later
                        coordination.
                      </p>
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
                            proposedWindows: event.target.checked
                              ? current.proposedWindows
                              : Array.from({ length: MAX_PROPOSED_CHALLENGE_WINDOWS }, () =>
                                  createEmptyProposedWindow(),
                                ),
                          }))
                        }
                        type="checkbox"
                      />
                      <span>
                        <strong>Date and time TBD</strong>
                        <small>Uncheck TBD to set a specific time for the match.</small>
                      </span>
                    </label>
                    {form.dateTbd ? (
                      <div className="challenge-form__windows">
                        <div className="challenge-form__windows-copy">
                          <h4>Proposed times (optional)</h4>
                          <p>Add up to three options for the other captain to choose from when accepting.</p>
                        </div>
                        {form.proposedWindows.map((window, index) => (
                          <div key={`proposed-window-${index}`} className="challenge-form__window-row">
                            <p className="challenge-form__window-label">Option {index + 1}</p>
                            <div className="challenge-form__date-time-row">
                              <label className="field challenge-form__date">
                                <span>Date</span>
                                <input
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      proposedWindows: current.proposedWindows.map((entry, entryIndex) =>
                                        entryIndex === index
                                          ? { ...entry, isoDate: event.target.value }
                                          : entry,
                                      ),
                                    }))
                                  }
                                  type="date"
                                  value={window.isoDate}
                                />
                              </label>
                              <div className="field challenge-form__time">
                                <span>Time</span>
                                <div className="challenge-time-selectors">
                                  <select
                                    onChange={(event) =>
                                      setForm((current) => ({
                                        ...current,
                                        proposedWindows: current.proposedWindows.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, hour: event.target.value }
                                            : entry,
                                        ),
                                      }))
                                    }
                                    value={window.hour}
                                  >
                                    <option value="">Hour</option>
                                    {Array.from({ length: 12 }, (_, hourIndex) => String(hourIndex + 1)).map(
                                      (hour) => (
                                        <option key={`${index}-${hour}`} value={hour}>
                                          {hour}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                  <select
                                    onChange={(event) =>
                                      setForm((current) => ({
                                        ...current,
                                        proposedWindows: current.proposedWindows.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, minute: event.target.value }
                                            : entry,
                                        ),
                                      }))
                                    }
                                    value={window.minute}
                                  >
                                    {['00', '15', '30', '45'].map((minute) => (
                                      <option key={`${index}-${minute}`} value={minute}>
                                        {minute}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    onChange={(event) =>
                                      setForm((current) => ({
                                        ...current,
                                        proposedWindows: current.proposedWindows.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, period: event.target.value }
                                            : entry,
                                        ),
                                      }))
                                    }
                                    value={window.period}
                                  >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {!form.dateTbd ? (
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
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  dateTbd: event.target.value ? false : current.dateTbd,
                                  hour: event.target.value,
                                }))
                              }
                              value={form.hour}
                            >
                              <option value="">Hour</option>
                              {Array.from({ length: 12 }, (_, hourIndex) => String(hourIndex + 1)).map((hour) => (
                                <option key={hour} value={hour}>
                                  {hour}
                                </option>
                              ))}
                            </select>
                            <select
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  dateTbd: event.target.value ? false : current.dateTbd,
                                  minute: event.target.value,
                                }))
                              }
                              value={form.minute}
                            >
                              {['00', '15', '30', '45'].map((minute) => (
                                <option key={minute} value={minute}>
                                  {minute}
                                </option>
                              ))}
                            </select>
                            <select
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  dateTbd: event.target.value ? false : current.dateTbd,
                                  period: event.target.value,
                                }))
                              }
                              value={form.period}
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div className="challenge-form__date-time-row">
                      <label className="field challenge-form__players-needed">
                        <span>Players needed</span>
                        <select
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              createdByPlayerId: Number(event.target.value) === 1 ? current.createdByPlayerId : '',
                              playersNeeded: Number(event.target.value),
                            }))
                          }
                          value={form.playersNeeded}
                        >
                          {MATCH_PLAYER_COUNT_OPTIONS.map((count) => (
                            <option key={count} value={count}>
                              {count}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field challenge-form__location">
                        <span>Court</span>
                        <select
                          onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                          value={form.location}
                        >
                          <option value="">Court TBD</option>
                          {form.location && !challengeCourtOptions.some((court) => court.value === form.location) ? (
                            <option value={form.location}>{form.location}</option>
                          ) : null}
                          {challengeCourtOptions.map((court) => (
                            <option key={court.value} value={court.value}>
                              {court.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="challenge-form__match-format">{MATCH_FORMAT_LABEL}</p>
                    {normalizeMatchPlayerCount(form.playersNeeded) === 1 ? (
                      <label className="field challenge-form__singles-player">
                        <span>Who will play singles?</span>
                        <select
                          onChange={(event) =>
                            setForm((current) => ({ ...current, createdByPlayerId: event.target.value }))
                          }
                          value={form.createdByPlayerId}
                        >
                          <option value="">Choose player</option>
                          {activeChallengePlayers.map((player) => (
                            <option key={player.id} value={player.id}>
                              {getChallengePlayerName(player)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : activeChallengePlayers.length < 2 ? (
                      <div className="notice notice--info challenge-form__hint">
                        Your team needs two active members before sending a doubles challenge.
                      </div>
                    ) : null}
                  </div>

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
              </div>
            ) : (
              !canManage ? (
                <div className="notice notice--info">
                Captains and co-captains can create or respond to club challenges.
                </div>
              ) : null
            )}

            <section className="schedule-admin-card" id="competition-hub-directory">
              <div className="schedule-admin-card__header">
                <div>
                  <p className="eyebrow">Ready to play</p>
                  <h2>Who wants a game?</h2>
                  <p>
                    The teams shown here are seeking to be challenged by other teams. Click their logo to initiate a
                    challenge.
                  </p>
                </div>
              </div>
              {teamsOpenToChallengesCount > 0 ? (
                <div className="challenge-team-directory" role="list">
                  {teamsOpenToChallenges.map((opponentTeam) => {
                    const isDirectorySelf =
                      opponentTeam.clubSlug === clubSlug && opponentTeam.teamSlug === teamSlug;
                    const directoryDisabled = !canManage || isDirectorySelf;
                    const directoryTitle = isDirectorySelf
                      ? `${opponentTeam.name} is your team — you're on the list so others know you're up for a game`
                      : canManage
                        ? `Challenge ${opponentTeam.name}`
                        : 'Captains can challenge this team';

                    return (
                    <div className="challenge-team-directory__item" key={`${opponentTeam.clubSlug}:${opponentTeam.teamSlug}`} role="listitem">
                      <button
                        className={`challenge-team-directory__button${isDirectorySelf ? ' challenge-team-directory__button--self' : ''}`}
                        disabled={directoryDisabled}
                        onClick={() => handleStartChallengeToTeam(opponentTeam)}
                        title={directoryTitle}
                        type="button"
                      >
                        <span className="challenge-team-directory__logo-wrap">
                          <img
                            alt=""
                            className="challenge-team-directory__logo"
                            decoding="async"
                            onError={(event) => {
                              event.currentTarget.onerror = null;
                              event.currentTarget.src = defaultTeamLogo;
                            }}
                            src={opponentTeam.logoUrl || defaultTeamLogo}
                          />
                        </span>
                        <span className="challenge-team-directory__name">
                          {opponentTeam.name}
                          {isDirectorySelf ? (
                            <span className="challenge-team-directory__you-badge"> Your team</span>
                          ) : null}
                        </span>
                      </button>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="notice notice--info">
                  Nobody else has raised their hand yet. Ask your captain to flip on &ldquo;Open to challenges&rdquo; in Team
                  Settings if you want your crew on this list—or jump straight to Challenge a Team.
                </div>
              )}
              {openClubChallenges.length > 0 ? (
                <>
                  <h3 className="challenge-team-directory__legacy-heading">Older open challenge posts</h3>
                  <p className="challenge-team-directory__legacy-copy">
                    These club-wide listings were created before the directory. You can still accept one below.
                  </p>
                  <div className="challenge-grid">
                    {openClubChallenges.map((challenge) =>
                      renderChallengeCard(
                        challenge,
                        canManage ? (
                          <>
                            {renderAcceptWindowSelector(challenge)}
                            {renderAcceptSinglesSelector(challenge)}
                            <button
                              className="button"
                              disabled={isAcceptDisabled(challenge)}
                              onClick={() => handleAcceptChallenge(challenge)}
                              title={getAcceptDisabledReason(challenge)}
                              type="button"
                            >
                              {updatingChallengeId === challenge.id ? 'Accepting...' : 'Accept Challenge'}
                            </button>
                            {renderAcceptRequirementNotice(challenge)}
                          </>
                        ) : null,
                      ),
                    )}
                  </div>
                </>
              ) : null}
            </section>

            {incomingChallenges.length > 1 ? (
              <section id="competition-challenges-inbox" className="schedule-admin-card">
                <div className="schedule-admin-card__header">
                  <div>
                    <p className="eyebrow">Inbox</p>
                    <h2>Challenges received</h2>
                    <p>
                      {incomingChallenges.length} challenges waiting — pick one to respond in the banner above.
                    </p>
                  </div>
                  <span className="challenge-inbox-count">
                    {incomingChallengeIndex + 1} / {incomingChallenges.length}
                  </span>
                </div>
                <div className="challenge-inbox-queue" role="list" aria-label="Choose a challenge">
                  {incomingChallenges.map((challenge, index) => {
                    const sourceTeam = eligibleTeams.find(
                      (eligibleTeam) =>
                        eligibleTeam.clubSlug === challenge.createdByTeamClubSlug &&
                        eligibleTeam.teamSlug === challenge.createdByTeamSlug,
                    );
                    const sourceName =
                      challenge.createdByTeamName || sourceTeam?.name || challenge.createdByTeamSlug || 'Team';
                    const sourceLogo = sourceTeam?.logoUrl || defaultTeamLogo;
                    const isActive = index === incomingChallengeIndex;

                    return (
                      <button
                        key={challenge.id}
                        aria-current={isActive ? 'true' : undefined}
                        aria-label={`${sourceName}, ${formatActivityTimestamp(challenge.createdAtMs)}`}
                        className={`challenge-inbox-queue__item${isActive ? ' challenge-inbox-queue__item--active' : ''}`}
                        onClick={() => setIncomingChallengeIndex(index)}
                        role="listitem"
                        type="button"
                      >
                        <img alt="" className="challenge-inbox-queue__logo" src={sourceLogo} />
                        <span className="challenge-inbox-queue__name">{sourceName}</span>
                        <time
                          dateTime={
                            challenge.createdAtMs
                              ? new Date(challenge.createdAtMs).toISOString()
                              : undefined
                          }
                        >
                          {formatActivityTimestamp(challenge.createdAtMs)}
                        </time>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : incomingChallenges.length === 0 ? (
              <section id="competition-challenges-inbox" className="schedule-admin-card">
                <div className="schedule-admin-card__header">
                  <div>
                    <p className="eyebrow">Inbox</p>
                    <h2>Challenges received</h2>
                    <p>Respond to direct challenges from other captains.</p>
                  </div>
                </div>
                <div className="notice notice--info">No direct challenges are waiting for this team.</div>
              </section>
            ) : null}

            <section className="schedule-admin-card" id="competition-hub-sent">
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
                                onClick={() => openCancelChallengeConfirm(challenge)}
                                type="button"
                              >
                                {updatingChallengeId === challenge.id ? 'Cancelling...' : 'Cancel'}
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
          </div>
        )}
      </section>

      {cancelConfirmChallenge ? (
        <div
          className="club-challenge-dialog club-challenge-dialog--layered"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-challenge-dialog-title"
        >
          <button
            aria-label="Close cancel challenge confirmation"
            className="club-challenge-dialog__backdrop"
            disabled={updatingChallengeId === cancelConfirmChallenge.id}
            onClick={() => setCancelConfirmChallenge(null)}
            type="button"
          />
          <div className="club-challenge-dialog__panel">
            <p className="eyebrow">Challenges sent</p>
            <h2 id="cancel-challenge-dialog-title">
              Cancel challenge to {cancelConfirmChallenge.targetTeamName || cancelConfirmChallenge.targetTeamSlug}?
            </h2>
            <p>
              {cancelConfirmChallenge.targetTeamName || 'The other team'} will no longer see this challenge in their
              inbox. You can send a new challenge later if plans change.
            </p>
            <div className="club-challenge-dialog__actions">
              <button
                className="button button--ghost"
                disabled={updatingChallengeId === cancelConfirmChallenge.id}
                onClick={() => setCancelConfirmChallenge(null)}
                type="button"
              >
                Keep challenge
              </button>
              <button
                className="button button--danger"
                disabled={updatingChallengeId === cancelConfirmChallenge.id}
                onClick={() => void confirmCancelChallenge()}
                type="button"
              >
                {updatingChallengeId === cancelConfirmChallenge.id ? 'Cancelling…' : 'Cancel challenge'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [creatingCrop, setCreatingCrop] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(createEmptyTeamSettingsForm());
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [cropImageSrc, setCropImageSrc] = useState('');
  const [cropFileName, setCropFileName] = useState('team-logo.webp');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState(null);

  const canManage = canManageRole(membership?.role);
  const displayedLogoUrl = logoPreviewUrl || team?.logoUrl || defaultTeamLogo;
  const isTeamArchived = team?.status === 'archived';
  const canManageActiveTeam = canManage && !isTeamArchived;
  const activeMemberCount = members.filter((member) => member.status !== 'inactive').length;
  const teamIsFull = activeMemberCount >= TEAM_MEMBER_LIMIT;
  const canShareInvite = canManageActiveTeam && !teamIsFull;
  const hasUnsavedLogo = Boolean(form.logoFile);
  const inviteLink = team?.joinCode && !teamIsFull
    ? `${window.location.origin}${window.location.pathname}#/join?code=${encodeURIComponent(team.joinCode)}`
    : '';

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
    const [teamData, membershipData] = await Promise.all([
      getTeam(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);
    const memberData = await listTeamMembers(clubSlug, teamSlug);

    setTeam(teamData);
    setMembers(memberData);
    setMembership(membershipData);
    setForm(createEmptyTeamSettingsForm(teamData ?? {}));
    replaceLogoPreview('');
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
        openToChallenges: form.openToChallenges,
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
    if (teamIsFull) {
      setError('This team already has two members, so new joins are disabled.');
      setMessage('');
      return;
    }

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

  async function handleCopyInviteLink() {
    if (teamIsFull) {
      setError('This team already has two members, so there is no invite link to copy.');
      setMessage('');
      return;
    }

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
              Manage team branding and join code settings from one shared admin workspace.
            </p>
          </div>
          <span className="settings-admin-member-pill">
            {activeMemberCount} / {TEAM_MEMBER_LIMIT} Members
          </span>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}

        <div className="settings-admin-overview">
          <div className="detail-grid">
            <div className="detail-card settings-admin-join-card">
              <div className="settings-admin-join-copy">
                <p className="eyebrow">Invite Players</p>
                <h2>{teamIsFull ? 'Team is full' : 'Send this link to teammates'}</h2>
                <p>
                  {teamIsFull
                    ? 'This team already has two members, so new joins are disabled.'
                    : 'Players can use the invite link or enter the join code on the Join Team page. New players will appear in Manage Players after they join.'}
                </p>
              </div>
              <div className="settings-admin-invite-details">
                <div className="settings-admin-invite-row">
                  <span>Join code</span>
                  <div className="settings-admin-invite-control">
                    <strong>{teamIsFull ? 'Disabled' : team?.joinCode ?? 'Not available yet'}</strong>
                    {canShareInvite ? (
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
                    <code>{teamIsFull ? 'Team member limit reached' : inviteLink || 'Not available yet'}</code>
                    {canShareInvite ? (
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
              <p>Upload your own custom logo and keep the team name current.</p>
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
                  <label className="checkbox-field settings-admin-open-challenges">
                    <input
                      checked={form.openToChallenges}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, openToChallenges: event.target.checked }))
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>Open to challenges</strong>
                      <small>
                        When on, your team logo appears in the Competition Hub so other captains can challenge you
                        directly.
                      </small>
                    </span>
                  </label>
                  <div className="settings-admin-form__logo-actions">
                    <label className="button button--ghost settings-admin-form__file-button">
                      <input accept="image/*" className="settings-admin-form__file-input" onChange={handleLogoSelection} type="file" />
                      Change Logo
                    </label>
                    <button className="button settings-admin-save-button" disabled={saving} type="submit">
                      {saving ? 'Saving settings...' : hasUnsavedLogo ? 'Save Settings & Publish Logo' : 'Save Settings'}
                    </button>
                  </div>
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
  const [adminSection, setAdminSection] = useState(getInitialAdminSection(location.pathname));
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [playerCopyForm, setPlayerCopyForm] = useState(createEmptyPlayerCopyForm());
  const [adminPlayers, setAdminPlayers] = useState([]);
  const [adminActivity, setAdminActivity] = useState([]);
  const [activityFilters, setActivityFilters] = useState(createEmptyActivityFilters());
  const [loadingAdminActivity, setLoadingAdminActivity] = useState(false);
  const [deletingActivityId, setDeletingActivityId] = useState('');
  const [selectedAdminEventsClubSlug, setSelectedAdminEventsClubSlug] = useState('');
  const [loadingAdminPlayers, setLoadingAdminPlayers] = useState(false);
  const [copyingPlayers, setCopyingPlayers] = useState(false);
  const [updatingTeamLogoId, setUpdatingTeamLogoId] = useState('');
  const [updatingAdminMemberRoleKey, setUpdatingAdminMemberRoleKey] = useState('');
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
  const [clubManagersBySlug, setClubManagersBySlug] = useState({});
  const [clubManagerEmailDrafts, setClubManagerEmailDrafts] = useState({});
  const [updatingClubManagerKey, setUpdatingClubManagerKey] = useState('');
  const [resetTestDataConfirm, setResetTestDataConfirm] = useState('');
  const [resettingFirestoreTestData, setResettingFirestoreTestData] = useState(false);

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
        setClubManagersBySlug({});
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
      const managerGroups = await Promise.all(
        clubData.map(async (club) => [
          club.slug,
          await listClubManagers({ clubSlug: club.slug, user }).catch(() => []),
        ]),
      );

      setClubs(clubData);
      setSelectedAdminEventsClubSlug((current) =>
        current && clubData.some((club) => club.slug === current)
          ? current
          : clubData[0]?.slug ?? '',
      );
      setClubManagersBySlug(Object.fromEntries(managerGroups));
      setClubManagerEmailDrafts(
        clubData.reduce((drafts, club) => {
          drafts[club.slug] = '';
          return drafts;
        }, {}),
      );
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
    setAdminSection(getInitialAdminSection(location.pathname));
  }, [location.pathname]);

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
  const activityTypeOptions = useMemo(
    () =>
      Object.values(ACTIVITY_TYPES).map((type) => ({
        label: getActivityTypeMeta(type).label,
        value: type,
      })),
    [],
  );
  const activityTeamOptions = useMemo(
    () =>
      adminTeams
        .map((team) => ({
          clubSlug: team.clubSlug,
          label: `${team.name} (${team.clubName})`,
          teamSlug: team.teamSlug,
        }))
        .sort((first, second) => first.label.localeCompare(second.label)),
    [adminTeams],
  );
  const selectedAdminEventsClub = useMemo(
    () => clubs.find((club) => club.slug === selectedAdminEventsClubSlug) ?? null,
    [clubs, selectedAdminEventsClubSlug],
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

  useEffect(() => {
    let ignore = false;

    async function loadActivity() {
      if (!user?.uid || !isAuthorized) {
        setAdminActivity([]);
        return;
      }

      setLoadingAdminActivity(true);
      setError('');

      try {
        const activity = await listAdminActivity({
          ...activityFilters,
          limitCount: 100,
          user,
        });

        if (!ignore) {
          setAdminActivity(activity);
        }
      } catch (loadActivityError) {
        if (!ignore) {
          setAdminActivity([]);
          setError(loadActivityError.message ?? 'Unable to load activity.');
        }
      } finally {
        if (!ignore) {
          setLoadingAdminActivity(false);
        }
      }
    }

    loadActivity();

    return () => {
      ignore = true;
    };
  }, [
    activityFilters.clubId,
    activityFilters.endDate,
    activityFilters.startDate,
    activityFilters.teamId,
    activityFilters.type,
    isAuthorized,
    user?.uid,
  ]);

  function openAdminSection(section) {
    setAdminSection(section);
    setAdminMenuOpen(false);
    setResetTestDataConfirm('');
    setError('');
    setMessage('');

    if (section === 'activity') {
      navigate('/admin/activity');
    } else if (section === 'events') {
      navigate('/admin/events');
    } else if (location.pathname === '/admin/activity' || location.pathname === '/admin/events') {
      navigate('/admin');
    }
  }

  async function handleResetFirestoreTestData() {
    if (resetTestDataConfirm !== RESET_FIRESTORE_TEST_DATA_PHRASE) {
      setError(`Type the phrase exactly: ${RESET_FIRESTORE_TEST_DATA_PHRASE}`);
      return;
    }

    setResettingFirestoreTestData(true);
    setError('');
    setMessage('');

    try {
      await resetFirestoreTestData({ user });
      setMessage('Firestore test data was reset. Clubs and accounts were kept.');
      setResetTestDataConfirm('');
      await loadAdminData();
    } catch (resetErr) {
      setError(resetErr.message ?? 'Unable to reset test data.');
    } finally {
      setResettingFirestoreTestData(false);
    }
  }

  async function handleDeleteAdminActivity(activity) {
    if (!activity?.id) {
      return;
    }

    if (!window.confirm('Remove this activity log entry? This cannot be undone.')) {
      return;
    }

    setDeletingActivityId(activity.id);
    setError('');

    try {
      await deleteActivityLog({ activityId: activity.id, user });
      setAdminActivity((current) => current.filter((item) => item.id !== activity.id));
    } catch (deleteErr) {
      setError(deleteErr.message ?? 'Unable to delete that activity entry.');
    } finally {
      setDeletingActivityId('');
    }
  }

  function updateActivityFilter(field, value) {
    setActivityFilters((current) => {
      const nextFilters = { ...current, [field]: value };

      if (field === 'clubId') {
        nextFilters.teamId = '';
      }

      return nextFilters;
    });
    setMessage('');
    setError('');
  }

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
      const club = await createClub({
        ...clubForm,
        courtLabels: parseCourtLabelsText(clubForm.courtLabelsText),
        user,
      });
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
      const clubDraft = clubDrafts[club.slug] ?? createEmptyClubForm(club);

      await renameClub({
        ...clubDraft,
        clubSlug: club.slug,
        courtLabels: parseCourtLabelsText(clubDraft.courtLabelsText),
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

  async function handleAddClubManager(club) {
    const email = clubManagerEmailDrafts[club.slug] ?? '';
    setUpdatingClubManagerKey(`${club.slug}:add`);
    setError('');
    setMessage('');

    try {
      await addClubManager({ clubSlug: club.slug, email, user });
      setClubManagerEmailDrafts((current) => ({ ...current, [club.slug]: '' }));
      setMessage(`Club manager added to ${club.name}.`);
      await loadAdminData();
    } catch (managerError) {
      setError(managerError.message ?? 'Unable to add that club manager.');
    } finally {
      setUpdatingClubManagerKey('');
    }
  }

  async function handleRemoveClubManager(club, manager) {
    const confirmed = window.confirm(`Remove ${manager.email || manager.displayName || manager.uid} as a manager for ${club.name}?`);

    if (!confirmed) {
      return;
    }

    setUpdatingClubManagerKey(`${club.slug}:${manager.uid}`);
    setError('');
    setMessage('');

    try {
      await removeClubManager({ clubSlug: club.slug, managerUid: manager.uid, user });
      setMessage('Club manager removed.');
      await loadAdminData();
    } catch (managerError) {
      setError(managerError.message ?? 'Unable to remove that club manager.');
    } finally {
      setUpdatingClubManagerKey('');
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

  async function handleAdminMemberRoleChange(teamSummary, member, nextRole) {
    const updateKey = `${teamSummary.clubSlug}::${teamSummary.teamSlug}::${member.uid}`;

    setUpdatingAdminMemberRoleKey(updateKey);
    setError('');
    setMessage('');

    try {
      await updateTeamMemberRoleAsAdmin({
        clubSlug: teamSummary.clubSlug,
        role: nextRole,
        targetUid: member.uid,
        teamSlug: teamSummary.teamSlug,
        user,
      });
      setMessage(
        `${member.displayName || 'Player'} is now ${formatRoleLabel(nextRole).toLowerCase()} on ${teamSummary.name}.`,
      );
      await loadAdminData();
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to update that team role.');
    } finally {
      setUpdatingAdminMemberRoleKey('');
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
              onClick={() => openAdminSection('teams')}
              type="button"
            >
              Teams
            </button>
            <button
              className={`nav-link admin-nav-button ${adminSection === 'clubs' ? 'nav-link--active' : ''}`}
              onClick={() => openAdminSection('clubs')}
              type="button"
            >
              Clubs
            </button>
            <button
              className={`nav-link admin-nav-button ${adminSection === 'players' ? 'nav-link--active' : ''}`}
              onClick={() => openAdminSection('players')}
              type="button"
            >
              Players
            </button>
            <button
              className={`nav-link admin-nav-button ${adminSection === 'activity' ? 'nav-link--active' : ''}`}
              onClick={() => openAdminSection('activity')}
              type="button"
            >
              Activity
            </button>
            <button
              className={`nav-link admin-nav-button ${adminSection === 'events' ? 'nav-link--active' : ''}`}
              onClick={() => openAdminSection('events')}
              type="button"
            >
              Events
            </button>
            <button
              className={`nav-link admin-nav-button ${adminSection === 'tools' ? 'nav-link--active' : ''}`}
              onClick={() => openAdminSection('tools')}
              type="button"
            >
              Challenges
            </button>
            <button
              className={`nav-link admin-nav-button ${adminSection === 'testing' ? 'nav-link--active' : ''}`}
              onClick={() => openAdminSection('testing')}
              type="button"
            >
              Testing
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
                : adminSection === 'activity'
                  ? 'Activity'
                  : adminSection === 'events'
                    ? 'Events'
                    : adminSection === 'testing'
                      ? 'Testing'
                      : 'Challenges'}
        </h1>
        <p>
          {adminSection === 'teams'
            ? 'Review each team, its club affiliation, captains, and member count.'
            : adminSection === 'clubs'
              ? 'Create clubs, manage club names, and review teams requesting club affiliation.'
              : adminSection === 'players'
                ? 'Copy existing players from one team into another without asking them to rejoin.'
                : adminSection === 'activity'
                  ? 'Monitor recent platform activity across clubs, teams, challenges, matches, and events.'
                  : adminSection === 'events'
                    ? 'Create and manage club event listings from the admin toolset.'
                    : adminSection === 'testing'
                      ? 'Dangerous shortcuts for staging and local QA. Do not use in production with real members.'
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
                <p>Review each team, its club affiliation, captains, member count, and member roles.</p>
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
                      {teamSummary.members?.length ? (
                        <div className="admin-team-card__members">
                          <strong>Member roles</strong>
                          {teamSummary.members.map((member) => {
                            const role = member.role ?? 'member';
                            const updateKey = `${teamSummary.clubSlug}::${teamSummary.teamSlug}::${member.uid}`;
                            const isUpdating = updatingAdminMemberRoleKey === updateKey;
                            const isCaptain = role === 'captain';

                            return (
                              <div key={member.uid} className="admin-team-member-row">
                                <div className="admin-team-member-row__identity">
                                  <strong>{member.displayName || member.uid}</strong>
                                  <span>{member.email || member.uid}</span>
                                </div>
                                {isCaptain ? (
                                  <span className="status-badge member-role-card__badge member-role-card__badge--captain">
                                    Captain
                                  </span>
                                ) : (
                                  <div className="member-role-card__actions" aria-label={`Change role for ${member.displayName}`}>
                                    <button
                                      className={`choice-button ${role === 'member' ? 'choice-button--active' : ''}`}
                                      disabled={isUpdating}
                                      onClick={() => handleAdminMemberRoleChange(teamSummary, member, 'member')}
                                      type="button"
                                    >
                                      {isUpdating && role === 'coCaptain' ? 'Saving...' : 'Member'}
                                    </button>
                                    <button
                                      className={`choice-button ${role === 'coCaptain' ? 'choice-button--active' : ''}`}
                                      disabled={isUpdating}
                                      onClick={() => handleAdminMemberRoleChange(teamSummary, member, 'coCaptain')}
                                      type="button"
                                    >
                                      {isUpdating && role === 'member' ? 'Saving...' : 'Co-captain'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
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
                <label className="field">
                  <span>Court numbers</span>
                  <textarea
                    onChange={(event) => setClubForm((current) => ({ ...current, courtLabelsText: event.target.value }))}
                    placeholder="One per line, e.g.&#10;1&#10;2&#10;3&#10;4"
                    value={clubForm.courtLabelsText}
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
                        <label className="field">
                          <span>Court numbers</span>
                          <textarea
                            onChange={(event) =>
                              setClubDrafts((current) => ({
                                ...current,
                                [club.slug]: {
                                  ...(current[club.slug] ?? createEmptyClubForm(club)),
                                  courtLabelsText: event.target.value,
                                },
                              }))
                            }
                            placeholder="One per line, e.g.&#10;1&#10;2&#10;3&#10;4"
                            value={clubDrafts[club.slug]?.courtLabelsText ?? ''}
                          />
                        </label>
                        <span>Slug: {club.slug}</span>
                        <span>Approved teams: {club.approvedTeamCount}</span>
                        <span>Pending requests: {club.pendingRequestCount}</span>
                        <div className="club-manager-tool">
                          <strong>Club managers</strong>
                          <div className="settings-admin-invite-control">
                            <input
                              onChange={(event) =>
                                setClubManagerEmailDrafts((current) => ({
                                  ...current,
                                  [club.slug]: event.target.value,
                                }))
                              }
                              placeholder="manager@example.com"
                              type="email"
                              value={clubManagerEmailDrafts[club.slug] ?? ''}
                            />
                            <button
                              className="button button--ghost"
                              disabled={updatingClubManagerKey === `${club.slug}:add`}
                              onClick={() => handleAddClubManager(club)}
                              type="button"
                            >
                              {updatingClubManagerKey === `${club.slug}:add` ? 'Adding...' : 'Add manager'}
                            </button>
                          </div>
                          {(clubManagersBySlug[club.slug] ?? []).length > 0 ? (
                            <div className="club-manager-list">
                              {(clubManagersBySlug[club.slug] ?? []).map((manager) => (
                                <div key={manager.uid} className="club-manager-list__item">
                                  <span>
                                    {manager.displayName || manager.email || manager.uid}
                                    {manager.email ? <small>{manager.email}</small> : null}
                                  </span>
                                  <button
                                    className="button button--danger"
                                    disabled={updatingClubManagerKey === `${club.slug}:${manager.uid}`}
                                    onClick={() => handleRemoveClubManager(club, manager)}
                                    type="button"
                                  >
                                    {updatingClubManagerKey === `${club.slug}:${manager.uid}` ? 'Removing...' : 'Remove'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span>No club managers assigned yet.</span>
                          )}
                        </div>
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
                    placeholder="Search by name, email, team, or club"
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
        ) : adminSection === 'events' ? (
          <section className="schedule-admin-card admin-events-card">
            <div className="schedule-admin-card__header">
              <div>
                <p className="eyebrow">Events</p>
                <h2>Club event management</h2>
                <p>Create, publish, archive, and delete club events from the admin toolset.</p>
              </div>
            </div>

            {loading ? (
              <div className="state-panel">
                <p>Loading clubs...</p>
              </div>
            ) : clubs.length > 0 ? (
              <>
                <label className="field admin-events-club-picker">
                  <span>Club</span>
                  <select
                    onChange={(event) => setSelectedAdminEventsClubSlug(event.target.value)}
                    value={selectedAdminEventsClubSlug}
                  >
                    {clubs.map((club) => (
                      <option key={club.slug} value={club.slug}>
                        {club.name}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedAdminEventsClub ? (
                  <ClubEventsPanel
                    clubName={selectedAdminEventsClub.name}
                    clubSlug={selectedAdminEventsClub.slug}
                    managerToolsLabel="Admin event tools"
                    managerView
                    user={user}
                  />
                ) : (
                  <div className="notice notice--info">Choose a club to manage events.</div>
                )}
              </>
            ) : (
              <div className="notice notice--info">Create a club before adding events.</div>
            )}
          </section>
        ) : adminSection === 'activity' ? (
          <section className="schedule-admin-card admin-activity-card">
            <div className="schedule-admin-card__header">
              <div>
                <p className="eyebrow">Activity</p>
                <h2>Recent platform activity</h2>
                <p>A structured feed of important actions across clubs, teams, challenges, matches, and events.</p>
              </div>
              <button
                className="button button--ghost"
                onClick={() => setActivityFilters(createEmptyActivityFilters())}
                type="button"
              >
                Reset filters
              </button>
            </div>

            <div className="schedule-admin-form admin-activity-filters">
              <label className="field">
                <span>Type</span>
                <select onChange={(event) => updateActivityFilter('type', event.target.value)} value={activityFilters.type}>
                  <option value="">All activity</option>
                  {activityTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Club</span>
                <select onChange={(event) => updateActivityFilter('clubId', event.target.value)} value={activityFilters.clubId}>
                  <option value="">All clubs</option>
                  {clubs.map((club) => (
                    <option key={club.slug} value={club.slug}>
                      {club.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Team</span>
                <select onChange={(event) => updateActivityFilter('teamId', event.target.value)} value={activityFilters.teamId}>
                  <option value="">All teams</option>
                  {activityTeamOptions
                    .filter((team) => !activityFilters.clubId || team.clubSlug === activityFilters.clubId)
                    .map((team) => (
                      <option key={`${team.clubSlug}-${team.teamSlug}`} value={team.teamSlug}>
                        {team.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>Start date</span>
                <input
                  onChange={(event) => updateActivityFilter('startDate', event.target.value)}
                  type="date"
                  value={activityFilters.startDate}
                />
              </label>
              <label className="field">
                <span>End date</span>
                <input
                  onChange={(event) => updateActivityFilter('endDate', event.target.value)}
                  type="date"
                  value={activityFilters.endDate}
                />
              </label>
            </div>

            {loadingAdminActivity ? (
              <div className="state-panel">
                <p>Loading activity...</p>
              </div>
            ) : adminActivity.length > 0 ? (
              <div className="admin-activity-feed">
                {adminActivity.map((activity) => {
                  const typeMeta = getActivityTypeMeta(activity.type);
                  const metadata = activity.metadata ?? {};

                  return (
                    <article key={activity.id} className="admin-activity-item">
                      <div className="admin-activity-item__icon">{typeMeta.icon}</div>
                      <div className="admin-activity-item__body">
                        <div className="admin-activity-item__header">
                          <div>
                            <span className="status-badge">{typeMeta.label}</span>
                            <h3>{activity.description}</h3>
                          </div>
                          <div className="admin-activity-item__header-aside">
                            <time dateTime={activity.timestampMs ? new Date(activity.timestampMs).toISOString() : undefined}>
                              {formatActivityTimestamp(activity.timestampMs)}
                            </time>
                            <button
                              aria-label="Delete activity log entry"
                              className="news-icon-button news-icon-button--danger"
                              disabled={deletingActivityId === activity.id}
                              onClick={() => void handleDeleteAdminActivity(activity)}
                              title="Delete log entry"
                              type="button"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                        <div className="admin-activity-item__meta">
                          <span>Club: {metadata.clubName || activity.clubId || 'Unknown'}</span>
                          {metadata.teamName || activity.teamId ? (
                            <span>Team: {metadata.teamName || activity.teamId}</span>
                          ) : null}
                          {metadata.opponentTeamName || metadata.opponentName ? (
                            <span>Opponent: {metadata.opponentTeamName || metadata.opponentName}</span>
                          ) : null}
                          {metadata.eventTitle ? <span>Event: {metadata.eventTitle}</span> : null}
                          {metadata.scoreLabel ? <span>Score: {metadata.scoreLabel}</span> : null}
                          {activity.targetId ? <span>Target: {activity.targetId}</span> : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="notice notice--info">No activity matches those filters yet.</div>
            )}
          </section>
        ) : adminSection === 'testing' ? (
          <section className="schedule-admin-card">
            <div className="schedule-admin-card__header">
              <div>
                <p className="eyebrow">Firestore</p>
                <h2>Reset test data</h2>
                <p>
                  Removes teams (and their players, games, and team-scoped news), club news, challenges, affiliation
                  requests, events, activity logs, and admin notifications across every club—including the independent area.
                  Club documents, platform admins, club approvers, and user profiles are left in place. Orphaned
                  membership summary docs are removed when teams are deleted; other storage files may remain until you
                  clear Firebase Storage manually.
                </p>
              </div>
            </div>

            <div className="notice notice--error">
              <p>
                <strong>This cannot be undone.</strong> Deploy the latest <code>firestore.rules</code> so platform admins
                can delete club events during a reset.
              </p>
            </div>

            <label className="field">
              <span>
                Type <strong>{RESET_FIRESTORE_TEST_DATA_PHRASE}</strong> to confirm
              </span>
              <input
                autoComplete="off"
                disabled={resettingFirestoreTestData || loading}
                onChange={(event) => setResetTestDataConfirm(event.target.value)}
                spellCheck={false}
                type="text"
                value={resetTestDataConfirm}
              />
            </label>

            <div className="settings-admin-form__actions">
              <button
                className="button button--danger"
                disabled={
                  resettingFirestoreTestData || loading || resetTestDataConfirm !== RESET_FIRESTORE_TEST_DATA_PHRASE
                }
                onClick={() => {
                  handleResetFirestoreTestData();
                }}
                type="button"
              >
                {resettingFirestoreTestData ? 'Resetting Firestore…' : 'Reset all test data'}
              </button>
            </div>
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
