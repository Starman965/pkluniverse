import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listMemberships } from '../lib/data';

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

    if (location.state?.from?.pathname) {
      navigate(location.state.from.pathname, { replace: true });
      return;
    }

    let cancelled = false;

    listMemberships(user.uid)
      .then((items) => {
        if (cancelled) {
          return;
        }

        if (items.length > 0) {
          setRedirectMessage('Signed in. Redirecting to your teams...');
          navigate('/teams', { replace: true });
          return;
        }

        setRedirectMessage('Signed in. Redirecting to onboarding...');
        navigate('/onboarding', { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          navigate('/onboarding', { replace: true });
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

  return (
    <div className="auth-page">
      <section className="card auth-card">
        <div className="auth-card__intro">
          <p className="eyebrow">Welcome back</p>
          <h1>Sign in to PKL Universe</h1>
          <p className="auth-card__copy">
            Sign in with Google to create a team, join with a captain&apos;s code, or get back to the
            teams you already belong to.
          </p>
        </div>

        <div className="auth-card__benefits">
          <div className="auth-card__benefit">
            <strong>Create Team</strong>
            <span>Start a new team and become its captain.</span>
          </div>
          <div className="auth-card__benefit">
            <strong>Join Team</strong>
            <span>Use a join code from your captain to get access.</span>
          </div>
          <div className="auth-card__benefit">
            <strong>Return to your teams</strong>
            <span>Jump back into the teams you already manage or play on.</span>
          </div>
        </div>

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

        <div className="stack auth-card__actions">
          <button
            className="button"
            disabled={!isFirebaseConfigured || loading}
            onClick={handleSignIn}
            type="button"
          >
            {loading ? 'Checking sign-in...' : 'Continue with Google'}
          </button>

          <Link className="button button--ghost" to="/">
            Back to website
          </Link>

          {isAuthenticated ? (
            <button className="button button--ghost" onClick={signOutUser} type="button">
              Sign out
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
