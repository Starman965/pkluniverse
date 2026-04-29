import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import TeamDivisionLabel from '../components/TeamDivisionLabel';
import { useAuth } from '../context/AuthContext';
import { getTeam, getUserProfileData, isPlatformAdmin, listClubs, listMemberships, listPlayers, listTeamMembers } from '../lib/data';
import { getVisibleTeamDivisionLabel } from '../lib/teamDivision';
import createTeamImage from '../../create_a_team.webp';
import defaultTeamLogo from '../../default_team_logo.webp';

function buildCaptainLabel(members, players) {
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const captainNames = members
    .filter((member) => member.role === 'captain' || member.role === 'coCaptain')
    .map((member) => playerMap.get(member.playerId)?.fullName)
    .filter(Boolean);

  if (!captainNames.length) {
    return 'Captain: TBD';
  }

  if (captainNames.length === 1) {
    return `Captain: ${captainNames[0]}`;
  }

  return `Captains: ${captainNames.join(', ')}`;
}

function buildClubLabel(team, clubNameBySlug) {
  if (team?.affiliationStatus === 'approved' && team.approvedClubSlug) {
    return `Club: ${clubNameBySlug.get(team.approvedClubSlug) ?? team.approvedClubSlug}`;
  }

  return 'Club: Independent';
}

function buildMemberCountLabel(members) {
  const memberCount = members.length;

  return `Members: ${memberCount}`;
}

export default function TeamChooserPage() {
  const { isFirebaseConfigured, user } = useAuth();
  const [memberships, setMemberships] = useState([]);
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastActiveTeam, setLastActiveTeam] = useState(null);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured) {
      setIsAppAdmin(false);
      return;
    }

    isPlatformAdmin(user.uid, user.email).then(setIsAppAdmin).catch(() => {
      setIsAppAdmin(false);
    });
  }, [isFirebaseConfigured, user?.email, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured) {
      setMemberships([]);
      setLastActiveTeam(null);
      setLoadingTeams(false);
      return;
    }

    let cancelled = false;

    listMemberships(user.uid)
      .then(async (items) => {
        const [clubs, userProfile] = await Promise.all([
          listClubs({ includeIndependent: true }).catch(() => []),
          getUserProfileData(user.uid).catch(() => null),
        ]);
        const clubNameBySlug = new Map(
          clubs.map((club) => [club.slug, club.slug === 'independent' ? 'Independent' : club.name]),
        );
        const enrichedItems = (await Promise.all(
          items.map(async (membership) => {
            try {
              const [team, members, players] = await Promise.all([
                getTeam(membership.clubSlug, membership.teamSlug),
                listTeamMembers(membership.clubSlug, membership.teamSlug),
                listPlayers(membership.clubSlug, membership.teamSlug),
              ]);

              if ((team?.status ?? 'active') !== 'active') {
                return null;
              }

              return {
                ...membership,
                captainLabel: buildCaptainLabel(members, players),
                clubLabel: buildClubLabel(team, clubNameBySlug),
                logoUrl: team?.logoUrl || '',
                memberCountLabel: buildMemberCountLabel(members),
                teamDivision: team?.teamDivision ?? '',
                teamName: team?.name || membership.teamName,
              };
            } catch {
              return {
                ...membership,
                captainLabel: 'Captain: TBD',
                clubLabel: 'Club: Independent',
                logoUrl: '',
                memberCountLabel: 'Members: 0',
              };
            }
          }),
        )).filter(Boolean);

        if (!cancelled) {
          setMemberships(enrichedItems);
          setLastActiveTeam(
            enrichedItems.find(
              (membership) =>
                membership.clubSlug === userProfile?.lastActiveClubId &&
                membership.teamSlug === userProfile?.lastActiveTeamId,
            ) ?? null,
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error.message ?? 'Unable to load your teams right now.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTeams(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isFirebaseConfigured, user?.uid]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    }

    document.body.classList.add('hub-nav-open');
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('hub-nav-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  if (!loadingTeams && memberships.length === 0) {
    return <Navigate replace to="/onboarding" />;
  }

  return (
    <div className="auth-page standalone-mobile-page">
      <button
        aria-label="Close page menu"
        className="hub-nav-overlay"
        hidden={!mobileMenuOpen}
        onClick={() => setMobileMenuOpen(false)}
        type="button"
      />

      <header className="hub-topbar standalone-mobile-topbar">
        <button
          aria-controls="standalone-page-menu"
          aria-expanded={mobileMenuOpen}
          aria-label="Open page menu"
          className="hub-nav-toggle"
          onClick={() => setMobileMenuOpen((current) => !current)}
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
            <strong>My Teams</strong>
          </div>
        </div>
      </header>

      <aside
        id="standalone-page-menu"
        aria-label="Page navigation"
        className={`sidebar mobile-page-menu ${mobileMenuOpen ? 'sidebar--open' : ''}`}
      >
        <div className="sidebar__header">
          <div className="sidebar__team-card">
            <img alt="PKL Universe" className="sidebar__team-logo" src={defaultTeamLogo} />
            <div className="sidebar__team-copy">
              <h1 className="sidebar__team-title">My Teams</h1>
              <p className="sidebar__team-captain">Choose where to go next</p>
            </div>
          </div>
        </div>
        <nav className="sidebar__nav">
          <div className="sidebar__nav-group">
            {lastActiveTeam ? (
              <Link
                className="nav-link nav-link--active"
                onClick={() => setMobileMenuOpen(false)}
                to={`/c/${lastActiveTeam.clubSlug}/t/${lastActiveTeam.teamSlug}/news`}
              >
                Back to Team Hub
              </Link>
            ) : null}
            <Link className="nav-link" onClick={() => setMobileMenuOpen(false)} to="/create">
              Create a Team
            </Link>
            {isAppAdmin ? (
              <Link className="nav-link" onClick={() => setMobileMenuOpen(false)} rel="noreferrer" target="_blank" to="/admin">
                App Admin
              </Link>
            ) : null}
            <Link className="nav-link" onClick={() => setMobileMenuOpen(false)} to="/">
              Return to Home
            </Link>
          </div>
        </nav>
      </aside>

      <section className="card auth-card team-chooser">
        <div className="team-chooser__header">
          <div className="team-chooser__intro">
            <p className="eyebrow">Your teams</p>
            <h1>Choose a team</h1>
            <p>Welcome back. Click on the team below you wish to access.</p>
          </div>

          <Link className="team-chooser__create-card" to="/create">
            <img alt="" aria-hidden="true" decoding="async" loading="lazy" src={createTeamImage} />
            <span>
              <strong>Create a team</strong>
              <small>Start another team hub and invite players.</small>
            </span>
          </Link>
        </div>

        {errorMessage ? <div className="notice notice--error">{errorMessage}</div> : null}

        {loadingTeams ? (
          <div className="state-panel">
            <p>Loading your teams...</p>
          </div>
        ) : (
          <div className="membership-list">
            {memberships.map((membership) => (
              <Link
                key={`${membership.clubSlug}-${membership.teamSlug}`}
                className="membership-card"
                to={`/c/${membership.clubSlug}/t/${membership.teamSlug}/news`}
              >
                <img
                  alt={`${membership.teamName} logo`}
                  className="membership-card__logo"
                  decoding="async"
                  loading="lazy"
                  src={membership.logoUrl || defaultTeamLogo}
                />
                <div className="membership-card__content">
                  <strong>{membership.teamName}</strong>
                  <span>{membership.captainLabel}</span>
                  <span>{membership.clubLabel}</span>
                  <span>{membership.memberCountLabel}</span>
                  {getVisibleTeamDivisionLabel(membership) ? (
                    <TeamDivisionLabel className="membership-card__division" value={membership.teamDivision} />
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}

      </section>

      <div className="team-entry__footer">
        {lastActiveTeam ? (
          <Link className="button" to={`/c/${lastActiveTeam.clubSlug}/t/${lastActiveTeam.teamSlug}/news`}>
            Back to Team Hub
          </Link>
        ) : null}
        {isAppAdmin ? (
          <Link className="button button--ghost" rel="noreferrer" target="_blank" to="/admin">
            App Admin
          </Link>
        ) : null}
        <Link className="button button--ghost" to="/">
          Return to Home
        </Link>
      </div>
    </div>
  );
}
