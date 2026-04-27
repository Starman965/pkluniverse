import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createTeam, joinTeamByCode, listMemberships } from '../lib/data';
import { clearOnboardingIntent, readOnboardingIntent, writeOnboardingIntent } from '../lib/onboardingIntent';
import createTeamImage from '../../create_team.png';
import joinTeamImage from '../../join_team.png';

const MODE_CONTENT = {
  create: {
    bodyCopy: 'Start with a team name and we will handle the setup.',
    buttonLabel: 'Create team',
    helperCopy: 'We only ask for Google sign-in when you continue, then bring you right back.',
    image: createTeamImage,
    imageAlt: 'Captain setting up a new pickleball team',
    imageClassName: 'onboarding-card__image--create',
    inputLabel: 'New Team',
    introLabel: 'New captain',
    pageTitle: 'Create your team',
    placeholder: 'Enter Your New Team Name',
    signedOutLabel: 'Continue with Google',
    submitHeading: 'Create team',
    submitText: "You're about to create a new team and will be the captain of this new team.",
    successText: (result) => `Team created. Share join code ${result.joinCode} with players.`,
    supportEyebrow: 'What happens next',
  },
  join: {
    bodyCopy: "Use your captain's code to join the right team.",
    buttonLabel: 'Join team',
    image: joinTeamImage,
    imageAlt: 'Player joining a pickleball team',
    imageClassName: 'onboarding-card__image--join',
    inputLabel: 'Team code',
    introLabel: 'New player',
    pageTitle: 'Join a team',
    placeholder: 'Enter team code',
    signedOutLabel: 'Continue with Google',
    submitHeading: 'Enter join code',
    submitText: "Enter the code provided to you by the team's captain or other team member.",
    successText: () => 'Team joined successfully.',
    supportEyebrow: 'Before you join',
  },
};

export default function TeamEntryPage({ mode }) {
  const content = MODE_CONTENT[mode] ?? MODE_CONTENT.join;
  const { isAuthenticated, isFirebaseConfigured, loading, signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [memberships, setMemberships] = useState([]);
  const entryValue = mode === 'create' ? teamName.trim() : joinCode.trim();
  const joinCodeIsValid = mode !== 'join' || entryValue.length === 5;
  const canSubmit = Boolean(entryValue) && joinCodeIsValid;

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

  useEffect(() => {
    if (mode !== 'join') {
      return;
    }

    const nextJoinCode = (searchParams.get('code') ?? '').trim().toUpperCase();

    if (nextJoinCode) {
      setJoinCode(nextJoinCode);
    }
  }, [mode, searchParams]);

  async function submitCreateTeam(nextTeamName) {
    setBusyAction('create');
    setErrorMessage('');
    setStatusMessage('');

    try {
      const result = await createTeam({ teamName: nextTeamName, user });
      clearOnboardingIntent();
      setStatusMessage(content.successText(result));
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
      setStatusMessage(content.successText(result));
      navigate(`/c/${result.clubSlug}/t/${result.teamSlug}/news`);
    } catch (error) {
      setErrorMessage(error.message ?? 'Unable to join that team right now.');
    } finally {
      setBusyAction('');
    }
  }

  useEffect(() => {
    if (loading || !isAuthenticated || busyAction) {
      return;
    }

    const intent = readOnboardingIntent();

    if (!intent?.mode || intent.mode !== mode) {
      return;
    }

    if (mode === 'create' && intent.teamName) {
      setTeamName(intent.teamName);
      clearOnboardingIntent();
      submitCreateTeam(intent.teamName);
      return;
    }

    if (mode === 'join' && intent.joinCode) {
      clearOnboardingIntent();
      const nextJoinCode = intent.joinCode.trim().toUpperCase();

      if (nextJoinCode.length !== 5) {
        setJoinCode(nextJoinCode);
        setErrorMessage('Enter the 5-character team code.');
        return;
      }

      setJoinCode(nextJoinCode);
      submitJoinTeam(nextJoinCode);
    }
  }, [busyAction, isAuthenticated, loading, mode]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!entryValue) {
      setStatusMessage('');
      setErrorMessage(mode === 'create' ? 'Enter a team name first.' : 'Enter a join code first.');
      return;
    }

    if (mode === 'join' && !joinCodeIsValid) {
      setStatusMessage('');
      setErrorMessage('Enter the 5-character team code.');
      return;
    }

    if (!isAuthenticated) {
      writeOnboardingIntent(
        mode === 'create' ? { mode: 'create', teamName: entryValue } : { joinCode: entryValue.toUpperCase(), mode: 'join' },
      );
      await signInWithGoogle();
      return;
    }

    if (mode === 'create') {
      await submitCreateTeam(entryValue);
      return;
    }

    await submitJoinTeam(entryValue.toUpperCase());
  }

  return (
    <div className="auth-page">
      <section className="card auth-card">
        <div className="team-entry__intro">
          <p className="eyebrow">{content.introLabel}</p>
          <h1>{content.pageTitle}</h1>
          <p className="marketing-section__copy team-entry__description">{content.bodyCopy}</p>
        </div>

        <div className="action-grid onboarding-flow">
          <div className="mini-card onboarding-card onboarding-card--visual">
            <img
              alt={content.imageAlt}
              className={`onboarding-card__image ${content.imageClassName}`}
              src={content.image}
            />
          </div>

          <form className="mini-card form-card onboarding-card team-entry__form" onSubmit={handleSubmit}>
            <h2>{content.submitHeading}</h2>
            <p className="team-entry__form-copy">{content.submitText}</p>

            <label className="field">
              <span>{content.inputLabel}</span>
              <input
                onChange={(event) =>
                  mode === 'create'
                    ? setTeamName(event.target.value)
                    : setJoinCode(event.target.value.trim().toUpperCase())
                }
                placeholder={content.placeholder}
                maxLength={mode === 'join' ? 5 : undefined}
                required
                type="text"
                value={mode === 'create' ? teamName : joinCode}
              />
            </label>

            {!isFirebaseConfigured ? (
              <div className="notice notice--warning">
                Add your Firebase web app values to <code>.env</code> before sign-in can work.
              </div>
            ) : null}

            <button
              className={mode === 'create' ? 'button' : 'button button--ghost'}
              disabled={!isFirebaseConfigured || loading || busyAction === mode || !canSubmit}
              type="submit"
            >
              {loading
                ? 'Checking sign-in...'
                : busyAction === mode
                ? mode === 'create'
                  ? 'Creating team...'
                  : 'Joining team...'
                : isAuthenticated
                  ? content.buttonLabel
                  : content.signedOutLabel}
            </button>
          </form>
        </div>

        {statusMessage ? <div className="notice notice--success">{statusMessage}</div> : null}
        {errorMessage ? <div className="notice notice--error">{errorMessage}</div> : null}

        {memberships.length > 0 ? (
          <div className="notice notice--info team-entry__chooser-note">
            <span>Already on a team?</span>
            <Link className="button button--ghost" to="/teams">
              Open team chooser
            </Link>
          </div>
        ) : null}
      </section>

      <div className="team-entry__footer">
        <Link className="button button--ghost" to="/">
          Return to HomePage
        </Link>
      </div>
    </div>
  );
}
