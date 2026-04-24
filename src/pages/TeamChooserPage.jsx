import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listMemberships } from '../lib/data';

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
      .then((items) => {
        if (!cancelled) {
          setMemberships(items);
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
          Welcome back. Pick the team you want to open, or join another team if the one you need
          is not listed here yet.
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
                <strong>{membership.teamName}</strong>
                <span>
                  {membership.clubSlug} · {membership.role}
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="hero__actions">
          <Link className="button button--ghost" to="/onboarding?mode=join">
            Team not listed? Join Team
          </Link>
        </div>
      </section>
    </div>
  );
}
