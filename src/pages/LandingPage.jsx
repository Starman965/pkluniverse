import { Link } from 'react-router-dom';
import pklUniverseLogo from '../../pkl_universe_logo.png';

export default function LandingPage() {
  return (
    <div className="marketing-page">
      <section className="hero card">
        <div className="hero__content">
          <p className="eyebrow">Blackhawk-first team app</p>
          <h1>Modern club management for captains, co-captains, and players.</h1>
          <p className="hero__copy">
            The rebuild keeps the parts that matter now: Google sign-in, team onboarding,
            multiple-team membership, team-specific news, and team-managed standings, schedule,
            availability, and pairings.
          </p>
          <div className="hero__actions">
            <Link className="button" to="/auth">
              Sign in with Google
            </Link>
            <Link className="button button--ghost" to="/onboarding">
              View onboarding flow
            </Link>
          </div>
        </div>

        <div className="hero__panel">
          <img alt="PKL Universe logo" className="hero__logo" src={pklUniverseLogo} />
          <ul className="feature-list">
            <li>Club-aware, team-scoped Firebase model</li>
            <li>Hash routing for GitHub Pages</li>
            <li>Captain and co-captain pairing controls</li>
            <li>Manual-first migration and roster setup</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
