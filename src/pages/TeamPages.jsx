import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  PLAYER_SKILL_LEVELS,
  buildPairingSummary,
  buildStandingsSummary,
  deleteNewsPost,
  getMembership,
  getTeam,
  listGames,
  listNewsPosts,
  listPlayers,
  listTeamMembers,
  rotateTeamJoinCode,
  saveGame,
  saveGamePairings,
  saveNewsPost,
  savePlayer,
  setAvailability,
  updateTeamMemberRole,
  updateTeamSettings,
} from '../lib/data';

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

function validateSquareImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const { naturalHeight, naturalWidth } = image;
      URL.revokeObjectURL(objectUrl);

      if (naturalWidth === naturalHeight) {
        resolve();
        return;
      }

      reject(new Error('Upload a square logo image, such as 512x512 or 1024x1024.'));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That logo file could not be read as an image.'));
    };

    image.src = objectUrl;
  });
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

export function RosterPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
  const [updatingPlayerId, setUpdatingPlayerId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(createEmptyRosterForm());

  const canManage = canManageRole(membership?.role);
  const editingPlayer = players.find((player) => player.id === form.playerId) ?? null;

  async function loadRosterData() {
    const [playerData, membershipData] = await Promise.all([
      listPlayers(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setPlayers(playerData);
    setMembership(membershipData);
  }

  useEffect(() => {
    loadRosterData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load the roster yet.');
    });
  }, [clubSlug, teamSlug, user?.uid]);

  async function handleSubmit(event) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await savePlayer({
        ...form,
        clubSlug,
        teamSlug,
        user,
      });
      setForm(createEmptyRosterForm());
      setMessage(editingPlayer ? 'Player changes saved.' : 'Player saved to the team roster.');
      await loadRosterData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save that player.');
    } finally {
      setSaving(false);
    }
  }

  function startEditing(player) {
    setError('');
    setMessage('');
    setForm({
      active: player.active,
      dupr: typeof player.dupr === 'number' ? String(player.dupr) : '',
      firstName: player.firstName ?? '',
      lastName: player.lastName ?? '',
      playerId: player.id,
      skillLevel: PLAYER_SKILL_LEVELS.includes(player.skillLevel) ? player.skillLevel : '',
    });
  }

  function cancelEditing() {
    setError('');
    setMessage('');
    setForm(createEmptyRosterForm());
  }

  async function toggleActiveStatus(player) {
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
      if (form.playerId === player.id) {
        setForm((current) => ({ ...current, active: !player.active }));
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
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">Roster</p>
        <h1>Team players</h1>
        <p>
          This page now reads live roster records from Firestore. Captains and co-captains can add
          players manually while the hybrid identity model still allows later user-linking.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {canManage ? (
          <form className="roster-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>First name</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                value={form.firstName}
              />
            </label>
            <label className="field">
              <span>Last name</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
                value={form.lastName}
              />
            </label>
            <label className="field">
              <span>DUPR</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, dupr: event.target.value }))}
                placeholder="4.25"
                value={form.dupr}
              />
            </label>
            <label className="field">
              <span>Skill level</span>
              <select
                onChange={(event) =>
                  setForm((current) => ({ ...current, skillLevel: event.target.value }))
                }
                value={form.skillLevel}
              >
                <option value="">Select skill level</option>
                {PLAYER_SKILL_LEVELS.map((skillLevel) => (
                  <option key={skillLevel} value={skillLevel}>
                    {skillLevel}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-field">
              <input
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                type="checkbox"
              />
              <span>Active player</span>
            </label>
            <div className="settings-actions">
              <button className="button" disabled={saving} type="submit">
                {saving
                  ? editingPlayer
                    ? 'Saving changes...'
                    : 'Saving player...'
                  : editingPlayer
                    ? 'Save changes'
                    : 'Add player'}
              </button>
              {editingPlayer ? (
                <button className="button button--ghost" onClick={cancelEditing} type="button">
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="notice notice--info">
            Captains and co-captains can add or edit players. Your current role is{' '}
            <strong>{membership?.role ?? 'member'}</strong>.
          </div>
        )}
      </section>

      <section className="card">
        <p className="eyebrow">Current roster</p>
        {players.length > 0 ? (
          <div className="entity-list">
            {players.map((player) => (
              <div key={player.id} className="entity-card">
                <div>
                  <strong>{player.fullName || 'Unnamed player'}</strong>
                  <span>
                    {player.skillLevel || 'Skill TBD'}
                    {typeof player.dupr === 'number' ? ` · DUPR ${player.dupr.toFixed(2)}` : ''}
                  </span>
                  {player.email ? <span>Linked account: {player.email}</span> : null}
                </div>
                <div className="roster-card__actions">
                  <span className={`status-badge ${player.active ? 'status-badge--active' : ''}`}>
                    {player.active ? 'Active' : 'Inactive'}
                  </span>
                  {canManage ? (
                    <div className="choice-row">
                      <button
                        className="choice-button"
                        onClick={() => startEditing(player)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="choice-button"
                        disabled={updatingPlayerId === player.id}
                        onClick={() => toggleActiveStatus(player)}
                        type="button"
                      >
                        {updatingPlayerId === player.id
                          ? 'Saving...'
                          : player.active
                            ? 'Deactivate'
                            : 'Reactivate'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No players saved yet.</p>
        )}
      </section>
    </div>
  );
}

export function SchedulePage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [resultDrafts, setResultDrafts] = useState({});
  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
  const [updatingGameId, setUpdatingGameId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    isoDate: '',
    location: '',
    opponent: '',
    timeLabel: '',
  });

  const canManage = canManageRole(membership?.role);

  async function loadScheduleData() {
    const [gameData, membershipData] = await Promise.all([
      listGames(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setGames(gameData);
    setResultDrafts(buildResultDrafts(gameData));
    setMembership(membershipData);
  }

  useEffect(() => {
    loadScheduleData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load matchups yet.');
    });
  }, [clubSlug, teamSlug, user?.uid]);

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
      setForm({
        isoDate: '',
        location: '',
        opponent: '',
        timeLabel: '',
      });
      setMessage('Matchup added to the schedule.');
      await loadScheduleData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save that matchup.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResultSave(game) {
    const draft = resultDrafts[game.id] ?? createResultDraft(game);

    setUpdatingGameId(game.id);
    setError('');
    setMessage('');

    try {
      await saveGame({
        clubSlug,
        gameId: game.id,
        isoDate: game.isoDate || game.dateLabel || '',
        location: game.location,
        matchStatus: draft.matchStatus,
        opponent: game.opponent,
        opponentScore: draft.opponentScore,
        teamScore: draft.teamScore,
        teamSlug,
        timeLabel: game.timeLabel,
        user,
      });
      setMessage('Match result updated.');
      await loadScheduleData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to update that result.');
    } finally {
      setUpdatingGameId('');
    }
  }

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">Schedule</p>
        <h1>Upcoming matchups</h1>
        <p>
          Schedule records are now live in Firestore. Standings will build from these same
          team-managed results once score entry is added.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {canManage ? (
          <form className="roster-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Date</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, isoDate: event.target.value }))}
                type="date"
                value={form.isoDate}
              />
            </label>
            <label className="field">
              <span>Opponent</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, opponent: event.target.value }))}
                placeholder="Falcons"
                value={form.opponent}
              />
            </label>
            <label className="field">
              <span>Location</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                placeholder="Blackhawk Country Club"
                value={form.location}
              />
            </label>
            <label className="field">
              <span>Time label</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, timeLabel: event.target.value }))}
                placeholder="10:00 AM PT"
                value={form.timeLabel}
              />
            </label>
            <button className="button" disabled={saving} type="submit">
              {saving ? 'Saving matchup...' : 'Add matchup'}
            </button>
          </form>
        ) : (
          <div className="notice notice--info">
            Captains and co-captains manage the schedule. Your current role is{' '}
            <strong>{membership?.role ?? 'member'}</strong>.
          </div>
        )}
      </section>

      <section className="card">
        <p className="eyebrow">Standings</p>
        <StandingsSummary games={games} />
      </section>

      <section className="card">
        <p className="eyebrow">Saved schedule</p>
        {games.length > 0 ? (
          <div className="entity-list">
            {games.map((game) => (
              <div key={game.id} className="entity-card entity-card--column">
                <strong>{game.opponent || 'Opponent TBD'}</strong>
                <span>
                  {game.isoDate || game.dateLabel || 'Date TBD'} · {game.timeLabel || 'Time TBD'}
                </span>
                <span>{game.location || 'Location TBD'}</span>
                <span>
                  Status: {game.matchStatus === 'completed' ? 'Completed' : 'Scheduled'}
                  {game.result && game.result !== 'pending'
                    ? ` · Result ${game.result}`
                    : ''}
                </span>
                {game.matchStatus === 'completed' &&
                game.teamScore !== null &&
                game.opponentScore !== null ? (
                  <span>
                    Final: {game.teamScore}-{game.opponentScore}
                  </span>
                ) : null}
                {canManage ? (
                  <div className="result-editor">
                    <label className="field">
                      <span>Status</span>
                      <select
                        onChange={(event) =>
                          setResultDrafts((current) => ({
                            ...current,
                            [game.id]: {
                              ...(current[game.id] ?? createResultDraft(game)),
                              matchStatus: event.target.value,
                            },
                          }))
                        }
                        value={resultDrafts[game.id]?.matchStatus ?? game.matchStatus ?? 'scheduled'}
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Your score</span>
                      <input
                        inputMode="numeric"
                        onChange={(event) =>
                          setResultDrafts((current) => ({
                            ...current,
                            [game.id]: {
                              ...(current[game.id] ?? createResultDraft(game)),
                              teamScore: event.target.value,
                            },
                          }))
                        }
                        placeholder="21"
                        value={resultDrafts[game.id]?.teamScore ?? ''}
                      />
                    </label>
                    <label className="field">
                      <span>Opponent score</span>
                      <input
                        inputMode="numeric"
                        onChange={(event) =>
                          setResultDrafts((current) => ({
                            ...current,
                            [game.id]: {
                              ...(current[game.id] ?? createResultDraft(game)),
                              opponentScore: event.target.value,
                            },
                          }))
                        }
                        placeholder="18"
                        value={resultDrafts[game.id]?.opponentScore ?? ''}
                      />
                    </label>
                    <button
                      className="button button--ghost"
                      disabled={updatingGameId === game.id}
                      onClick={() => handleResultSave(game)}
                      type="button"
                    >
                      {updatingGameId === game.id ? 'Saving result...' : 'Save result'}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
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

export function PairingsPage() {
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
        <p className="eyebrow">Pairings</p>
        <h1>Matchup pairings</h1>
        <p>
          Pairings are now saved per matchup. Captains and co-captains can choose up to eight roster
          players, then assign them into court slots for the selected match.
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
  const [membership, setMembership] = useState(null);
  const [updatingGameId, setUpdatingGameId] = useState('');
  const [error, setError] = useState('');

  async function loadAvailabilityData() {
    const [gameData, membershipData] = await Promise.all([
      listGames(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setGames(gameData);
    setMembership(membershipData);
  }

  useEffect(() => {
    loadAvailabilityData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load availability yet.');
    });
  }, [clubSlug, teamSlug, user?.uid]);

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
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">Availability</p>
        <h1>Your responses</h1>
        <p>
          Availability now reads and writes against the authenticated member&apos;s linked player
          record, replacing the old open player selector.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}

        {!membership?.playerId ? (
          <div className="notice notice--warning">
            Your account is not linked to a player record for this team yet.
          </div>
        ) : null}
      </section>

      <section className="card">
        <p className="eyebrow">Upcoming schedule</p>
        {games.length > 0 ? (
          <div className="entity-list">
            {games.map((game) => {
              const currentStatus = membership?.playerId
                ? game.attendance?.[membership.playerId] ?? 'unknown'
                : 'unknown';
              const summary = Object.values(game.attendance ?? {}).reduce(
                (counts, status) => {
                  if (status === 'in') {
                    counts.in += 1;
                  } else if (status === 'out') {
                    counts.out += 1;
                  }
                  return counts;
                },
                { in: 0, out: 0 },
              );

              return (
                <div key={game.id} className="entity-card entity-card--column">
                  <strong>{game.opponent || 'Opponent TBD'}</strong>
                  <span>
                    {game.isoDate || game.dateLabel || 'Date TBD'} · {game.timeLabel || 'Time TBD'}
                  </span>
                  <span>{game.location || 'Location TBD'}</span>
                  <span>
                    Team summary: {summary.in} in · {summary.out} out
                  </span>
                  <div className="choice-row">
                    {[
                      { label: 'In', value: 'in' },
                      { label: 'Out', value: 'out' },
                      { label: 'Unknown', value: 'unknown' },
                    ].map((choice) => (
                      <button
                        key={choice.value}
                        className={`choice-button ${currentStatus === choice.value ? 'choice-button--active' : ''}`}
                        disabled={!membership?.playerId || updatingGameId === game.id}
                        onClick={() => updateAvailability(game.id, choice.value)}
                        type="button"
                      >
                        {updatingGameId === game.id && currentStatus === choice.value
                          ? 'Saving...'
                          : choice.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p>No scheduled matchups yet.</p>
        )}
      </section>
    </div>
  );
}

export function NewsPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [newsPosts, setNewsPosts] = useState([]);
  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingPostId, setEditingPostId] = useState('');
  const [form, setForm] = useState({
    body: '',
    imageFile: null,
    linkUrl: '',
    title: '',
  });

  const canManage = canManageRole(membership?.role);
  const editingPost = newsPosts.find((post) => post.id === editingPostId) ?? null;

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

  function formatPostDate(post) {
    const value = post.updatedAtMs || post.createdAtMs;

    if (!value) {
      return 'Draft';
    }

    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function resetForm() {
    setEditingPostId('');
    setForm({
      body: '',
      imageFile: null,
      linkUrl: '',
      title: '',
    });
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
      resetForm();
      await loadNewsData();
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
        resetForm();
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
  }

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">News</p>
        <h1>Team updates</h1>
        <p>
          News posts are team-specific. Captains and co-captains can publish updates with text, an
          optional link, and an optional image.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        {canManage ? (
          <form className="news-form" onSubmit={handleSubmit}>
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
                rows={6}
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
            <div className="news-form__actions">
              <button className="button" disabled={saving} type="submit">
                {saving
                  ? editingPost
                    ? 'Updating post...'
                    : 'Publishing post...'
                  : editingPost
                    ? 'Update post'
                    : 'Publish post'}
              </button>
              {editingPost ? (
                <button className="button button--ghost" onClick={resetForm} type="button">
                  Cancel edit
                </button>
              ) : null}
            </div>
            {editingPost?.imageUrl ? (
              <div className="notice notice--info news-form__full">
                Editing a post with an existing image. Upload a new file only if you want to replace
                it.
              </div>
            ) : null}
          </form>
        ) : (
          <div className="notice notice--info">
            Captains and co-captains can publish or edit team news. Your current role is{' '}
            <strong>{membership?.role ?? 'member'}</strong>.
          </div>
        )}
      </section>

      <section className="card">
        <p className="eyebrow">Published feed</p>
        {newsPosts.length > 0 ? (
          <div className="news-list">
            {newsPosts.map((post) => (
              <article key={post.id} className="news-card">
                {post.imageUrl ? (
                  <img alt={post.title} className="news-card__image" src={post.imageUrl} />
                ) : null}
                <div className="news-card__body">
                  <div className="news-card__header">
                    <div>
                      <h2>{post.title}</h2>
                      <p className="news-card__meta">{formatPostDate(post)}</p>
                    </div>
                    {canManage ? (
                      <div className="choice-row">
                        <button
                          className="choice-button"
                          onClick={() => startEditing(post)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="choice-button"
                          disabled={deletingId === post.id}
                          onClick={() => handleDelete(post)}
                          type="button"
                        >
                          {deletingId === post.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <p className="news-card__text">{post.body}</p>
                  {post.linkUrl ? (
                    <a
                      className="news-card__link"
                      href={post.linkUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open link
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No news posts published yet.</p>
        )}
      </section>
    </div>
  );
}

export function SettingsPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    logoFile: null,
    teamName: '',
  });

  const canManage = canManageRole(membership?.role);

  async function loadSettingsData() {
    const [teamData, membershipData] = await Promise.all([
      getTeam(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setTeam(teamData);
    setMembership(membershipData);
    setForm({
      logoFile: null,
      teamName: teamData?.name ?? '',
    });
  }

  useEffect(() => {
    loadSettingsData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load team settings yet.');
    });
  }, [clubSlug, teamSlug, user?.uid]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      if (form.logoFile) {
        await validateSquareImage(form.logoFile);
      }

      await updateTeamSettings({
        clubSlug,
        logoFile: form.logoFile,
        teamName: form.teamName,
        teamSlug,
      });
      setMessage('Team settings saved.');
      await loadSettingsData();
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

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">Settings</p>
        <h1>Team profile</h1>
        <p>
          Update the saved team profile and rotate the join code players use from the onboarding
          flow.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}

        <div className="detail-grid">
          <div className="detail-card">
            <span>Team slug</span>
            <strong>{team?.slug ?? teamSlug}</strong>
          </div>
          <div className="detail-card">
            <span>Current join code</span>
            <strong>{team?.joinCode ?? 'Not available yet'}</strong>
          </div>
          <div className="detail-card">
            <span>Status</span>
            <strong>{team?.status ?? 'Unknown'}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">Branding</p>
        {canManage ? (
          <form className="roster-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Team name</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, teamName: event.target.value }))}
                value={form.teamName}
              />
            </label>
            <label className="field">
              <span>Square logo upload</span>
              <input
                accept="image/*"
                onChange={(event) =>
                  setForm((current) => ({ ...current, logoFile: event.target.files?.[0] ?? null }))
                }
                type="file"
              />
            </label>
            <div className="notice notice--info">
              Upload a square team logo, for example `512x512` or `1024x1024`. Leaving this blank
              keeps the current logo.
            </div>
            <div className="settings-actions">
              <button className="button" disabled={saving} type="submit">
                {saving ? 'Saving settings...' : 'Save settings'}
              </button>
              <button
                className="button button--ghost"
                disabled={rotating}
                onClick={handleRotateJoinCode}
                type="button"
              >
                {rotating ? 'Rotating code...' : 'Rotate join code'}
              </button>
            </div>
          </form>
        ) : (
          <div className="notice notice--info">
            Captains and co-captains can edit team settings. Your current role is{' '}
            <strong>{membership?.role ?? 'member'}</strong>.
          </div>
        )}
      </section>

      {team?.logoUrl ? (
        <section className="card">
          <p className="eyebrow">Logo preview</p>
          <img alt={`${team.name ?? 'Team'} logo`} className="team-logo-preview" src={team.logoUrl} />
        </section>
      ) : null}
    </div>
  );
}

export function AdminPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [updatingUid, setUpdatingUid] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canManageMembership = isCaptainRole(membership?.role);
  const playerMap = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  async function loadAdminData() {
    const [memberData, playerData, membershipData] = await Promise.all([
      listTeamMembers(clubSlug, teamSlug),
      listPlayers(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
    ]);

    setMembers(memberData);
    setPlayers(playerData);
    setMembership(membershipData);
  }

  useEffect(() => {
    loadAdminData().catch((loadError) => {
      setError(loadError.message ?? 'Unable to load team admin data yet.');
    });
  }, [clubSlug, teamSlug, user?.uid]);

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
      await loadAdminData();
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to update that team role.');
    } finally {
      setUpdatingUid('');
    }
  }

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">Admin</p>
        <h1>Team roles</h1>
        <p>
          Use this area to review team memberships and appoint or remove co-captains. Captain
          reassignment stays out of scope for this first admin slice.
        </p>

        {error ? <div className="notice notice--error">{error}</div> : null}
        {message ? <div className="notice notice--success">{message}</div> : null}
      </section>

      <section className="card">
        <p className="eyebrow">Member access</p>
        {members.length > 0 ? (
          <div className="entity-list">
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
  );
}
