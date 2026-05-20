import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  buildStandingsSummary,
  ensureUserActiveTeamContext,
  getMembership,
  getTeam,
  getUserProfileAvatarsByUid,
  getUserProfileData,
  isPlatformAdmin,
  listActiveMemberships,
  listGames,
  listMemberships,
  listPlayers,
  listTeamMembers,
  subscribeChallengeHub,
  subscribeTeamGames,
} from '../lib/data';
import {
  buildScheduleAttentionLabel,
  countScheduleAttentionGames,
  getScheduleLastViewedMs,
} from '../lib/scheduleAttention';
import { resolvePlayerAvatarUrl } from '../lib/profilePhotos';
import defaultTeamLogo from '../../default_team_logo.webp';
import pklUniverseWideLogo from '../../pkl_universe_wide_logo.webp';
import PlayerMenuIcon from './PlayerMenuIcon';

const primaryRoutes = [
  { icon: 'news', label: 'Home', to: 'news' },
  { icon: 'competition', label: 'Competition Hub', to: 'challenges' },
  { icon: 'matches', label: 'Matches', to: 'schedule' },
  { icon: 'standings', label: 'Standings', to: 'standings' },
  { icon: 'members', label: 'Teams', to: 'team' },
  { icon: 'events', label: 'Events', to: 'events' },
  { icon: 'activity', label: 'Activity', to: 'activity' },
];

const adminRoutes = [
  { icon: 'managePlayers', label: 'Manage Players', to: 'player-mgmt' },
  { icon: 'settings', label: 'Team Settings', to: 'settings' },
];

function canManageRole(role) {
  return role === 'captain' || role === 'coCaptain';
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
  const [userAvatarUrl, setUserAvatarUrl] = useState('');
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [teamNavSummary, setTeamNavSummary] = useState({
    activeMemberCount: 0,
    losses: 0,
    winPct: 0,
    wins: 0,
  });
  const [incomingChallengeCount, setIncomingChallengeCount] = useState(0);
  const [scheduleAttention, setScheduleAttention] = useState({
    needsSchedulingCount: 0,
    newScheduledCount: 0,
    total: 0,
  });
  const scheduleGamesRef = useRef([]);
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

    function handleScheduleViewed() {
      if (!clubSlug || !teamSlug) {
        return;
      }

      setScheduleAttention(
        countScheduleAttentionGames(
          scheduleGamesRef.current,
          getScheduleLastViewedMs(clubSlug, teamSlug),
        ),
      );
    }

    window.addEventListener('team-updated', handleTeamUpdated);
    window.addEventListener('schedule-viewed', handleScheduleViewed);

    return () => {
      window.removeEventListener('team-updated', handleTeamUpdated);
      window.removeEventListener('schedule-viewed', handleScheduleViewed);
    };
  }, [clubSlug, teamSlug]);

  useEffect(() => {
    if (!clubSlug || !teamSlug) {
      scheduleGamesRef.current = [];
      setScheduleAttention({
        needsSchedulingCount: 0,
        newScheduledCount: 0,
        total: 0,
      });
      return undefined;
    }

    const recomputeAttention = (games) => {
      scheduleGamesRef.current = games;
      setScheduleAttention(
        countScheduleAttentionGames(
          games,
          getScheduleLastViewedMs(clubSlug, teamSlug),
        ),
      );
    };

    return subscribeTeamGames({ clubSlug, teamSlug }, recomputeAttention, () => {
      scheduleGamesRef.current = [];
      setScheduleAttention({
        needsSchedulingCount: 0,
        newScheduledCount: 0,
        total: 0,
      });
    });
  }, [clubSlug, teamSlug]);

  useEffect(() => {
    if (!user?.uid) {
      setUserAvatarUrl('');
      return undefined;
    }

    let cancelled = false;

    getUserProfileAvatarsByUid([user.uid])
      .then((avatarMap) => {
        if (cancelled) {
          return;
        }

        setUserAvatarUrl(
          avatarMap[user.uid] ||
            resolvePlayerAvatarUrl({
              authPhotoUrl: user.photoURL ?? '',
              player: currentPlayer ?? {},
            }) ||
            user.photoURL ||
            '',
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setUserAvatarUrl(
          resolvePlayerAvatarUrl({
            authPhotoUrl: user.photoURL ?? '',
            player: currentPlayer ?? {},
          }) ||
            user.photoURL ||
            '',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [currentPlayer, teamRefreshKey, user?.photoURL, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !clubSlug || !teamSlug || isAppAdmin) {
      return undefined;
    }

    let cancelled = false;

    async function redirectToAuthorizedTeam() {
      const membership = await getMembership(clubSlug, teamSlug, user.uid, user);

      if (membership || cancelled) {
        return;
      }

      const [activeMemberships, userProfile] = await Promise.all([
        listActiveMemberships(user.uid),
        getUserProfileData(user.uid).catch(() => null),
      ]);

      if (cancelled) {
        return;
      }

      const routeSuffixMatch = location.pathname.match(/\/c\/[^/]+\/t\/[^/]+(?:\/(.*))?$/);
      const routeSuffix = routeSuffixMatch?.[1] || 'news';
      const targetMembership =
        activeMemberships.find(
          (item) =>
            item.clubSlug === userProfile?.lastActiveClubId &&
            item.teamSlug === userProfile?.lastActiveTeamId,
        ) ??
        (activeMemberships.length === 1 ? activeMemberships[0] : null);

      if (targetMembership) {
        navigate(`/c/${targetMembership.clubSlug}/t/${targetMembership.teamSlug}/${routeSuffix}`, {
          replace: true,
        });
        return;
      }

      if (activeMemberships.length > 1) {
        navigate('/teams', { replace: true });
        return;
      }

      if (activeMemberships.length === 0) {
        navigate('/onboarding', { replace: true });
      }
    }

    redirectToAuthorizedTeam().catch(() => {
      // Route correction should not block rendering.
    });

    return () => {
      cancelled = true;
    };
  }, [clubSlug, isAppAdmin, location.pathname, navigate, teamSlug, user]);

  useEffect(() => {
    if (!clubSlug || !teamSlug) {
      setActiveTeam(null);
      setActiveMembership(null);
      setCurrentPlayer(null);
      setIncomingChallengeCount(0);
      setTeamNavSummary({
        activeMemberCount: 0,
        losses: 0,
        winPct: 0,
        wins: 0,
      });
      return;
    }

    let cancelled = false;

    async function loadActiveTeamContext() {
      try {
        const [team, membership] = await Promise.all([
          getTeam(clubSlug, teamSlug),
          user?.uid ? getMembership(clubSlug, teamSlug, user.uid, user) : Promise.resolve(null),
        ]);

        if (cancelled) {
          return;
        }

        setActiveTeam(team);
        setActiveMembership(membership);

        const [members, players, games] = await Promise.all([
          listTeamMembers(clubSlug, teamSlug).catch(() => []),
          listPlayers(clubSlug, teamSlug).catch(() => []),
          listGames(clubSlug, teamSlug).catch(() => []),
        ]);

        if (cancelled) {
          return;
        }

        const currentPlayerRecord =
          players.find((player) => player.id === membership?.playerId) ??
          players.find((player) => player.uid === user?.uid || player.id === user?.uid) ??
          null;

        setCurrentPlayer(currentPlayerRecord);
        setTeamNavSummary(buildTeamNavSummary(members, games));
      } catch {
        if (!cancelled) {
          setActiveTeam(null);
          setActiveMembership(null);
          setCurrentPlayer(null);
          setTeamNavSummary({
            activeMemberCount: 0,
            losses: 0,
            winPct: 0,
            wins: 0,
          });
        }
      }
    }

    loadActiveTeamContext();

    return () => {
      cancelled = true;
    };
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
  const challengeClubSlug = isApprovedClubTeam ? activeTeam.approvedClubSlug : '';
  const visiblePrimaryRoutes = primaryRoutes.filter((route) => !route.requiresApprovedClub || isApprovedClubTeam);
  const userRoleLabel =
    currentMembership?.role === 'coCaptain'
      ? 'Co-captain'
      : canManage
        ? 'Captain'
        : 'Player';
  const userDisplayName = currentPlayer?.fullName || user?.displayName || user?.email || 'Player';
  const userInitial = userDisplayName.trim().charAt(0).toUpperCase() || 'P';
  const scheduleAttentionLabel = buildScheduleAttentionLabel(scheduleAttention);

  useEffect(() => {
    if (!challengeClubSlug || !clubSlug || !teamSlug) {
      setIncomingChallengeCount(0);
      return undefined;
    }

    return subscribeChallengeHub(
      { challengeClubSlug, clubSlug, teamSlug },
      ({ teamChallenges }) => {
        const incomingCount = teamChallenges.filter(
          (challenge) =>
            challenge.status === 'open' &&
            challenge.visibility === 'targeted' &&
            challenge.targetTeamClubSlug === clubSlug &&
            challenge.targetTeamSlug === teamSlug,
        ).length;
        setIncomingChallengeCount(incomingCount);
      },
      () => {
        setIncomingChallengeCount(0);
      },
    );
  }, [challengeClubSlug, clubSlug, teamSlug]);

  useEffect(() => {
    if (!user?.uid || !clubSlug || !teamSlug || !currentMembership) {
      return;
    }

    ensureUserActiveTeamContext({
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
                  <strong>{teamNavSummary.wins}-{teamNavSummary.losses}</strong>
                  W-L
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
            <p className="sidebar__nav-heading">Main</p>
            {visiblePrimaryRoutes.map((route) => (
              <NavLink
                key={route.label}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                onClick={() => setMobileNavOpen(false)}
                to={route.to}
              >
                <PlayerMenuIcon type={route.icon} />
                <span>{route.label}</span>
                {route.icon === 'competition' && incomingChallengeCount > 0 ? (
                  <span className="nav-link__badge" aria-label={`${incomingChallengeCount} open challenges received`}>
                    {incomingChallengeCount > 9 ? '9+' : incomingChallengeCount}
                  </span>
                ) : null}
                {route.icon === 'matches' && scheduleAttention.total > 0 ? (
                  <span
                    className="nav-link__badge nav-link__badge--schedule"
                    aria-label={scheduleAttentionLabel || `${scheduleAttention.total} matches need attention`}
                  >
                    {scheduleAttention.total > 9 ? '9+' : scheduleAttention.total}
                  </span>
                ) : null}
              </NavLink>
            ))}
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

          {canManage ? (
            <div className="sidebar__nav-group">
              <p className="sidebar__nav-heading">Team Management</p>
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
