import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getMembership,
  getTeam,
  isPlatformAdmin,
  listMemberships,
  listPlayers,
  listTeamMembers,
  setLastActiveTeam,
} from '../lib/data';
import defaultTeamLogo from '../../default_team_logo.webp';
import pklUniverseWideLogo from '../../pkl_universe_wide_logo.webp';

const primaryRoutes = [
  { icon: 'news', label: 'News Feed', to: 'news' },
  { icon: 'members', label: 'Team Members', to: 'team' },
  { icon: 'matches', label: 'Team Matches', to: 'schedule' },
  { icon: 'standings', label: 'Team Standing', to: 'team-standing' },
  { icon: 'club', label: 'Club Hub', requiresApprovedClub: true, to: 'club-teams' },
  { icon: 'profile', label: 'My Profile', to: 'profile' },
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
        <path d="M5 5.5h14v13H5z" />
        <path d="M8 9h8M8 12h8M8 15h5" />
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
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.8v3M12 18.2v3M4.9 4.9 7 7M17 17l2.1 2.1M2.8 12h3M18.2 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
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

function buildCaptainLabel(members, players, currentUser) {
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const leaderNames = members
    .filter((member) => member.role === 'captain' || member.role === 'coCaptain')
    .sort((left, right) => {
      if (left.role === right.role) {
        return 0;
      }

      return left.role === 'captain' ? -1 : 1;
    })
    .map((member) => {
      const player = member.playerId ? playerMap.get(member.playerId) : null;

      if (player?.fullName) {
        return player.fullName;
      }

      return member.uid === currentUser?.uid ? currentUser?.displayName || currentUser?.email : '';
    })
    .filter(Boolean);
  const uniqueLeaderNames = Array.from(new Set(leaderNames));

  if (!uniqueLeaderNames.length) {
    return 'Captain: TBD';
  }

  if (uniqueLeaderNames.length === 1) {
    return `Captain: ${uniqueLeaderNames[0]}`;
  }

  const visibleNames = uniqueLeaderNames.slice(0, 2);
  const remainingCount = uniqueLeaderNames.length - visibleNames.length;

  return `Captains: ${visibleNames.join(', ')}${remainingCount > 0 ? ` +${remainingCount}` : ''}`;
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
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [captainLabel, setCaptainLabel] = useState('Captain: TBD');
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
      setCaptainLabel('Captain: TBD');
      return;
    }

    Promise.all([
      getTeam(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
      listTeamMembers(clubSlug, teamSlug),
      listPlayers(clubSlug, teamSlug),
    ])
      .then(([team, membership, members, players]) => {
        setActiveTeam(team);
        setActiveMembership(membership);
        setCaptainLabel(buildCaptainLabel(members, players, user));
      })
      .catch(() => {
        setActiveTeam(null);
        setActiveMembership(null);
        setCaptainLabel('Captain: TBD');
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
  const signedInLabel =
    currentMembership?.role === 'coCaptain'
      ? 'Signed In: Co-captain'
      : canManage
        ? 'Signed In: Captain'
        : 'Signed In: Player';

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
              <p className="sidebar__team-captain">{captainLabel}</p>
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
              <p className="sidebar__nav-heading">Captain</p>
              {adminRoutes.map((route) => (
                <NavLink
                  key={route.label}
                  className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                  onClick={() => setMobileNavOpen(false)}
                  to={route.to}
                >
                  <CaptainMenuIcon type={route.icon} />
                  <span>{route.label}</span>
                </NavLink>
              ))}
            </div>
          ) : null}
        </nav>

        {membershipError ? (
          <p className="sidebar__empty">
            Team list is still syncing. Refresh after your Firestore index finishes building.
          </p>
        ) : null}

        <div className="sidebar__footer">
          <p className="sidebar__footer-title">{signedInLabel}</p>
          <strong>{user?.displayName ?? user?.email}</strong>
          <div className="sidebar__footer-actions">
            {memberships.length > 0 ? (
              <NavLink className="sidebar__footer-link" onClick={() => setMobileNavOpen(false)} to="/teams">
                My Teams
              </NavLink>
            ) : null}
            <NavLink className="sidebar__footer-link" onClick={() => setMobileNavOpen(false)} to="help">
              Help & Feedback
            </NavLink>
            {isAppAdmin ? (
              <NavLink
                className="sidebar__footer-link"
                onClick={() => setMobileNavOpen(false)}
                rel="noreferrer"
                target="_blank"
                to="/admin"
              >
                App Admin
              </NavLink>
            ) : null}
          </div>
          <button className="sidebar__signout" onClick={handleSignOut} type="button">
            Sign out
          </button>
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
