import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import createTeamImage from '../../create_team.webp';
import joinTeamImage from '../../join_team.webp';

export default function OnboardingPage() {
  const { signOutUser, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const requestedMode = searchParams.get('mode');

  if (requestedMode === 'create') {
    return <Navigate replace to="/create" />;
  }

  if (requestedMode === 'join') {
    return <Navigate replace to="/join" />;
  }

  async function handleLogout() {
    await signOutUser();
    navigate('/', { replace: true });
  }

  return (
    <div className="auth-page page-grid onboarding-choice-page">
      <section className="card onboarding-choice-card">
        <p className="eyebrow">Signed in</p>
        <h1>Welcome to PKL Universe</h1>
        <p className="marketing-section__copy onboarding-choice-page__copy">
          {user?.displayName || user?.email
            ? `Signed in as ${user.displayName || user.email}, but you're not associated with a team. `
            : "You're signed in, but you're not associated with a team. "}
          You can now create a team or join a roster by asking your captain for the team&apos;s invite code.
        </p>

        <div className="marketing-action-grid">
          <Link className="marketing-action-card" to="/create">
            <img
              alt="Create a team"
              className="marketing-action-card__image"
              decoding="async"
              loading="lazy"
              src={createTeamImage}
            />
            <div className="marketing-action-card__body">
              <strong>Create a Team</strong>
              <span>Pick a name and create a team hub for your teammates in one click.</span>
            </div>
          </Link>

          <Link className="marketing-action-card" to="/join">
            <img
              alt="Join a team"
              className="marketing-action-card__image"
              decoding="async"
              loading="lazy"
              src={joinTeamImage}
            />
            <div className="marketing-action-card__body">
              <strong>Join a Team</strong>
              <span>Ask your team captain for the invite code to get added to your team hub.</span>
            </div>
          </Link>
        </div>

        <div className="onboarding-choice-page__footer">
          <Link className="button button--ghost" to="/">
            Back to Homepage
          </Link>
          <button className="button button--ghost" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
      </section>
    </div>
  );
}
