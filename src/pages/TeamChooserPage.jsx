import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import TeamDivisionLabel from '../components/TeamDivisionLabel';
import { useAuth } from '../context/AuthContext';
import { getTeam, isPlatformAdmin, listClubs, listMemberships, listPlayers, listTeamMembers } from '../lib/data';
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
  const [loadingTeams, setLoadingTeams] = useState(true);

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
      setLoadingTeams(false);
      return;
    }

    let cancelled = false;

    listMemberships(user.uid)
      .then(async (items) => {
        const clubs = await listClubs({ includeIndependent: true }).catch(() => []);
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

  if (!loadingTeams && memberships.length === 0) {
    return <Navigate replace to="/onboarding" />;
  }

  return (
    <div className="auth-page">
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
