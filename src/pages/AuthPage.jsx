import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { authError, isAuthenticated, isFirebaseConfigured, loading, signInWithGoogle, user } =
    useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  async function handleSignIn() {
    try {
      await signInWithGoogle();
      const nextPath = location.state?.from?.pathname ?? '/onboarding';
      navigate(nextPath);
    } catch {
      // Auth state and error copy are already managed in context.
    }
  }

  return (
    <div className="auth-page">
      <section className="card auth-card">
        <p className="eyebrow">Authentication</p>
        <h1>Sign in with Google</h1>
        <p>
          Every user will sign in with Google in the new app. Team creation, joins, roster
          linking, and permissions all build from that identity.
        </p>

        {!isFirebaseConfigured && (
          <div className="notice notice--warning">
            Add your Firebase web app values to <code>.env</code> before sign-in can work.
          </div>
        )}

        {authError && <div className="notice notice--error">{authError}</div>}

        {isAuthenticated ? (
          <div className="notice notice--success">
            Signed in as <strong>{user?.displayName ?? user?.email}</strong>. Continue to the
            onboarding flow.
          </div>
        ) : null}

        <div className="stack">
          <button
            className="button"
            disabled={!isFirebaseConfigured || loading}
            onClick={handleSignIn}
            type="button"
          >
            {loading ? 'Checking sign-in...' : 'Continue with Google'}
          </button>

          <Link className="button button--ghost" to="/onboarding">
            Continue through scaffold
          </Link>
        </div>
      </section>
    </div>
  );
}
