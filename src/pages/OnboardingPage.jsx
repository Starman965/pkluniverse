import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function OnboardingPage() {
  const { isAuthenticated } = useAuth();

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
          <div className="mini-card">
            <h2>Create team</h2>
            <p>
              Intended for club admins or approved organizers. The first implementation will
              create the team, captain membership, and starter settings in Firestore.
            </p>
            <Link className="button" to="/c/blackhawk/t/hawks">
              View created team shell
            </Link>
          </div>

          <div className="mini-card">
            <h2>Join with code</h2>
            <p>
              Players sign in, enter a captain-managed code or link, then link themselves to a
              team roster profile.
            </p>
            <Link className="button button--ghost" to="/c/blackhawk/t/falcons">
              View joined team shell
            </Link>
          </div>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">State of this scaffold</p>
        <ul className="feature-list">
          <li>Hash-routed pages are wired for GitHub Pages.</li>
          <li>Protected team routes are ready for Firebase auth.</li>
          <li>Club-aware URLs use club and team slugs.</li>
          <li>Real Firestore create/join flows are the next implementation step.</li>
        </ul>

        <div className="notice notice--info">
          {isAuthenticated
            ? 'You are signed in, so once Firebase is configured we can replace these scaffold links with the real create/join flows.'
            : 'You can explore the scaffold now, then enable Firebase to turn onboarding into a real flow.'}
        </div>
      </section>
    </div>
  );
}
