import { Link } from 'react-router-dom';
import createTeamImage from '../../create_team.png';
import heroShot from '../../hero_shot.png';
import joinTeamImage from '../../join_team.png';
import loginNowImage from '../../login_now.png';
import pklUniverseWideLogo from '../../pkl_universe_wide_logo.png';

export default function LandingPage() {
  return (
    <div className="marketing-page">
      <section className="hero card">
        <img alt="Pickleball players at sunset" className="hero__background" src={heroShot} />
        <div className="hero__overlay" />

        <div className="hero__top-nav">
          <Link className="hero__top-link" to="/onboarding?mode=create">
            Create A Team
          </Link>
          <span className="hero__top-separator">|</span>
          <Link className="hero__top-link" to="/onboarding?mode=join">
            Join A Team
          </Link>
          <span className="hero__top-separator">|</span>
          <Link className="hero__top-link" to="/auth">
            Log In Now
          </Link>
        </div>

        <div className="hero__content hero__content--landing">
          <img alt="PKL Universe" className="hero__brand" src={pklUniverseWideLogo} />
          <h1>Bring Your Pickleball Team Together</h1>
          <p className="hero__copy">
            PKL Universe gives captains and players one place to organize communication, schedules,
            availability, and roster decisions throughout the season.
          </p>

          <ul className="feature-list hero__feature-list">
            <li>Team news and updates in one shared hub</li>
            <li>Schedules, scores, and availability tracking</li>
            <li>Roster tools for captains and co-captains</li>
          </ul>
        </div>

      </section>

      <section className="marketing-section">
        <div className="marketing-section__header">
          <p className="eyebrow">Get started</p>
          <h2>Choose the path that fits you</h2>
        </div>

        <div className="marketing-action-grid">
          <Link className="marketing-action-card" to="/onboarding?mode=create">
            <img alt="Create a team" className="marketing-action-card__image" src={createTeamImage} />
            <div className="marketing-action-card__body">
              <strong>Create Team</strong>
              <span>Set up your team, become the captain, and get your first join code.</span>
            </div>
          </Link>

          <Link className="marketing-action-card" to="/onboarding?mode=join">
            <img alt="Join a team" className="marketing-action-card__image" src={joinTeamImage} />
            <div className="marketing-action-card__body">
              <strong>Join Team</strong>
              <span>Enter the captain&apos;s code and get connected to the team you want to play on.</span>
            </div>
          </Link>

          <Link className="marketing-action-card" to="/auth">
            <img alt="Login to PKL Universe" className="marketing-action-card__image" src={loginNowImage} />
            <div className="marketing-action-card__body">
              <strong>Login</strong>
              <span>Return to your teams, switch between them, and pick up where you left off.</span>
            </div>
          </Link>
        </div>
      </section>

      <footer className="site-footer">
        <p className="site-footer__copy">© 2026 PKL Universe</p>
        <p className="site-footer__copy">Developed by: David Lewis</p>
      </footer>
    </div>
  );
}
