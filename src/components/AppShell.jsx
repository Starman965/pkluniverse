import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  buildStandingsSummary,
  getMembership,
  getTeam,
  isPlatformAdmin,
  listGames,
  listMemberships,
  listPlayers,
  listTeamMembers,
  setLastActiveTeam,
} from '../lib/data';
import defaultTeamLogo from '../../default_team_logo.webp';
import pklUniverseWideLogo from '../../pkl_universe_wide_logo.webp';

const primaryRoutes = [
  { icon: 'news', label: 'Home', to: 'news' },
  { icon: 'members', label: 'Team Members', to: 'team' },
  { icon: 'matches', label: 'Team Matches', to: 'schedule' },
  { icon: 'standings', label: 'Team Standing', to: 'team-standing' },
  { icon: 'club', label: 'Club Hub', requiresApprovedClub: true, to: 'club-teams' },
];

const adminRoutes = [
  { icon: 'challenges', label: 'Club Challenges', to: 'challenges' },
  { icon: 'manageMatches', label: 'Manage Matches', to: 'schedule-scores' },
  { icon: 'rosters', label: 'Build Rosters', to: 'roster-mgmt' },
  { icon: 'managePlayers', label: 'Manage Players', to: 'player-mgmt' },
  { icon: 'settings', label: 'Team Settings', to: 'settings' },
];

function canManageRole(role) {
  return role === 'captain' || role === 'coCaptain';
}

function PlayerMenuIcon({ type }) {
  if (type === 'news') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="m4 11 8-7 8 7" />
        <path d="M6.5 10.5V20h11v-9.5" />
        <path d="M10 20v-5h4v5" />
      </svg>
    );
  }

  if (type === 'members') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M2.8 20a5.8 5.8 0 0 1 11.4 0" />
        <path d="M16.5 10.5a3 3 0 1 0-1.1-5.8M16.2 14.2A5 5 0 0 1 21.2 20" />
      </svg>
    );
  }

  if (type === 'matches') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M6.5 3.5v3M17.5 3.5v3M4.5 8h15" />
        <path d="M5 5.5h14v15H5z" />
        <path d="M8 12h3v3H8zM14 12h2" />
      </svg>
    );
  }

  if (type === 'standings') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M5 20V9h4v11M10 20V4h4v16M15 20v-7h4v7" />
      </svg>
    );
  }

  if (type === 'club') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M4 20V8l8-4 8 4v12" />
        <path d="M9 20v-7h6v7M7 10.5h2M15 10.5h2" />
      </svg>
    );
  }

  if (type === 'profile') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </svg>
    );
  }

  if (type === 'help') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.8 9.3a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  if (type === 'signout') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M10 17 15 12 10 7" />
        <path d="M15 12H3" />
        <path d="M14 4h5v16h-5" />
      </svg>
    );
  }

  if (type === 'switch') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M7 7h11" />
        <path d="m15 4 3 3-3 3" />
        <path d="M17 17H6" />
        <path d="m9 14-3 3 3 3" />
      </svg>
    );
  }

  if (type === 'admin') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M12 3 19 6v5c0 4.4-2.8 8.1-7 10-4.2-1.9-7-5.6-7-10V6l7-3Z" />
        <path d="M9.5 12.2 11.2 14l3.5-4" />
      </svg>
    );
  }

  return null;
}

function CaptainMenuIcon({ type }) {
  if (type === 'challenges') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M7 17 17 7" />
        <path d="M14 4h6v6" />
        <path d="M10 20H4v-6" />
      </svg>
    );
  }

  if (type === 'manageMatches') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M6.5 3.5v3M17.5 3.5v3M4.5 8h15" />
        <path d="M5 5.5h14v15H5z" />
        <path d="M8 13h4M8 16h7" />
        <path d="m16.5 11 1.2 1.2 2-2" />
      </svg>
    );
  }

  if (type === 'rosters') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M5 5h14v15H5z" />
        <path d="M8 9h8M8 13h8M8 17h5" />
        <path d="M3.5 8h3M3.5 14h3" />
      </svg>
    );
  }

  if (type === 'managePlayers') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M3.5 20a5.5 5.5 0 0 1 10.8-1.4" />
        <path d="M17.5 14v6M14.5 17h6" />
      </svg>
    );
  }

  if (type === 'settings') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M9.5 3.5h5l.7 2.4 2.2.9 2.2-1.2 2.5 4.3-1.9 1.6v2.5l1.9 1.6-2.5 4.3-2.2-1.2-2.2.9-.7 2.4h-5l-.7-2.4-2.2-.9-2.2 1.2-2.5-4.3 1.9-1.6v-2.5L2 9.9l2.5-4.3 2.2 1.2 2.2-.9.6-2.4Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  return null;
}

function formatClubLabel(clubSlug) {
  if (!clubSlug) {
    return 'PKL Universe';
  }

  return clubSlug.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildTeamNavSummary(members, games) {
  const activeMemberCount = members.filter((member) => member.status === 'active').length;
  const standings = buildStandingsSummary(games);
  const completedCount = standings.completedGames.length;

  return {
    activeMemberCount,
    losses: standings.losses,
    ties: standings.ties,
    winPct: completedCount ? Math.round(Number(standings.winPct) * 100) : 0,
    wins: standings.wins,
  };
}

export default function AppShell() {
  const { signOutUser, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { clubSlug, teamSlug } = useParams();
  const [memberships, setMemberships] = useState([]);
  const [membershipError, setMembershipError] = useState('');
  const [activeTeam, setActiveTeam] = useState(null);
  const [activeMembership, setActiveMembership] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [teamNavSummary, setTeamNavSummary] = useState({
    activeMemberCount: 0,
    losses: 0,
    ties: 0,
    winPct: 0,
    wins: 0,
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [teamRefreshKey, setTeamRefreshKey] = useState(0);

  const loadMemberships = useCallback(async () => {
    if (!user?.uid) {
      setMemberships([]);
      setMembershipError('');
      return;
    }

    try {
      const items = await listMemberships(user.uid);
      const activeItems = (await Promise.all(
        items.map(async (item) => {
          const team = await getTeam(item.clubSlug, item.teamSlug).catch(() => null);
          return (team?.status ?? 'active') === 'active' ? item : null;
        }),
      )).filter(Boolean);

      if (!activeItems.length && clubSlug && teamSlug) {
        const [team, membership] = await Promise.all([
          getTeam(clubSlug, teamSlug),
          getMembership(clubSlug, teamSlug, user.uid, user),
        ]);

        if (team && (team.status ?? 'active') === 'active' && membership) {
          setMemberships([
            {
              clubSlug,
              role: membership.role,
              teamName: team.name ?? membership.teamName ?? teamSlug,
              teamSlug,
            },
          ]);
          setMembershipError('');
          return;
        }
      }

      setMemberships(activeItems);
      setMembershipError('');
    } catch (error) {
      setMembershipError(error.message ?? 'Unable to load your teams yet.');
    }
  }, [clubSlug, teamSlug, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setIsAppAdmin(false);
      return;
    }

    isPlatformAdmin(user.uid, user.email).then(setIsAppAdmin).catch(() => {
      setIsAppAdmin(false);
    });
  }, [user?.email, user?.uid]);

  useEffect(() => {
    loadMemberships();

    const intervalId = window.setInterval(() => {
      loadMemberships();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [clubSlug, loadMemberships, teamSlug]);

  useEffect(() => {
    function handleTeamUpdated() {
      setTeamRefreshKey((current) => current + 1);
    }

    window.addEventListener('team-updated', handleTeamUpdated);

    return () => {
      window.removeEventListener('team-updated', handleTeamUpdated);
    };
  }, []);

  useEffect(() => {
    if (!clubSlug || !teamSlug) {
      setActiveTeam(null);
      setActiveMembership(null);
      setCurrentPlayer(null);
      setTeamNavSummary({
        activeMemberCount: 0,
        losses: 0,
        ties: 0,
        winPct: 0,
        wins: 0,
      });
      return;
    }

    Promise.all([
      getTeam(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
      listTeamMembers(clubSlug, teamSlug),
      listPlayers(clubSlug, teamSlug),
      listGames(clubSlug, teamSlug),
    ])
      .then(([team, membership, members, players, games]) => {
        setActiveTeam(team);
        setActiveMembership(membership);
        setCurrentPlayer(players.find((player) => player.uid === user?.uid || player.id === user?.uid) ?? null);
        setTeamNavSummary(buildTeamNavSummary(members, games));
      })
      .catch(() => {
        setActiveTeam(null);
        setActiveMembership(null);
        setCurrentPlayer(null);
        setTeamNavSummary({
          activeMemberCount: 0,
          losses: 0,
          ties: 0,
          winPct: 0,
          wins: 0,
        });
      });
  }, [clubSlug, teamRefreshKey, teamSlug, user]);

  const currentMembership = useMemo(
    () =>
      activeMembership ??
      memberships.find(
        (membership) => membership.clubSlug === clubSlug && membership.teamSlug === teamSlug,
      ) ??
      null,
    [activeMembership, clubSlug, memberships, teamSlug],
  );
  const canManage = canManageRole(currentMembership?.role);
  const teamLogo = activeTeam?.logoUrl || defaultTeamLogo;
  const teamTitle = activeTeam?.name ?? 'PKL Universe';
  const isApprovedClubTeam =
    activeTeam?.affiliationStatus === 'approved' &&
    activeTeam?.approvedClubSlug &&
    activeTeam.approvedClubSlug !== 'independent';
  const visiblePrimaryRoutes = primaryRoutes.filter((route) => !route.requiresApprovedClub || isApprovedClubTeam);
  const userRoleLabel =
    currentMembership?.role === 'coCaptain'
      ? 'Co-captain'
      : canManage
        ? 'Captain'
        : 'Player';
  const userDisplayName = currentPlayer?.fullName || user?.displayName || user?.email || 'Player';
  const userAvatarUrl = currentPlayer?.headshotUrl || user?.photoURL || '';
  const userInitial = userDisplayName.trim().charAt(0).toUpperCase() || 'P';
  const manageMenuOpen = adminRoutes.some((route) => location.pathname.endsWith(`/${route.to}`));

  useEffect(() => {
    if (!user?.uid || !clubSlug || !teamSlug || !currentMembership) {
      return;
    }

    setLastActiveTeam({
      clubSlug,
      teamSlug,
      uid: user.uid,
    }).catch(() => {
      // Last-active tracking should not interrupt team navigation.
    });
  }, [clubSlug, currentMembership, teamSlug, user?.uid]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    }

    document.body.classList.add('hub-nav-open');
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('hub-nav-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileNavOpen]);

  async function handleSignOut() {
    setMobileNavOpen(false);
    await signOutUser();
    navigate('/', { replace: true });
  }

  return (
    <div className="app-shell">
      <button
        aria-label="Close team menu"
        className="hub-nav-overlay"
        hidden={!mobileNavOpen}
        onClick={() => setMobileNavOpen(false)}
        type="button"
      />

      <header className="hub-topbar">
        <button
          aria-controls="team-hub-sidebar"
          aria-expanded={mobileNavOpen}
          aria-label="Open team menu"
          className="hub-nav-toggle"
          onClick={() => setMobileNavOpen((current) => !current)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        <div className="hub-topbar__team">
          <img alt="" aria-hidden="true" className="hub-topbar__logo" src={teamLogo} />
          <div>
            <p className="hub-topbar__eyebrow">Team Hub</p>
            <strong>{teamTitle}</strong>
          </div>
        </div>
      </header>

      <aside
        id="team-hub-sidebar"
        className={`sidebar ${mobileNavOpen ? 'sidebar--open' : ''}`}
        aria-label="Team hub navigation"
      >
        <div className="sidebar__header">
          <div className="sidebar__team-card">
            <img alt={`${teamTitle} logo`} className="sidebar__team-logo" src={teamLogo} />
            <div className="sidebar__team-copy">
              <h1 className="sidebar__team-title">{teamTitle}</h1>
              <div className="sidebar__team-stats" aria-label="Team snapshot">
                <span className="sidebar__team-stat sidebar__team-stat--members">
                  Team Members: <strong>{teamNavSummary.activeMemberCount}</strong>
                </span>
                <span className="sidebar__team-stat">
                  <strong>{teamNavSummary.wins}-{teamNavSummary.losses}{teamNavSummary.ties ? `-${teamNavSummary.ties}` : ''}</strong>
                  W-L{teamNavSummary.ties ? '-T' : ''}
                </span>
                <span className="sidebar__team-stat">
                  <strong>{teamNavSummary.winPct}%</strong>
                  Win %
                </span>
              </div>
            </div>
          </div>
        </div>

        <nav className="sidebar__nav">
          <div className="sidebar__nav-group">
            <p className="sidebar__nav-heading">Player</p>
            {visiblePrimaryRoutes.map((route) => (
              <NavLink
                key={route.label}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                onClick={() => setMobileNavOpen(false)}
                to={route.to}
              >
                <PlayerMenuIcon type={route.icon} />
                <span>{route.label}</span>
              </NavLink>
            ))}
          </div>

          {canManage ? (
            <div className="sidebar__nav-group">
              <p className="sidebar__nav-heading">Team Management</p>
              <details className="sidebar__manage-menu" open={manageMenuOpen}>
                <summary className={`nav-link sidebar__manage-summary ${manageMenuOpen ? 'nav-link--active' : ''}`}>
                  <CaptainMenuIcon type="settings" />
                  <span>Manage</span>
                </summary>
                <div className="sidebar__manage-list">
                  {adminRoutes.map((route) => (
                    <NavLink
                      key={route.label}
                      className={({ isActive }) => `nav-link sidebar__manage-link ${isActive ? 'nav-link--active' : ''}`}
                      onClick={() => setMobileNavOpen(false)}
                      to={route.to}
                    >
                      <CaptainMenuIcon type={route.icon} />
                      <span>{route.label}</span>
                    </NavLink>
                  ))}
                </div>
              </details>
            </div>
          ) : null}

          <div className="sidebar__nav-group">
            <NavLink className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`} onClick={() => setMobileNavOpen(false)} to="profile">
              <PlayerMenuIcon type="profile" />
              <span>Profile</span>
            </NavLink>
            <NavLink className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`} onClick={() => setMobileNavOpen(false)} to="help">
              <PlayerMenuIcon type="help" />
              <span>Help &amp; Feedback</span>
            </NavLink>
            <button className="nav-link sidebar__nav-button" onClick={handleSignOut} type="button">
              <PlayerMenuIcon type="signout" />
              <span>Sign out</span>
            </button>
          </div>
        </nav>

        {membershipError ? (
          <p className="sidebar__empty">
            Team list is still syncing. Refresh after your Firestore index finishes building.
          </p>
        ) : null}

        <div className="sidebar__footer">
          <div className="sidebar__user-card">
            {userAvatarUrl ? (
              <img alt={`${userDisplayName} profile`} className="sidebar__user-avatar" src={userAvatarUrl} />
            ) : (
              <div className="sidebar__user-avatar sidebar__user-avatar--initial">{userInitial}</div>
            )}
            <div className="sidebar__user-copy">
              <strong>{userDisplayName}</strong>
              <span>{userRoleLabel}</span>
            </div>
          </div>
          <div className="sidebar__footer-actions">
            {memberships.length > 0 ? (
              <NavLink className="sidebar__footer-link" onClick={() => setMobileNavOpen(false)} to="/teams">
                <PlayerMenuIcon type="switch" />
                <span>Switch Team</span>
              </NavLink>
            ) : null}
            {isAppAdmin ? (
              <NavLink
                className="sidebar__footer-link"
                onClick={() => setMobileNavOpen(false)}
                rel="noreferrer"
                target="_blank"
                to="/admin"
              >
                <PlayerMenuIcon type="admin" />
                <span>App Admin</span>
              </NavLink>
            ) : null}
          </div>
          <Link className="sidebar__app-brand sidebar__footer-brand" to="/">
            <img alt="PKL Universe" className="sidebar__app-logo" src={pklUniverseWideLogo} />
          </Link>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
