import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listMemberships } from '../lib/data';

export default function OnboardingPage() {
  const { isFirebaseConfigured, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [memberships, setMemberships] = useState([]);

  const requestedMode = searchParams.get('mode');

  useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured) {
      setMemberships([]);
      return;
    }

    let cancelled = false;

    listMemberships(user.uid)
      .then((items) => {
        if (!cancelled) {
          setMemberships(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMemberships([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isFirebaseConfigured, user?.uid]);

  if (requestedMode === 'create') {
    return <Navigate replace to="/create" />;
  }

  if (requestedMode === 'join') {
    return <Navigate replace to="/join" />;
  }

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">Choose your path</p>
        <h1>How would you like to get started?</h1>
        <p className="marketing-section__copy">
          Create a new team if you are the captain, or join a team if someone already sent you a code.
        </p>

        <div className="stack">
          <Link className="button" to="/create">
            Create a Team
          </Link>
          <Link className="button button--ghost" to="/join">
            Join a Team
          </Link>
          <Link className="button button--ghost" to="/auth">
            Log In
          </Link>
          <Link className="button button--ghost" rel="noreferrer" target="_blank" to="/admin">
            App Admin
          </Link>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">{memberships.length > 0 ? 'Already on a team' : 'Quick help'}</p>
        {memberships.length > 0 ? (
          <div className="stack">
            <h2>Open one of your teams</h2>
            <p>You already have access to PKL Universe, so you can jump straight back in.</p>
            <Link className="button button--ghost" to="/teams">
              Open team chooser
            </Link>
          </div>
        ) : (
          <div className="stack">
            <h2>Not sure which one to pick?</h2>
            <ul className="feature-list">
              <li>Create a Team if you are setting up the team and inviting players.</li>
              <li>Join a Team if a captain already gave you a code.</li>
              <li>Log In if you have used PKL Universe before.</li>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
