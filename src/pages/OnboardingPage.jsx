import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createTeam, joinTeamByCode, listMemberships } from '../lib/data';

export default function OnboardingPage() {
  const { isAuthenticated, isFirebaseConfigured, signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [memberships, setMemberships] = useState([]);

  const loadMemberships = useCallback(async () => {
    if (!user?.uid || !isFirebaseConfigured) {
      setMemberships([]);
      return;
    }

    try {
      const items = await listMemberships(user.uid);
      setMemberships(items);
    } catch (error) {
      setErrorMessage(error.message ?? 'Unable to load your teams yet.');
    }
  }, [isFirebaseConfigured, user?.uid]);

  useEffect(() => {
    loadMemberships();
  }, [loadMemberships]);

  async function handleCreateTeam(event) {
    event.preventDefault();

    if (!isAuthenticated) {
      await signInWithGoogle();
      return;
    }

    setBusyAction('create');
    setErrorMessage('');
    setStatusMessage('');

    try {
      const result = await createTeam({ teamName, user });
      setStatusMessage(`Team created. Share join code ${result.joinCode} with players.`);
      navigate(`/c/${result.clubSlug}/t/${result.teamSlug}`);
    } catch (error) {
      setErrorMessage(error.message ?? 'Unable to create the team right now.');
    } finally {
      setBusyAction('');
    }
  }

  async function handleJoinTeam(event) {
    event.preventDefault();

    if (!isAuthenticated) {
      await signInWithGoogle();
      return;
    }

    setBusyAction('join');
    setErrorMessage('');
    setStatusMessage('');

    try {
      const result = await joinTeamByCode({ code: joinCode, user });
      setStatusMessage('Team joined successfully.');
      navigate(`/c/${result.clubSlug}/t/${result.teamSlug}`);
    } catch (error) {
      setErrorMessage(error.message ?? 'Unable to join that team right now.');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">Onboarding</p>
        <h1>Create or join a team</h1>
        <p>
          This scaffold sets up the front door for club-approved team creation and join-by-code
          team access.
        </p>

        <div className="action-grid">
          <form className="mini-card form-card" onSubmit={handleCreateTeam}>
            <h2>Create team</h2>
            <p>
              Start with the team name. The app will create the Blackhawk club if it does not
              exist yet, then create the team, join code, captain membership, and linked player
              profile.
            </p>
            <label className="field">
              <span>Team name</span>
              <input
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="Hawks"
                type="text"
                value={teamName}
              />
            </label>
            <button
              className="button"
              disabled={!isFirebaseConfigured || busyAction === 'create'}
              type="submit"
            >
              {busyAction === 'create' ? 'Creating team...' : 'Create team'}
            </button>
          </form>

          <form className="mini-card form-card" onSubmit={handleJoinTeam}>
            <h2>Join with code</h2>
            <p>
              Players sign in, enter a captain-managed code or link, then link themselves to a
              team roster profile.
            </p>
            <label className="field">
              <span>Join code</span>
              <input
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="HAWK7F2"
                type="text"
                value={joinCode}
              />
            </label>
            <button
              className="button button--ghost"
              disabled={!isFirebaseConfigured || busyAction === 'join'}
              type="submit"
            >
              {busyAction === 'join' ? 'Joining team...' : 'Join team'}
            </button>
          </form>
        </div>

        {statusMessage ? <div className="notice notice--success">{statusMessage}</div> : null}
        {errorMessage ? <div className="notice notice--error">{errorMessage}</div> : null}
      </section>

      <section className="card">
        <p className="eyebrow">Your teams</p>
        {memberships.length > 0 ? (
          <div className="membership-list">
            {memberships.map((membership) => (
              <Link
                key={`${membership.clubSlug}-${membership.teamSlug}`}
                className="membership-card"
                to={`/c/${membership.clubSlug}/t/${membership.teamSlug}`}
              >
                <strong>{membership.teamName}</strong>
                <span>
                  {membership.clubSlug} · {membership.role}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <ul className="feature-list">
            <li>Hash-routed pages are wired for GitHub Pages.</li>
            <li>Protected team routes are ready for Firebase auth.</li>
            <li>Google users are synced into Firestore on sign-in.</li>
            <li>Create and join now use real Firestore writes.</li>
          </ul>
        )}

        <div className="notice notice--info">
          {isAuthenticated
            ? 'You are signed in. The next major step is tightening rules and replacing the placeholder team pages with live roster, schedule, news, and availability data.'
            : 'Sign in with Google first so the app can create your user profile and attach you to a team membership.'}
        </div>
      </section>
    </div>
  );
}
