import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTeam, getUserProfileData, listMemberships } from '../lib/data';
import loginNowImage from '../../login_now.webp';

function buildTeamPath(membership) {
  return `/c/${membership.clubSlug}/t/${membership.teamSlug}/news`;
}

export default function AuthPage() {
  const {
    authError,
    isAuthenticated,
    isFirebaseConfigured,
    loading,
    signInWithGoogle,
    signOutUser,
    user,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [redirectMessage, setRedirectMessage] = useState('');

  useEffect(() => {
    if (!isAuthenticated || !user?.uid) {
      return;
    }

    if (location.state?.from) {
      navigate(location.state.from, { replace: true });
      return;
    }

    let cancelled = false;

    Promise.all([listMemberships(user.uid), getUserProfileData(user.uid).catch(() => null)])
      .then(async ([items, userProfile]) => {
        if (cancelled) {
          return;
        }

        const activeItems = (await Promise.all(
          items.map(async (membership) => {
            const team = await getTeam(membership.clubSlug, membership.teamSlug).catch(() => null);
            return (team?.status ?? 'active') === 'active' ? membership : null;
          }),
        )).filter(Boolean);

        if (cancelled) {
          return;
        }

        if (activeItems.length === 1) {
          setRedirectMessage('Signed in. Opening your team...');
          navigate(buildTeamPath(activeItems[0]), { replace: true });
          return;
        }

        const lastActiveMembership =
          activeItems.find(
            (membership) =>
              membership.clubSlug === userProfile?.lastActiveClubId &&
              membership.teamSlug === userProfile?.lastActiveTeamId,
          ) ?? null;

        if (lastActiveMembership) {
          setRedirectMessage('Signed in. Returning you to your last team...');
          navigate(buildTeamPath(lastActiveMembership), { replace: true });
          return;
        }

        if (activeItems.length > 1) {
          setRedirectMessage('Signed in. Opening your teams...');
          navigate('/teams', { replace: true });
          return;
        }

        setRedirectMessage('Signed in. Choose whether to join or create a team.');
        navigate('/onboarding', { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          navigate('/teams', { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, location.state, navigate, user?.uid]);

  async function handleSignIn() {
    try {
      await signInWithGoogle();
    } catch {
      // Auth state and error copy are already managed in context.
    }
  }

  async function handleSignOut() {
    await signOutUser();
    navigate('/', { replace: true });
  }

  return (
    <div className="auth-page">
      <section className="card auth-card">
        <div className="team-entry__intro">
          <p className="eyebrow">Account access</p>
          <h1>Welcome to PKL Universe</h1>
          <p className="marketing-section__copy team-entry__description">
            Continue with Google to access your teams. If you are new, we will create your PKL Universe account and
            help you join or create a team.
          </p>
        </div>

        <div className="action-grid onboarding-flow">
          <div className="mini-card onboarding-card onboarding-card--visual">
            <img
              alt="Login to PKL Universe"
              className="onboarding-card__image onboarding-card__image--create"
              decoding="async"
              loading="lazy"
              src={loginNowImage}
            />
          </div>

          <div className="mini-card form-card onboarding-card team-entry__form">
            <h2>Sign in or create account</h2>
            <p className="team-entry__form-copy">
              Use your Google account to continue. New players get a PKL Universe account automatically, then choose
              whether to join a roster or create a team.
            </p>

            {!isFirebaseConfigured && (
              <div className="notice notice--warning">
                Add your Firebase web app values to <code>.env</code> before sign-in can work.
              </div>
            )}

            {authError && <div className="notice notice--error">{authError}</div>}

            {isAuthenticated ? (
              <div className="notice notice--success">
                Signed in as <strong>{user?.displayName ?? user?.email}</strong>.{' '}
                {redirectMessage || 'Redirecting to the next step...'}
              </div>
            ) : null}

            <button
              className="button"
              disabled={!isFirebaseConfigured || loading}
              onClick={handleSignIn}
              type="button"
            >
              {loading ? 'Checking sign-in...' : 'Continue with Google'}
            </button>

            {isAuthenticated ? (
              <button className="button button--ghost" onClick={handleSignOut} type="button">
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="team-entry__footer">
        <Link className="button button--ghost" to="/">
          Return to HomePage
        </Link>
      </div>
    </div>
  );
}
