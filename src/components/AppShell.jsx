import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
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
  { label: 'News Feed', to: 'news' },
  { label: 'Team Members', to: 'team' },
  { label: 'Team Matches', to: 'schedule' },
  { label: 'Team Standing', to: 'team-standing' },
  { label: 'Club Hub', requiresApprovedClub: true, to: 'club-teams' },
  { label: 'My Profile', to: 'profile' },
];

const adminRoutes = [
  { label: 'Club Challenges', to: 'challenges' },
  { label: 'Manage Matches', to: 'schedule-scores' },
  { label: 'Build Rosters', to: 'roster-mgmt' },
  { label: 'Manage Players', to: 'player-mgmt' },
  { label: 'Team Settings', to: 'settings' },
];

function canManageRole(role) {
  return role === 'captain' || role === 'coCaptain';
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
  const navigate = useNavigate();
  const { clubSlug, teamSlug } = useParams();
  const [memberships, setMemberships] = useState([]);
  const [membershipError, setMembershipError] = useState('');
  const [activeTeam, setActiveTeam] = useState(null);
  const [activeMembership, setActiveMembership] = useState(null);
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [captainLabel, setCaptainLabel] = useState('Captain: TBD');
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

  async function handleSignOut() {
    await signOutUser();
    navigate('/', { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
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
                to={route.to}
              >
                {route.label}
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
                  to={route.to}
                >
                  {route.label}
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
              <NavLink className="sidebar__footer-link" to="/teams">
                My Teams
              </NavLink>
            ) : null}
            <NavLink className="sidebar__footer-link" to="help">
              Help & Feedback
            </NavLink>
            {isAppAdmin ? (
              <NavLink className="sidebar__footer-link" rel="noreferrer" target="_blank" to="/admin">
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
