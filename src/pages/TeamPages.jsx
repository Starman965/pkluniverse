import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  deleteNewsPost,
  getMembership,
  getTeam,
  listGames,
  listNewsPosts,
  listPlayers,
  saveGame,
  saveNewsPost,
  savePlayer,
  setAvailability,
} from '../lib/data';
import TeamPageTemplate from './TeamPageTemplate';

function canManageRole(role) {
  return role === 'captain' || role === 'coCaptain';
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
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid) : Promise.resolve(null),
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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    active: true,
    dupr: '',
    firstName: '',
    lastName: '',
    skillLevel: '',
  });

  const canManage = canManageRole(membership?.role);

  async function loadRosterData() {
    const [playerData, membershipData] = await Promise.all([
      listPlayers(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid) : Promise.resolve(null),
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
      setForm({
        active: true,
        dupr: '',
        firstName: '',
        lastName: '',
        skillLevel: '',
      });
      setMessage('Player saved to the team roster.');
      await loadRosterData();
    } catch (submitError) {
      setError(submitError.message ?? 'Unable to save that player.');
    } finally {
      setSaving(false);
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
              <input
                onChange={(event) =>
                  setForm((current) => ({ ...current, skillLevel: event.target.value }))
                }
                placeholder="Intermediate"
                value={form.skillLevel}
              />
            </label>
            <label className="checkbox-field">
              <input
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                type="checkbox"
              />
              <span>Active player</span>
            </label>
            <button className="button" disabled={saving} type="submit">
              {saving ? 'Saving player...' : 'Add player'}
            </button>
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
                </div>
                <span className={`status-badge ${player.active ? 'status-badge--active' : ''}`}>
                  {player.active ? 'Active' : 'Inactive'}
                </span>
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
  const [membership, setMembership] = useState(null);
  const [saving, setSaving] = useState(false);
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
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid) : Promise.resolve(null),
    ]);

    setGames(gameData);
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
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid) : Promise.resolve(null),
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
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid) : Promise.resolve(null),
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
  return (
    <TeamPageTemplate
      description="Team settings will hold branding, team metadata, join settings, and member role management."
      nextSteps={[
        'Persist team profile fields including logo URL and slug.',
        'Add join-code rotation and membership role controls.',
        'Expose safe self-service team settings to captains and co-captains.',
      ]}
      title="Settings"
    />
  );
}

export function AdminPage() {
  return (
    <TeamPageTemplate
      description="The first version keeps club administration lightweight. This area is for team-level admin tasks, while club-admin recovery tools stay restricted and minimal."
      nextSteps={[
        'Separate team-level admin actions from club-admin utilities.',
        'Show pairings management to captains and co-captains.',
        'Add safety checks around captain assignment and team archival.',
      ]}
      title="Admin"
    />
  );
}
