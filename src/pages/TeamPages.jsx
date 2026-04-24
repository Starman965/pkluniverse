import { useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  PLAYER_SKILL_LEVELS,
  buildPairingSummary,
  buildStandingsSummary,
  createClub,
  deleteClub,
  deleteGame,
  deleteNewsPost,
  getMembership,
  getTeam,
  listAdminTeamSummaries,
  listApprovedClubTeams,
  listClubAffiliationRequests,
  listClubs,
  listGames,
  listNewsPosts,
  listPlayers,
  listTeamMembers,
  requestClubAffiliation,
  renameClub,
  reviewClubAffiliationRequest,
  rotateTeamJoinCode,
  saveGame,
  saveGamePairings,
  saveNewsPost,
  savePlayer,
  setAvailability,
  updateTeamMemberRole,
  updateTeamSettings,
} from '../lib/data';
import defaultTeamLogo from '../../default_team_logo.png';

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
  return {
    dateTbd: game.dateTbd === true,
    isoDate: game.isoDate ?? '',
    location: game.location ?? '',
    matchStatus: game.matchStatus ?? 'scheduled',
    opponent: game.opponent ?? '',
    opponentScore: game.opponentScore ?? '',
    teamScore: game.teamScore ?? '',
    timeLabel: game.dateTbd === true || game.timeLabel === 'Time TBD' ? '' : game.timeLabel ?? '',
  };
}

function buildScheduleAdminDrafts(games) {
  return games.reduce((accumulator, game) => {
    accumulator[game.id] = createScheduleAdminDraft(game);
    return accumulator;
  }, {});
}

function createEmptyScheduleAdminForm(primaryLocation = 'Blackhawk Country Club') {
  return {
    dateTbd: false,
    isoDate: '',
    location: primaryLocation || 'Blackhawk Country Club',
    matchStatus: 'scheduled',
    opponent: '',
    opponentScore: '',
    teamScore: '',
    timeLabel: '',
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

  return nextPairings;
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

      reject(new Error('That logo file could not be read as an image.'));
    };

    reader.onerror = () => {
      reject(new Error('That logo file could not be read as an image.'));
    };

    reader.readAsDataURL(file);
  });
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That logo file could not be read as an image.'));
    image.src = source;
  });
}

async function createCroppedLogoFile(source, cropPixels, fileName = 'team-logo.png') {
  const image = await loadImageElement(source);
  const canvas = document.createElement('canvas');
  const outputSize = 1024;
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('We could not prepare that cropped logo.');
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

      reject(new Error('We could not create that cropped logo.'));
    }, 'image/png');
  });

  return new File([blob], fileName.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
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

function formatDupr(value) {
  return typeof value === 'number' ? value.toFixed(3) : 'TBD';
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
  return buildPairingSummary(game, players).pairings.map((pairing) => {
    const teamDupr = pairing.players.reduce(
      (total, player) => (typeof player.dupr === 'number' ? total + player.dupr : total),
      0,
    );

    return {
      ...pairing,
      filledSlots: pairing.players.length,
      teamDupr,
    };
  });
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

function createEmptyTeamSettingsForm(teamName = '', primaryLocation = '') {
  return {
    logoFile: null,
    primaryLocation,
    teamName,
  };
}

function createEmptyRosterForm() {
  return {
    active: true,
    dupr: '',
    firstName: '',
    lastName: '',
    playerId: '',
    skillLevel: '',
  };
}

function createRosterFormFromPlayer(player) {
  return {
    active: player.active !== false,
    dupr: typeof player.dupr === 'number' ? String(player.dupr) : '',
    firstName: player.firstName ?? '',
    lastName: player.lastName ?? '',
    playerId: player.id,
    skillLevel: PLAYER_SKILL_LEVELS.includes(player.skillLevel) ? player.skillLevel : '',
  };
}

function StandingsSummary({ games }) {
  const standings = useMemo(() => buildStandingsSummary(games), [games]);

  return (
    <>
      {standings.completedGames.length > 0 ? (
        <div className="detail-grid">
          <div className="detail-card">
            <span>Overall record</span>
            <strong>{formatRecord(standings.wins, standings.losses, standings.ties)}</strong>
          </div>
          <div className="detail-card">
            <span>Win %</span>
            <strong>{standings.winPct}</strong>
          </div>
          <div className="detail-card">
            <span>Completed matchups</span>
            <strong>{standings.completedGames.length}</strong>
          </div>
        </div>
      ) : (
        <p>No completed matchups yet. Standings will populate after results are entered.</p>
      )}

      {standings.opponents.length > 0 ? (
        <div className="entity-list">
          {standings.opponents.map((row) => (
            <div key={row.opponent} className="entity-card entity-card--column">
              <strong>{row.opponent}</strong>
              <span>{formatRecord(row.wins, row.losses, row.ties)}</span>
              <span>
                PF {row.pointsFor} · PA {row.pointsAgainst}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </>
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

export function TeamMembersPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [members, setMembers] = useState([]);
  const [games, setGames] = useState([]);
  const [membership, setMembership] = useState(null);
  const [error, setError] = useState('');

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

      if (linkedMember?.id) {
        representedMemberIds.add(linkedMember.id);
      }

      return {
        id: player.id,
        active: player.active !== false,
        fullName: player.fullName || 'Unnamed player',
        gamesPlayedCount: countGamesPlayed(games, player.id),
        initials: buildPlayerInitials(player.fullName || 'Unnamed player'),
        isPendingLink: false,
        role: linkedMember?.role ?? '',
        subtitle:
          linkedMember?.role && linkedMember.role !== 'member'
            ? formatRoleLabel(linkedMember.role)
            : player.uid
              ? 'Linked account'
              : '',
        availableCount: countAvailableGames(games, player.id),
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
        initials: buildPlayerInitials(
          member.uid === user?.uid ? user?.displayName || 'You' : 'Pending roster link',
        ),
        isPendingLink: true,
        role: member.role,
        subtitle: member.role && member.role !== 'member' ? formatRoleLabel(member.role) : 'Account member only',
        availableCount: 0,
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

  return (
    <div className="page-grid team-members-page">
      <section className="card team-members-card">
        <div className="team-members-card__header">
          <div className="team-members-card__header-copy">
            <p className="eyebrow">Current roster</p>
            <h1>{teamTitle}</h1>
            <p className="team-members-card__copy">
              Meet the {team?.name ?? 'team'} players who make up the team this season.
            </p>
          </div>
          <div className="team-members-card__count">{rosterPlayerCount} Members</div>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {teamCards.length > 0 ? (
          <div className="team-members-grid">
            {teamCards.map((entry) => (
              <article key={entry.id} className="team-member-card">
                <div className="team-member-card__top">
                  <div className="team-member-card__avatar">{entry.initials}</div>
                  <span
                    className={`status-badge ${entry.active ? 'status-badge--active' : 'status-badge--inactive'}`}
                  >
                    {entry.active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>

                <div className="team-member-card__body">
                  <strong className="team-member-card__name">{entry.fullName}</strong>
                  {entry.subtitle ? (
                    <span className="team-member-card__subtitle">
                      {entry.subtitle}
                      {entry.isPendingLink ? ' · waiting for roster link' : ''}
                    </span>
                  ) : null}
                </div>

                <div className="team-member-card__stats">
                  <span>Available: {entry.availableCount}</span>
                  <span>Games Played: {entry.gamesPlayedCount}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No players are on the team yet.</p>
        )}
      </section>
    </div>
  );
}

export function RosterPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [updatingPlayerId, setUpdatingPlayerId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editForm, setEditForm] = useState(createEmptyRosterForm());

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
    loadRosterData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load the roster yet.');
    });
  }, [clubSlug, teamSlug, user?.uid]);

  useEffect(() => {
    if (selectedPlayer) {
      setEditForm(createRosterFormFromPlayer(selectedPlayer));
    } else {
      setEditForm(createEmptyRosterForm());
    }
  }, [selectedPlayer]);

  function moveSelection(direction) {
    if (!players.length) {
      return;
    }

    const nextIndex = Math.min(Math.max(selectedPlayerIndex + direction, 0), players.length - 1);
    setSelectedPlayerId(players[nextIndex]?.id ?? '');
    setError('');
    setMessage('');
  }

  function resetSelectedPlayer() {
    if (!selectedPlayer) {
      return;
    }

    setError('');
    setMessage('');
    setEditForm(createRosterFormFromPlayer(selectedPlayer));
  }

  async function handleEditSubmit(event) {
    event.preventDefault();

    if (!selectedPlayer) {
      return;
    }

    setEditSaving(true);
    setError('');
    setMessage('');

    try {
      await savePlayer({
        ...editForm,
        clubSlug,
        teamSlug,
        user,
      });
      setMessage('Player changes saved.');
      await loadRosterData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save that player.');
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActiveStatus(player) {
    if (!player) {
      return;
    }

    setUpdatingPlayerId(player.id);
    setError('');
    setMessage('');

    try {
      await savePlayer({
        active: !player.active,
        clubSlug,
        dupr: typeof player.dupr === 'number' ? String(player.dupr) : '',
        firstName: player.firstName ?? '',
        lastName: player.lastName ?? '',
        playerId: player.id,
        skillLevel: PLAYER_SKILL_LEVELS.includes(player.skillLevel) ? player.skillLevel : '',
        teamSlug,
        user,
      });
      if (selectedPlayerId === player.id) {
        setEditForm((current) => ({ ...current, active: !player.active }));
      }
      setMessage(player.active ? 'Player deactivated.' : 'Player reactivated.');
      await loadRosterData();
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to update that player right now.');
    } finally {
      setUpdatingPlayerId('');
    }
  }

  return (
    <div className="page-grid schedule-admin-page">
      <section className="card">
        <p className="eyebrow">Player Mgmt</p>
        <h1>Manage players</h1>
        <p>
          Captains and co-captains manage player profile details here. New players join the team
          with the team join code.
        </p>

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
                  <p>
                    {selectedPlayer
                        ? "Update a player's profile details or remove them from the active list."
                        : 'Share the team join code to add the first player.'}
                  </p>
                </div>
                {selectedPlayer ? (
                  <span
                    className={`status-badge ${selectedPlayer.active ? 'status-badge--active' : 'status-badge--inactive'}`}
                  >
                    {selectedPlayer.active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                ) : null}
              </div>

              {selectedPlayer ? (
                <form className="schedule-admin-form" onSubmit={handleEditSubmit}>
                  <label className="field">
                    <span>First name</span>
                    <input
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, firstName: event.target.value }))
                      }
                      value={editForm.firstName}
                    />
                  </label>
                  <label className="field">
                    <span>Last name</span>
                    <input
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, lastName: event.target.value }))
                      }
                      value={editForm.lastName}
                    />
                  </label>
                  <label className="field">
                    <span>DUPR</span>
                    <input
                      onChange={(event) => setEditForm((current) => ({ ...current, dupr: event.target.value }))}
                      placeholder="x.xxx"
                      value={editForm.dupr}
                    />
                  </label>
                  <label className="field">
                    <span>Skill level</span>
                    <select
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, skillLevel: event.target.value }))
                      }
                      value={editForm.skillLevel}
                    >
                      <option value="">Not set</option>
                      {PLAYER_SKILL_LEVELS.map((skillLevel) => (
                        <option key={skillLevel} value={skillLevel}>
                          {skillLevel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="player-admin-form__primary-actions">
                    <button className="button button--ghost" onClick={resetSelectedPlayer} type="button">
                      Reset
                    </button>
                    <button className="button" disabled={editSaving} type="submit">
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <div className="player-admin-form__secondary-actions">
                    <button
                      className={`button ${selectedPlayer.active ? 'button--danger' : 'button--ghost'}`}
                      disabled={updatingPlayerId === selectedPlayer.id}
                      onClick={() => toggleActiveStatus(selectedPlayer)}
                      type="button"
                    >
                      {updatingPlayerId === selectedPlayer.id
                          ? 'Saving...'
                          : selectedPlayer.active
                            ? 'Deactivate'
                            : 'Reactivate'}
                    </button>
                  </div>
                </form>
              ) : (
                <p>No players have joined yet.</p>
              )}
            </section>
          </>
        ) : (
          <div className="notice notice--info">
            Captains and co-captains can edit player profiles. Your current role is{' '}
            <strong>{membership?.role ?? 'member'}</strong>.
          </div>
        )}
      </section>
    </div>
  );
}

export function SchedulePage() {
  const { clubSlug, teamSlug } = useParams();
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [error, setError] = useState('');

  async function loadScheduleData() {
    const [gameData, playerData] = await Promise.all([
      listGames(clubSlug, teamSlug),
      listPlayers(clubSlug, teamSlug),
    ]);

    setGames(gameData);
    setPlayers(playerData);
  }

  useEffect(() => {
    loadScheduleData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load matchups yet.');
    });
  }, [clubSlug, teamSlug]);

  const activePlayers = useMemo(() => players.filter((player) => player.active), [players]);
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

  return (
    <div className="page-grid schedule-page">
      <section className="card">
        <div className="schedule-page__header">
          <div className="schedule-page__header-copy">
            <p className="eyebrow">Main page</p>
            <h1>Schedule</h1>
            <p className="schedule-page__copy">
              See upcoming matches at a glance so you always know when and where the team is playing.
            </p>
          </div>
        </div>

        {error ? <div className="notice notice--error">{error}</div> : null}

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

              return (
                <article key={game.id} className="schedule-match-card">
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
                  <div className="schedule-match-card__stats">
                    <span>On Roster: {game.rosterPlayerIds.length}</span>
                    <span>Available: {availabilitySummary.in}</span>
                  </div>
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
  const [gameDrafts, setGameDrafts] = useState({});
  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingGameId, setUpdatingGameId] = useState('');
  const [selectedGameId, setSelectedGameId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(createEmptyScheduleAdminForm());
  const [teamPrimaryLocation, setTeamPrimaryLocation] = useState('Blackhawk Country Club');

  const canManage = canManageRole(membership?.role);
  const todayDateKey = useMemo(() => getTodayDateKey(), []);

  async function loadScheduleData() {
    const [gameData, membershipData, teamData] = await Promise.all([
      listGames(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
      getTeam(clubSlug, teamSlug),
    ]);
    const nextPrimaryLocation = teamData?.primaryLocation || 'Blackhawk Country Club';

    setGames(gameData);
    setGameDrafts(buildScheduleAdminDrafts(gameData));
    setMembership(membershipData);
    setTeamPrimaryLocation(nextPrimaryLocation);
    setForm((current) =>
      current.location === 'Blackhawk Country Club'
        ? createEmptyScheduleAdminForm(nextPrimaryLocation)
        : current,
    );
    setSelectedGameId((current) => {
      if (current && gameData.some((game) => game.id === current)) {
        return current;
      }

      return gameData[findFirstUpcomingGameIndex(gameData, todayDateKey)]?.id ?? '';
    });
  }

  useEffect(() => {
    loadScheduleData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load matchups yet.');
    });
  }, [clubSlug, teamSlug, todayDateKey, user?.uid]);

  const selectedGameIndex = Math.max(
    0,
    games.findIndex((game) => game.id === selectedGameId),
  );
  const activeGame = games[selectedGameIndex] ?? null;
  const activeDraft = activeGame
    ? gameDrafts[activeGame.id] ?? createScheduleAdminDraft(activeGame)
    : null;

  function updateActiveDraft(updater) {
    if (!activeGame) {
      return;
    }

    setGameDrafts((current) => ({
      ...current,
      [activeGame.id]: updater(current[activeGame.id] ?? createScheduleAdminDraft(activeGame)),
    }));
  }

  function moveSelection(direction) {
    if (!games.length) {
      return;
    }

    const nextIndex = Math.min(Math.max(selectedGameIndex + direction, 0), games.length - 1);
    setSelectedGameId(games[nextIndex]?.id ?? '');
    setError('');
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await saveGame({
        ...form,
        clubSlug,
        teamSlug,
        user,
      });
      setForm(createEmptyScheduleAdminForm(teamPrimaryLocation));
      setMessage('Matchup added to the schedule.');
      await loadScheduleData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save that matchup.');
    } finally {
      setSaving(false);
    }
  }

  async function handleGameSave() {
    if (!activeGame || !activeDraft) {
      return;
    }

    setUpdatingGameId(activeGame.id);
    setError('');
    setMessage('');

    try {
      await saveGame({
        clubSlug,
        dateTbd: activeDraft.dateTbd,
        gameId: activeGame.id,
        isoDate: activeDraft.isoDate,
        location: activeDraft.location,
        matchStatus: activeDraft.matchStatus,
        opponent: activeDraft.opponent,
        opponentScore: activeDraft.opponentScore,
        teamScore: activeDraft.teamScore,
        teamSlug,
        timeLabel: activeDraft.timeLabel,
        user,
      });
      setMessage('Matchup updated.');
      await loadScheduleData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to update that matchup.');
    } finally {
      setUpdatingGameId('');
    }
  }

  function resetActiveDraft() {
    if (!activeGame) {
      return;
    }

    setGameDrafts((current) => ({
      ...current,
      [activeGame.id]: createScheduleAdminDraft(activeGame),
    }));
    setError('');
    setMessage('');
  }

  async function handleDeleteGame() {
    if (!activeGame) {
      return;
    }

    setDeleting(true);
    setError('');
    setMessage('');

    try {
      await deleteGame({
        clubSlug,
        gameId: activeGame.id,
        teamSlug,
      });
      setMessage('Matchup deleted.');
      await loadScheduleData();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Unable to delete that matchup.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page-grid schedule-admin-page">
      <section className="card">
        <p className="eyebrow">Schedule + Scores</p>
        <h1>Manage matchups</h1>
        <p>
          Captains and co-captains create the schedule here, then record final scores for standings.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {!canManage ? (
          <div className="notice notice--info">
            Captains and co-captains manage the schedule. Your current role is{' '}
            <strong>{membership?.role ?? 'member'}</strong>.
          </div>
        ) : games.length > 0 ? (
          <>
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

            <div className="schedule-admin-layout">
              <section className="schedule-admin-card">
                <div className="schedule-admin-card__header">
                  <div>
                    <h2>{activeGame?.opponent || 'Matchup'}</h2>
                    <p>
                      {activeGame?.dateTbd
                        ? 'Date and time TBD'
                        : `${activeGame?.isoDate || 'Date TBD'} · ${activeGame?.location || 'Location TBD'}`}
                    </p>
                  </div>
                  {activeDraft?.timeLabel ? (
                    <span className="game-roster-board__badge">{activeDraft.timeLabel}</span>
                  ) : null}
                </div>

                {activeDraft ? (
                  <form
                    className="schedule-admin-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleGameSave();
                    }}
                  >
                    <label className="field">
                      <span>Game date</span>
                      <input
                        disabled={activeDraft.dateTbd}
                        onChange={(event) =>
                          updateActiveDraft((current) => ({ ...current, isoDate: event.target.value }))
                        }
                        type="date"
                        value={activeDraft.isoDate}
                      />
                    </label>
                    <label className="field">
                      <span>Start time (Pacific)</span>
                      <input
                        disabled={activeDraft.dateTbd}
                        onChange={(event) =>
                          updateActiveDraft((current) => ({ ...current, timeLabel: event.target.value }))
                        }
                        placeholder="12:00 PM"
                        value={activeDraft.timeLabel}
                      />
                    </label>
                    <label className="checkbox-field schedule-admin-form__tbd">
                      <input
                        checked={activeDraft.dateTbd}
                        onChange={(event) =>
                          updateActiveDraft((current) => ({
                            ...current,
                            dateTbd: event.target.checked,
                            isoDate: event.target.checked ? '' : current.isoDate,
                            timeLabel: event.target.checked ? '' : current.timeLabel,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>Date and time TBD</span>
                    </label>
                    <label className="field">
                      <span>Location</span>
                      <input
                        onChange={(event) =>
                          updateActiveDraft((current) => ({ ...current, location: event.target.value }))
                        }
                        value={activeDraft.location}
                      />
                    </label>
                    <label className="field">
                      <span>Match label</span>
                      <input
                        onChange={(event) =>
                          updateActiveDraft((current) => ({ ...current, opponent: event.target.value }))
                        }
                        value={activeDraft.opponent}
                      />
                    </label>
                    <label className="field">
                      <span>Match status</span>
                      <select
                        onChange={(event) =>
                          updateActiveDraft((current) => ({ ...current, matchStatus: event.target.value }))
                        }
                        value={activeDraft.matchStatus}
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                      </select>
                    </label>
                    <div className="schedule-admin-form__score-grid">
                      <label className="field">
                        <span>Hawk&apos;n&apos;Roll score</span>
                        <input
                          inputMode="numeric"
                          onChange={(event) =>
                            updateActiveDraft((current) => ({ ...current, teamScore: event.target.value }))
                          }
                          value={activeDraft.teamScore}
                        />
                      </label>
                      <label className="field">
                        <span>Opponent score</span>
                        <input
                          inputMode="numeric"
                          onChange={(event) =>
                            updateActiveDraft((current) => ({ ...current, opponentScore: event.target.value }))
                          }
                          value={activeDraft.opponentScore}
                        />
                      </label>
                    </div>
                    <div className="schedule-admin-form__actions">
                      <button className="button button--ghost" onClick={resetActiveDraft} type="button">
                        Reset
                      </button>
                      <button className="button" disabled={updatingGameId === activeGame.id} type="submit">
                        {updatingGameId === activeGame.id ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        className="button button--danger"
                        disabled={deleting}
                        onClick={handleDeleteGame}
                        type="button"
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>

              <section className="schedule-admin-card">
                <div className="schedule-admin-card__header">
                  <div>
                    <h2>Create matchup</h2>
                    <p>Add a new matchup to the live team schedule.</p>
                  </div>
                </div>

                <form className="schedule-admin-form" onSubmit={handleSubmit}>
                  <label className="field">
                    <span>Game date</span>
                    <input
                      disabled={form.dateTbd}
                      onChange={(event) => setForm((current) => ({ ...current, isoDate: event.target.value }))}
                      type="date"
                      value={form.isoDate}
                    />
                  </label>
                  <label className="field">
                    <span>Start time (Pacific)</span>
                    <input
                      disabled={form.dateTbd}
                      onChange={(event) => setForm((current) => ({ ...current, timeLabel: event.target.value }))}
                      placeholder="12:00 PM"
                      value={form.timeLabel}
                    />
                  </label>
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
                    <span>Date and time TBD</span>
                  </label>
                  <label className="field">
                    <span>Location</span>
                    <input
                      onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                      value={form.location}
                    />
                  </label>
                  <label className="field">
                    <span>Match label</span>
                    <input
                      onChange={(event) => setForm((current) => ({ ...current, opponent: event.target.value }))}
                      placeholder="New matchup"
                      value={form.opponent}
                    />
                  </label>
                  <label className="field">
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
                      <span>Hawk&apos;n&apos;Roll score</span>
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
                  <div className="schedule-admin-form__actions">
                    <button className="button" disabled={saving} type="submit">
                      {saving ? 'Creating matchup...' : 'Create matchup'}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </>
        ) : canManage ? (
          <section className="schedule-admin-card">
            <div className="schedule-admin-card__header">
              <div>
                <h2>Create matchup</h2>
                <p>Add a new matchup to the live team schedule.</p>
              </div>
            </div>

            <form className="schedule-admin-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Game date</span>
                <input
                  disabled={form.dateTbd}
                  onChange={(event) => setForm((current) => ({ ...current, isoDate: event.target.value }))}
                  type="date"
                  value={form.isoDate}
                />
              </label>
              <label className="field">
                <span>Start time (Pacific)</span>
                <input
                  disabled={form.dateTbd}
                  onChange={(event) => setForm((current) => ({ ...current, timeLabel: event.target.value }))}
                  placeholder="12:00 PM"
                  value={form.timeLabel}
                />
              </label>
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
                <span>Date and time TBD</span>
              </label>
              <label className="field">
                <span>Location</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                  value={form.location}
                />
              </label>
              <label className="field">
                <span>Match label</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, opponent: event.target.value }))}
                  placeholder="New matchup"
                  value={form.opponent}
                />
              </label>
              <label className="field">
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
                  <span>Hawk&apos;n&apos;Roll score</span>
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
              <div className="schedule-admin-form__actions">
                <button className="button" disabled={saving} type="submit">
                  {saving ? 'Creating matchup...' : 'Create matchup'}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <p>No matchups saved yet.</p>
        )}
      </section>
    </div>
  );
}

export function StandingsPage() {
  const { clubSlug, teamSlug } = useParams();
  const [games, setGames] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    listGames(clubSlug, teamSlug)
      .then((gameData) => {
        setGames(gameData);
      })
      .catch((loadError) => {
        setError(loadError.message ?? 'Unable to load standings yet.');
      });
  }, [clubSlug, teamSlug]);

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">Standings</p>
        <h1>Team results</h1>
        <p>
          Standings are derived directly from completed schedule entries, so the schedule and record
          always stay in sync.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        <StandingsSummary games={games} />
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
              See the saved pairings for each matchup and compare the DUPR weight of every team.
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

            <div className="game-roster-board__pairs">
              {rosterPairings.map((pairing) => (
                <section key={pairing.courtLabel} className="game-roster-pair-card">
                  <div className="game-roster-pair-card__header">
                    <div className="game-roster-pair-card__title-row">
                      <strong>{pairing.courtLabel}</strong>
                      <span>Team DUPR: {formatDupr(pairing.teamDupr)}</span>
                    </div>
                    <span className="game-roster-pair-card__count">{pairing.filledSlots}/2</span>
                  </div>

                  <div className="game-roster-pair-card__players">
                    {pairing.players.length > 0 ? (
                      pairing.players.map((player) => (
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
                          <span className="game-roster-player-card__dupr">
                            DUPR {formatDupr(player.dupr)}
                          </span>
                        </article>
                      ))
                    ) : (
                      <p className="sidebar__empty">No players assigned yet.</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
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

  async function loadPairingsData() {
    const [gameData, playerData, membershipData] = await Promise.all([
      listGames(clubSlug, teamSlug),
      listPlayers(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setGames(gameData);
    setPlayers(playerData);
    setMembership(membershipData);
    setPairingDrafts(buildPairingDrafts(gameData));
    setSelectedGameId((current) => {
      if (current && gameData.some((game) => game.id === current)) {
        return current;
      }

      return gameData[0]?.id ?? '';
    });
  }

  useEffect(() => {
    loadPairingsData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load matchup pairings yet.');
    });
  }, [clubSlug, teamSlug, user?.uid]);

  const activeGame = games.find((game) => game.id === selectedGameId) ?? games[0] ?? null;
  const activeDraft = activeGame
    ? pairingDrafts[activeGame.id] ?? createPairingDraft(activeGame)
    : null;
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
    updateDraft((draft) => {
      const exists = draft.rosterPlayerIds.includes(playerId);

      if (!exists && draft.rosterPlayerIds.length >= 8) {
        setError('Choose up to eight players for matchup pairings.');
        return draft;
      }

      const rosterPlayerIds = exists
        ? draft.rosterPlayerIds.filter((id) => id !== playerId)
        : [...draft.rosterPlayerIds, playerId];
      const selectedIds = new Set(rosterPlayerIds);
      let pairings = draft.pairings.map((pairing) => ({
        ...pairing,
        playerIds: pairing.playerIds.filter((id) => selectedIds.has(id)),
      }));

      if (!exists) {
        pairings = assignPlayerToNextOpenPairingSlot(pairings, playerId);
      }

      setError('');
      return {
        ...draft,
        pairings,
        rosterPlayerIds,
      };
    });
  }

  function updatePairingSlot(pairIndex, slotIndex, playerId) {
    updateDraft((draft) => {
      const nextPairings = draft.pairings.map((pairing) => ({
        ...pairing,
        playerIds: [...pairing.playerIds],
      }));

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

      return {
        ...draft,
        pairings: nextPairings,
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
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">Roster Mgmt</p>
        <h1>Matchup pairings</h1>
        <p>
          Captains and co-captains choose up to eight roster players for each matchup, then assign
          them into court slots for the saved game roster.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {games.length > 0 ? (
          <div className="choice-row">
            {games.map((game) => (
              <button
                key={game.id}
                className={`choice-button ${game.id === activeGame?.id ? 'choice-button--active' : ''}`}
                onClick={() => {
                  setSelectedGameId(game.id);
                  setError('');
                  setMessage('');
                }}
                type="button"
              >
                {formatMatchupLabel(game)}
              </button>
            ))}
          </div>
        ) : (
          <p>No matchups are available for pairings yet.</p>
        )}
      </section>

      {activeGame ? (
        <>
          <section className="card">
            <p className="eyebrow">Selected matchup</p>
            <div className="detail-grid">
              <div className="detail-card">
                <span>Opponent</span>
                <strong>{activeGame.opponent || 'Opponent TBD'}</strong>
              </div>
              <div className="detail-card">
                <span>Date</span>
                <strong>{activeGame.isoDate || activeGame.dateLabel || 'Date TBD'}</strong>
              </div>
              <div className="detail-card">
                <span>Location</span>
                <strong>{activeGame.location || 'Location TBD'}</strong>
              </div>
              <div className="detail-card">
                <span>Available responses</span>
                <strong>
                  {Object.values(activeGame.attendance ?? {}).filter((status) => status === 'in').length} in
                </strong>
              </div>
            </div>
          </section>

          <section className="card">
            <p className="eyebrow">Roster pool</p>
            {canManage ? (
              <>
                <p>
                  Select up to eight active players for this matchup. Clicking a player adds them to
                  the pool and auto-fills the next open court slot. Availability is shown as a guide.
                </p>
                <div className="pairing-pool">
                  {activePlayers.map((player) => {
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
                        <strong>{player.fullName || 'Unnamed player'}</strong>
                        <span>
                          {attendanceStatus}
                          {player.skillLevel ? ` · ${player.skillLevel}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p>Selected players for this matchup.</p>
                {pairingSummary.selectedPlayers.length > 0 ? (
                  <div className="pairing-pool">
                    {pairingSummary.selectedPlayers.map((player) => (
                      <div key={player.id} className="pairing-chip pairing-chip--readonly">
                        <strong>{player.fullName || 'Unnamed player'}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No roster pool has been selected yet.</p>
                )}
              </>
            )}
          </section>

          <section className="card">
            <p className="eyebrow">Court assignments</p>
            <div className="pairing-grid">
              {pairingSummary.pairings.map((pairing, pairIndex) => {
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
                            (activeDraft?.pairings ?? [])
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
                                {(activeDraft?.rosterPlayerIds ?? []).map((playerId) => {
                                  const player = players.find((entry) => entry.id === playerId);
                                  const disabled =
                                    currentValue !== playerId && selectedElsewhere.has(playerId);

                                  return (
                                    <option key={playerId} disabled={disabled} value={playerId}>
                                      {player?.fullName || playerId}
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
                        {pairing.players.length > 0 ? (
                          pairing.players.map((player) => (
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
              <div className="pairing-actions">
                <button className="button" disabled={saving} onClick={handleSavePairings} type="button">
                  {saving ? 'Saving pairings...' : 'Save pairings'}
                </button>
                <span className="sidebar__empty">
                  Selected: {activeDraft?.rosterPlayerIds.length ?? 0} / 8 players
                </span>
              </div>
            ) : (
              <div className="notice notice--info">
                Captains and co-captains can edit pairings. Your current role is{' '}
                <strong>{membership?.role ?? 'member'}</strong>.
              </div>
            )}
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
    loadAvailabilityData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load availability yet.');
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

        {!membership?.playerId ? (
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

function NewsFeed({ deletingId = '', newsPosts, onDelete, onEdit, showManageActions = false }) {
  if (!newsPosts.length) {
    return <p>No news posts published yet.</p>;
  }

  return (
    <div className="news-feed">
      {newsPosts.map((post) => (
        <article key={post.id} className="news-feed-card">
          <div className="news-feed-card__header">
            <div>
              <p className="news-feed-card__meta">{buildNewsPostMeta(post)}</p>
              <h2 className="news-feed-card__title">{post.title}</h2>
            </div>
            <span className="news-feed-card__badge">{post.imageUrl ? 'Photo' : 'Post'}</span>
          </div>

          {post.imageUrl ? (
            <div className="news-feed-card__image-wrap">
              <img alt={post.title} className="news-feed-card__image" src={post.imageUrl} />
            </div>
          ) : null}

          <div className="news-feed-card__body">
            <p className="news-feed-card__text">{post.body}</p>
            <p className="news-feed-card__date">{formatNewsPostDate(post)}</p>
          </div>

          <div className="news-feed-card__actions">
            {post.imageUrl ? (
              <button
                className="news-feed-card__action"
                onClick={() => downloadNewsImage(post)}
                type="button"
              >
                Download image
              </button>
            ) : null}
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
            {showManageActions ? (
              <div className="choice-row news-feed-card__manage">
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
            ) : null}
          </div>
        </article>
      ))}
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
  const [newsPosts, setNewsPosts] = useState([]);
  const [membership, setMembership] = useState(null);
  const [error, setError] = useState('');

  async function loadNewsData() {
    const [posts, membershipData] = await Promise.all([
      listNewsPosts(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setNewsPosts(posts);
    setMembership(membershipData);
  }

  useEffect(() => {
    loadNewsData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load team news yet.');
    });
  }, [clubSlug, teamSlug, user?.uid]);

  return (
    <div className="page-grid news-page">
      <section className="card">
        <NewsFeedIntro
          copy="Catch the latest team updates, announcements, photos, and links from Hawk'n'Roll."
          title="News"
        />

        {error ? <div className="notice notice--error">{error}</div> : null}

        <NewsFeed newsPosts={newsPosts} />
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
    loadNewsData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load the newsroom yet.');
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
        ) : (
          <div className="notice notice--info">
            Captains and co-captains can publish or edit team news. Your current role is{' '}
            <strong>{membership?.role ?? 'member'}</strong>.
          </div>
        )}
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
                  onChange={(event) =>
                    setForm((current) => ({ ...current, imageFile: event.target.files?.[0] ?? null }))
                  }
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
  const [cropFileName, setCropFileName] = useState('team-logo.png');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState(null);

  const canManage = canManageRole(membership?.role);
  const canManageMembership = isCaptainRole(membership?.role);
  const clubOptions = clubs.filter((club) => club.slug !== 'independent');
  const playerMap = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const displayedLogoUrl = logoPreviewUrl || team?.logoUrl || defaultTeamLogo;

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
    setCropFileName('team-logo.png');
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
    setForm(createEmptyTeamSettingsForm(teamData?.name ?? '', teamData?.primaryLocation ?? ''));
    setRequestedClubSlug(
      teamData?.requestedClubSlug || teamData?.approvedClubSlug || clubData[0]?.slug || '',
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
      setCropFileName(file.name || 'team-logo.png');
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
      const croppedFile = await createCroppedLogoFile(cropImageSrc, cropPixels, cropFileName);
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
        primaryLocation: form.primaryLocation,
        teamName: form.teamName,
        teamSlug,
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

    const inviteLink = `${window.location.origin}${window.location.pathname}#/join?code=${encodeURIComponent(team.joinCode)}`;

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

  return (
    <div className="page-grid schedule-admin-page settings-admin-page">
      <section className="card">
        <p className="eyebrow">Team Settings</p>
        <h1>Team Settings</h1>
        <p>
          Manage team branding, join code settings, and member roles from one shared admin workspace.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        <div className="settings-admin-overview">
          <div className="detail-grid">
            <div className="detail-card settings-admin-join-card">
              <span>Current join code</span>
              <strong>{team?.joinCode ?? 'Not available yet'}</strong>
              {canManage ? (
                <div className="settings-admin-join-actions">
                  <button
                    className="button button--ghost settings-admin-join-action"
                    disabled={!team?.joinCode}
                    onClick={handleCopyInviteLink}
                    type="button"
                  >
                    Copy invite link
                  </button>
                  <button
                    className="button button--ghost settings-admin-join-action"
                    disabled={rotating}
                    onClick={handleRotateJoinCode}
                    type="button"
                  >
                    {rotating ? 'Rotating code...' : 'Rotate join code'}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="detail-card">
              <span>Members</span>
              <strong>{members.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="schedule-admin-layout settings-admin-layout">
        <section className="schedule-admin-card">
          <div className="schedule-admin-card__header">
            <div>
              <p className="eyebrow">Branding</p>
              <h2>Team profile</h2>
              <p>Update the team name and crop a logo before upload.</p>
            </div>
          </div>

          {canManage ? (
            <form className="schedule-admin-form settings-admin-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Team name</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, teamName: event.target.value }))}
                  value={form.teamName}
                />
              </label>
              <label className="field">
                <span>Primary location</span>
                <input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, primaryLocation: event.target.value }))
                  }
                  placeholder="Optional, e.g. Blackhawk Country Club"
                  value={form.primaryLocation}
                />
              </label>
              <div className="settings-admin-branding-preview">
                <div>
                  <p className="eyebrow">Current logo</p>
                  <img
                    alt={`${team?.name ?? 'Team'} logo`}
                    className="settings-admin-logo-preview"
                    src={displayedLogoUrl}
                  />
                </div>
              </div>
              <div className="field settings-admin-form__logo-field">
                <span>Team logo</span>
                <div className="settings-admin-form__logo-actions">
                  <label className="button button--ghost settings-admin-form__file-button">
                    <input accept="image/*" className="settings-admin-form__file-input" onChange={handleLogoSelection} type="file" />
                    Choose logo image
                  </label>
                  <button className="button" disabled={saving} type="submit">
                    {saving ? 'Saving settings...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            </form>
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
              <h2>Join a club network</h2>
              <p>Request approval so this team can appear with other teams in a club.</p>
            </div>
          </div>

          <div className="detail-card">
            <span>Current status</span>
            <strong>
              {team?.affiliationStatus === 'approved'
                ? 'Approved'
                : team?.affiliationStatus === 'pending'
                  ? 'Pending approval'
                  : team?.affiliationStatus === 'rejected'
                    ? 'Rejected'
                    : 'Independent'}
            </strong>
            <span>
              {team?.approvedClubSlug
                ? `Approved for ${team.approvedClubSlug}`
                : team?.requestedClubSlug
                  ? `Requested ${team.requestedClubSlug}`
                  : 'Not affiliated with a club yet.'}
            </span>
          </div>

          {team?.affiliationStatus === 'approved' ? (
            <div className="detail-card">
              <span>Challenge-ready club teams</span>
              <strong>{approvedClubTeams.length}</strong>
              <span>
                {approvedClubTeams.length
                  ? approvedClubTeams.map((clubTeam) => clubTeam.name).join(', ')
                  : 'No other approved teams are in this club yet.'}
              </span>
            </div>
          ) : null}

          {canManage ? (
            <div className="schedule-admin-form settings-admin-form">
              <label className="field">
                <span>Request club</span>
                <select
                  disabled={team?.affiliationStatus === 'pending'}
                  onChange={(event) => setRequestedClubSlug(event.target.value)}
                  value={requestedClubSlug}
                >
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
                {requestingAffiliation ? 'Submitting request...' : 'Request affiliation'}
              </button>
              {team?.affiliationStatus === 'pending' ? (
                <div className="notice notice--info">
                  This team already has a pending club affiliation request.
                </div>
              ) : null}
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
                  <div key={memberRecord.uid} className="entity-card entity-card--column">
                    <div className="member-admin__header">
                      <div>
                        <strong>{displayName}</strong>
                        <span>{secondary}</span>
                      </div>
                      <span className="status-badge">{formatRoleLabel(memberRecord.role)}</span>
                    </div>

                    {canEdit ? (
                      <div className="choice-row">
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
                      <span>
                        {memberRecord.role === 'captain'
                          ? 'Captain role changes are not enabled yet.'
                          : canManageMembership
                            ? 'You cannot change your own role here.'
                            : 'Only the captain can change team roles right now.'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p>No team members found yet.</p>
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
  const { signOutUser, user } = useAuth();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState([]);
  const [clubName, setClubName] = useState('');
  const [clubDrafts, setClubDrafts] = useState({});
  const [requests, setRequests] = useState([]);
  const [adminTeams, setAdminTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingClub, setCreatingClub] = useState(false);
  const [updatingClubSlug, setUpdatingClubSlug] = useState('');
  const [updatingRequestId, setUpdatingRequestId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [adminSection, setAdminSection] = useState('teams');
  const isBootstrapSuperAdmin = user?.email?.toLowerCase() === 'demandgendave@gmail.com';

  async function loadAdminData() {
    if (!user?.uid) {
      setClubs([]);
      setRequests([]);
      setAdminTeams([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [clubData, requestData, teamData] = await Promise.all([
        listClubs(),
        listClubAffiliationRequests(user),
        listAdminTeamSummaries(user),
      ]);

      setClubs(clubData);
      setClubDrafts(
        clubData.reduce((drafts, club) => {
          drafts[club.slug] = club.name;
          return drafts;
        }, {}),
      );
      setRequests(requestData);
      setAdminTeams(teamData);
    } catch (loadError) {
      setError(loadError.message ?? 'Unable to load admin data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, [user?.uid]);

  async function handleCreateClub(event) {
    event.preventDefault();
    setCreatingClub(true);
    setError('');
    setMessage('');

    try {
      const club = await createClub({ clubName, user });
      setClubName('');
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
        clubName: clubDrafts[club.slug] ?? club.name,
        clubSlug: club.slug,
        user,
      });
      setMessage(`${clubDrafts[club.slug] ?? club.name} renamed.`);
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

  async function handleSignOut() {
    await signOutUser();
    navigate('/', { replace: true });
  }

  return (
    <div className="auth-page admin-page">
      <aside className="admin-sidebar card">
        <p className="eyebrow">PKL Universe</p>
        <h2>App Admin</h2>
        <p className="admin-sidebar__copy">
          Signed in as <strong>{user?.email ?? user?.displayName ?? 'Unknown user'}</strong>
        </p>
        <span className="status-badge">
          {isBootstrapSuperAdmin ? 'Bootstrap super admin' : 'Admin access checked by Firebase'}
        </span>
        <nav className="sidebar__nav">
          <div className="sidebar__nav-group">
            <button
              className={`nav-link admin-nav-button ${adminSection === 'teams' ? 'nav-link--active' : ''}`}
              onClick={() => setAdminSection('teams')}
              type="button"
            >
              Teams
            </button>
            <button
              className={`nav-link admin-nav-button ${adminSection === 'clubs' ? 'nav-link--active' : ''}`}
              onClick={() => setAdminSection('clubs')}
              type="button"
            >
              Clubs
            </button>
          </div>
        </nav>
        <div className="sidebar__footer-actions">
          <Link className="sidebar__footer-link" to="/teams">
            My Teams
          </Link>
          <Link className="sidebar__footer-link" to="/">
            Home
          </Link>
          <button className="sidebar__signout" onClick={handleSignOut} type="button">
            Sign out
          </button>
        </div>
      </aside>

      <section className="card auth-card">
        <p className="eyebrow">App admin</p>
        <h1>{adminSection === 'teams' ? 'Teams' : 'Clubs'}</h1>
        <p>
          {adminSection === 'teams'
            ? 'Review each team, its club affiliation, captains, and member count.'
            : 'Create clubs, manage club names, and review teams requesting club affiliation.'}
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
                  <article
                    key={`${teamSummary.clubSlug}-${teamSummary.teamSlug}`}
                    className="entity-card entity-card--column"
                  >
                    <div className="member-admin__header">
                      <div>
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
                    {teamSummary.primaryLocation ? (
                      <span>Primary location: {teamSummary.primaryLocation}</span>
                    ) : null}
                    <Link
                      className="button button--ghost"
                      to={`/c/${teamSummary.clubSlug}/t/${teamSummary.teamSlug}/settings`}
                    >
                      Open team settings
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="notice notice--info">No teams have been created yet.</div>
            )}
          </section>
        ) : (
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
                    onChange={(event) => setClubName(event.target.value)}
                    placeholder="Blackhawk Country Club"
                    value={clubName}
                  />
                </label>
                <button className="button" disabled={creatingClub} type="submit">
                  {creatingClub ? 'Creating club...' : 'Create club'}
                </button>
              </form>

              {clubs.length > 0 ? (
                <div className="entity-list">
                  {clubs.map((club) => (
                    <div key={club.slug} className="entity-card entity-card--column">
                      <label className="field">
                        <span>Club name</span>
                        <input
                          onChange={(event) =>
                            setClubDrafts((current) => ({
                              ...current,
                              [club.slug]: event.target.value,
                            }))
                          }
                          value={clubDrafts[club.slug] ?? club.name}
                        />
                      </label>
                      <span>Slug: {club.slug}</span>
                      <div className="choice-row">
                        <button
                          className="button"
                          disabled={updatingClubSlug === club.slug}
                          onClick={() => handleRenameClub(club)}
                          type="button"
                        >
                          {updatingClubSlug === club.slug ? 'Saving...' : 'Rename club'}
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
                    <div key={`${request.requestedClubSlug}-${request.id}`} className="entity-card entity-card--column">
                      <div className="member-admin__header">
                        <div>
                          <strong>{request.teamName || request.teamSlug}</strong>
                          <span>
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
                        <span>
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
        )}
      </section>
    </div>
  );
}
