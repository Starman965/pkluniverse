import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createTeam, joinTeamByCode, listMemberships } from '../lib/data';

const ONBOARDING_INTENT_KEY = 'pkl-onboarding-intent';

function readOnboardingIntent() {
  try {
    const rawValue = window.sessionStorage.getItem(ONBOARDING_INTENT_KEY);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

function writeOnboardingIntent(intent) {
  window.sessionStorage.setItem(ONBOARDING_INTENT_KEY, JSON.stringify(intent));
}

function clearOnboardingIntent() {
  window.sessionStorage.removeItem(ONBOARDING_INTENT_KEY);
}

export default function OnboardingPage() {
  const { isAuthenticated, isFirebaseConfigured, signInWithGoogle, signOutUser, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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

  const requestedMode = searchParams.get('mode');
  const mode = requestedMode === 'create' || requestedMode === 'join' ? requestedMode : '';

  async function submitCreateTeam(nextTeamName) {
    setBusyAction('create');
    setErrorMessage('');
    setStatusMessage('');

    try {
      const result = await createTeam({ teamName: nextTeamName, user });
      clearOnboardingIntent();
      setStatusMessage(`Team created. Share join code ${result.joinCode} with players.`);
      navigate(`/c/${result.clubSlug}/t/${result.teamSlug}/news`);
    } catch (error) {
      setErrorMessage(error.message ?? 'Unable to create the team right now.');
    } finally {
      setBusyAction('');
    }
  }

  async function submitJoinTeam(nextJoinCode) {
    setBusyAction('join');
    setErrorMessage('');
    setStatusMessage('');

    try {
      const result = await joinTeamByCode({ code: nextJoinCode, user });
      clearOnboardingIntent();
      setStatusMessage('Team joined successfully.');
      navigate(`/c/${result.clubSlug}/t/${result.teamSlug}/news`);
    } catch (error) {
      setErrorMessage(error.message ?? 'Unable to join that team right now.');
    } finally {
      setBusyAction('');
    }
  }

  useEffect(() => {
    if (!isAuthenticated || busyAction) {
      return;
    }

    const intent = readOnboardingIntent();

    if (!intent?.mode) {
      return;
    }

    if (intent.mode === 'create' && intent.teamName) {
      setTeamName(intent.teamName);
      clearOnboardingIntent();
      submitCreateTeam(intent.teamName);
      return;
    }

    if (intent.mode === 'join' && intent.joinCode) {
      setJoinCode(intent.joinCode);
      clearOnboardingIntent();
      submitJoinTeam(intent.joinCode);
    }
  }, [busyAction, isAuthenticated]);

  async function handleCreateTeam(event) {
    event.preventDefault();

    if (!isAuthenticated) {
      writeOnboardingIntent({ mode: 'create', teamName });
      await signInWithGoogle();
      return;
    }

    await submitCreateTeam(teamName);
  }

  async function handleJoinTeam(event) {
    event.preventDefault();

    if (!isAuthenticated) {
      writeOnboardingIntent({ joinCode, mode: 'join' });
      await signInWithGoogle();
      return;
    }

    await submitJoinTeam(joinCode);
  }

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">Onboarding</p>
        <h1>
          {mode === 'join' ? 'Join a team' : mode === 'create' ? 'Create a team' : 'Get started'}
        </h1>
        <p>
          {mode === 'join'
            ? 'Enter a captain-managed join code to become part of an existing team.'
            : mode === 'create'
              ? 'Create a new team, become the captain, and generate the first join code for players.'
              : 'Choose whether you are creating a new team or joining one with a captain-managed code.'}
        </p>

        <div className="availability-tabs" aria-label="Onboarding mode">
          <button
            className={`availability-tabs__button ${mode === 'create' ? 'availability-tabs__button--active' : ''}`}
            onClick={() => setSearchParams({ mode: 'create' })}
            type="button"
          >
            Create Team
          </button>
          <button
            className={`availability-tabs__button ${mode === 'join' ? 'availability-tabs__button--active' : ''}`}
            onClick={() => setSearchParams({ mode: 'join' })}
            type="button"
          >
            Join Team
          </button>
        </div>

        <div className="action-grid">
          {mode === 'create' ? (
            <form className="mini-card form-card onboarding-card" onSubmit={handleCreateTeam}>
              <h2>Create team</h2>
              <p>
                Start with the team name. PKL Universe will create the team, captain membership,
                player profile, and first join code in one step.
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
                {busyAction === 'create'
                  ? 'Creating team...'
                  : isAuthenticated
                    ? 'Create team'
                    : 'Sign in to create'}
              </button>
            </form>
          ) : mode === 'join' ? (
            <form className="mini-card form-card onboarding-card" onSubmit={handleJoinTeam}>
              <h2>Join with code</h2>
              <p>
                Players sign in, enter the captain&apos;s join code, and get attached to the team in
                one flow.
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
                {busyAction === 'join'
                  ? 'Joining team...'
                  : isAuthenticated
                    ? 'Join team'
                    : 'Sign in to join'}
              </button>
            </form>
          ) : (
            <div className="mini-card form-card onboarding-card onboarding-card--neutral">
              <h2>Choose your path</h2>
              <p>
                New captains should create a team. Players who received a join code should choose
                Join Team.
              </p>
              <div className="stack">
                <button className="button" onClick={() => setSearchParams({ mode: 'create' })} type="button">
                  Create Team
                </button>
                <button
                  className="button button--ghost"
                  onClick={() => setSearchParams({ mode: 'join' })}
                  type="button"
                >
                  Join Team
                </button>
              </div>
            </div>
          )}
        </div>

        {statusMessage ? <div className="notice notice--success">{statusMessage}</div> : null}
        {errorMessage ? <div className="notice notice--error">{errorMessage}</div> : null}
      </section>

      <section className="card">
        <p className="eyebrow">{memberships.length > 0 ? 'Returning user' : 'What happens next'}</p>
        {memberships.length > 0 ? (
          <div className="stack">
            <p>You already belong to one or more teams. Use the chooser to jump back in.</p>
            <Link className="button button--ghost" to="/teams">
              Open team chooser
            </Link>
          </div>
        ) : (
          <ul className="feature-list">
            <li>Create Team is for new captains starting a team for the first time.</li>
            <li>Join Team is for players entering a captain-managed join code.</li>
            <li>Login is for returning users who already belong to one or more teams.</li>
            <li>Your create or join action will continue after Google sign-in.</li>
          </ul>
        )}

        <div className="notice notice--info">
          {isAuthenticated
            ? 'You are signed in. Choose the path that matches what you want to do next.'
            : 'You can start a team or join one from here. If sign-in is required, PKL Universe will continue the flow after Google auth.'}
        </div>

        {isAuthenticated ? (
          <div className="stack">
            <button className="button button--ghost" onClick={signOutUser} type="button">
              Sign out
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
