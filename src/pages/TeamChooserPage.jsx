import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTeam, listMemberships, listPlayers, listTeamMembers } from '../lib/data';
import pklUniverseLogo from '../../pkl_universe_logo.png';

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

export default function TeamChooserPage() {
  const { isFirebaseConfigured, user } = useAuth();
  const [memberships, setMemberships] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingTeams, setLoadingTeams] = useState(true);

  useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured) {
      setMemberships([]);
      setLoadingTeams(false);
      return;
    }

    let cancelled = false;

    listMemberships(user.uid)
      .then(async (items) => {
        const enrichedItems = await Promise.all(
          items.map(async (membership) => {
            try {
              const [team, members, players] = await Promise.all([
                getTeam(membership.clubSlug, membership.teamSlug),
                listTeamMembers(membership.clubSlug, membership.teamSlug),
                listPlayers(membership.clubSlug, membership.teamSlug),
              ]);

              return {
                ...membership,
                captainLabel: buildCaptainLabel(members, players),
                logoUrl: team?.logoUrl || '',
              };
            } catch {
              return {
                ...membership,
                captainLabel: 'Captain: TBD',
                logoUrl: '',
              };
            }
          }),
        );

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
        <p className="eyebrow">Your teams</p>
        <h1>Choose a team</h1>
        <p>
          Welcome back. Click on the team below you wish to access.
        </p>

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
                  src={membership.logoUrl || pklUniverseLogo}
                />
                <div className="membership-card__content">
                  <strong>{membership.teamName}</strong>
                  <span>{membership.captainLabel}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

      </section>

      <div className="team-entry__footer">
        <Link className="button button--ghost" to="/">
          Return to Home
        </Link>
      </div>
    </div>
  );
}
