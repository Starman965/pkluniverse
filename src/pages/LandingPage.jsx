import { useState } from 'react';
import { Link } from 'react-router-dom';
import clubTileImage from '../../club_tile.webp';
import createTeamImage from '../../create_team.webp';
import heroShot from '../../hero_shot.webp';
import joinTeamImage from '../../join_team.webp';
import loginNowImage from '../../login_now.webp';
import pklUniverseWideLogo from '../../pkl_universe_wide_logo.webp';
import buildRosterImage from '../../build_roster_6.webp';
import clubChallengesImage from '../../club_challenges_4.webp';
import manageMatchesImage from '../../manage_matches_5.webp';
import managePlayersImage from '../../manage_players_7.webp';
import newsFeedImage from '../../news_feed_1.webp';
import teamMembersImage from '../../team_members_2.webp';
import teamStandingsImage from '../../team_standings_3.webp';

const TEAM_HUB_PREVIEWS = [
  {
    alt: 'PKL Universe team news feed preview',
    image: newsFeedImage,
    label: 'News Feed',
  },
  {
    alt: 'PKL Universe team members preview',
    image: teamMembersImage,
    label: 'Team Members',
  },
  {
    alt: 'PKL Universe team standings preview',
    image: teamStandingsImage,
    label: 'Team Standings',
  },
  {
    alt: 'PKL Universe club challenge preview',
    image: clubChallengesImage,
    label: 'Club Challenges',
  },
  {
    alt: 'PKL Universe manage matches preview',
    image: manageMatchesImage,
    label: 'Manage Matches',
  },
  {
    alt: 'PKL Universe build roster preview',
    image: buildRosterImage,
    label: 'Build Rosters',
  },
  {
    alt: 'PKL Universe manage players preview',
    image: managePlayersImage,
    label: 'Manage Players',
  },
];

export default function LandingPage() {
  const [isTeamHubPreviewOpen, setIsTeamHubPreviewOpen] = useState(false);
  const [teamHubPreviewIndex, setTeamHubPreviewIndex] = useState(0);
  const activeTeamHubPreview = TEAM_HUB_PREVIEWS[teamHubPreviewIndex];

  function showPreviousTeamHubPreview() {
    setTeamHubPreviewIndex((current) => (
      current === 0 ? TEAM_HUB_PREVIEWS.length - 1 : current - 1
    ));
  }

  function showNextTeamHubPreview() {
    setTeamHubPreviewIndex((current) => (
      current === TEAM_HUB_PREVIEWS.length - 1 ? 0 : current + 1
    ));
  }

  return (
    <div className="marketing-page">
      <section className="hero card">
        <img alt="Pickleball players at sunset" className="hero__background" src={heroShot} />
        <div className="hero__overlay" />

        <div className="hero__top-nav">
          <Link className="hero__top-link" to="/teams">
            Log In
          </Link>
          <span className="hero__top-separator">|</span>
          <Link className="hero__top-link" to="/join">
            Join A Team
          </Link>
          <span className="hero__top-separator">|</span>
          <Link className="hero__top-link" to="/create">
            Create A Team
          </Link>
        </div>

        <div className="hero__content hero__content--landing">
          <img alt="PKL Universe" className="hero__brand" src={pklUniverseWideLogo} />
          <h1>
            Add organized team play to your
            <br />
            club—without changing how your
            <br />
            members already play.
          </h1>
          <p className="hero__copy">
            PKL Universe gives clubs a simple way to introduce fun, friendly team competition alongside drop-ins and
            regular games—enhancing the member experience, not replacing it.
          </p>

          <ul className="feature-list hero__feature-list">
            <li>Layer team-based match play on top of existing schedules</li>
            <li>Keep rosters, matches, and availability organized automatically</li>
            <li>Give members a more social, engaging reason to play</li>
          </ul>
        </div>

      </section>

      <section className="marketing-section">
        <div className="marketing-section__header">
          <div>
            <p className="eyebrow">Take your next step</p>
            <h2>Sign in, join a team, or create a new team hub as a captain.</h2>
          </div>
        </div>

        <div className="marketing-action-grid">
          <Link className="marketing-action-card" to="/teams">
            <img
              alt="Login to PKL Universe"
              className="marketing-action-card__image"
              decoding="async"
              loading="lazy"
              src={loginNowImage}
            />
            <div className="marketing-action-card__body">
              <strong>Log In</strong>
              <span>Already using PKL Universe? Sign in to get back to your team hub.</span>
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
              <strong>Join Team</strong>
              <span>Have an invite code? Join a PKL Universe roster created by your captain or organizer.</span>
            </div>
          </Link>

          <Link className="marketing-action-card" to="/create">
            <img
              alt="Create a team"
              className="marketing-action-card__image"
              decoding="async"
              loading="lazy"
              src={createTeamImage}
            />
            <div className="marketing-action-card__body">
              <strong>Create Team</strong>
              <span>Organizing your players? Create a team hub, invite your roster, and keep match day moving.</span>
            </div>
          </Link>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-section__header">
          <div>
            <p className="eyebrow">Team hub preview</p>
            <h2>Everything you need to manage a roster and challenge other teams.</h2>
          </div>
        </div>

        <div className="team-hub-preview-card">
          <button
            aria-label={`Enlarge ${activeTeamHubPreview.label} team hub preview`}
            className="team-hub-preview-card__image-button"
            onClick={() => setIsTeamHubPreviewOpen(true)}
            type="button"
          >
            <img
              alt={activeTeamHubPreview.alt}
              className="team-hub-preview-card__image"
              decoding="async"
              loading="lazy"
              src={activeTeamHubPreview.image}
            />
          </button>
          <div className="team-hub-preview-card__footer">
            <span className="team-hub-preview-card__copy">
              {activeTeamHubPreview.label} · Click to enlarge
            </span>
            <div className="team-hub-preview-card__controls" aria-label="Team hub preview carousel">
              <button aria-label="Previous team hub preview" onClick={showPreviousTeamHubPreview} type="button">
                Prev
              </button>
              <div className="team-hub-preview-card__dots">
                {TEAM_HUB_PREVIEWS.map((preview, index) => (
                  <button
                    key={preview.label}
                    aria-label={`Show ${preview.label} preview`}
                    className={index === teamHubPreviewIndex ? 'team-hub-preview-card__dot--active' : ''}
                    onClick={() => setTeamHubPreviewIndex(index)}
                    type="button"
                  />
                ))}
              </div>
              <button aria-label="Next team hub preview" onClick={showNextTeamHubPreview} type="button">
                Next
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-info-card">
          <img
            alt="Club players organizing regular pickleball play into fun team competition"
            className="marketing-info-card__image"
            decoding="async"
            loading="lazy"
            src={clubTileImage}
          />
          <div className="marketing-info-card__content">
            <div>
              <p className="eyebrow">For clubs & player groups</p>
              <h2>Make regular play more organized, competitive, and fun.</h2>
            </div>
            <p>
              PKL Universe helps clubs add structure to everyday play—without turning it into a formal league or
              tournament. Members get team-based competition, while captains get a simple system to manage it all.
            </p>
            <ul className="feature-list">
              <li>Turn drop-in play into optional team-based competition</li>
              <li>Give captains one place to manage players, matches, and availability</li>
              <li>Keep it flexible for leagues, ladders, and recurring groups</li>
            </ul>
            <Link className="button button--ghost marketing-info-card__cta" to="/contact">
              Interested in adding PKL Universe to your club?
            </Link>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer__legal-links" aria-label="Legal links">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <p className="site-footer__copy">© 2026 PKL Universe</p>
        <p className="site-footer__copy">Developed by: David Lewis</p>
      </footer>

      {isTeamHubPreviewOpen ? (
        <div className="marketing-lightbox" role="dialog" aria-modal="true" aria-label="Team hub preview">
          <button
            aria-label="Close team hub preview"
            className="marketing-lightbox__backdrop"
            onClick={() => setIsTeamHubPreviewOpen(false)}
            type="button"
          />
          <div className="marketing-lightbox__panel">
            <div className="marketing-lightbox__toolbar">
              <strong>{activeTeamHubPreview.label}</strong>
              <button
                className="button button--ghost marketing-lightbox__close"
                onClick={() => setIsTeamHubPreviewOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <img alt={activeTeamHubPreview.alt} src={activeTeamHubPreview.image} />
            <div className="marketing-lightbox__controls" aria-label="Full-size team hub preview carousel">
              <button className="button button--ghost" onClick={showPreviousTeamHubPreview} type="button">
                Previous
              </button>
              <div className="team-hub-preview-card__dots">
                {TEAM_HUB_PREVIEWS.map((preview, index) => (
                  <button
                    key={preview.label}
                    aria-label={`Show ${preview.label} preview`}
                    className={index === teamHubPreviewIndex ? 'team-hub-preview-card__dot--active' : ''}
                    onClick={() => setTeamHubPreviewIndex(index)}
                    type="button"
                  />
                ))}
              </div>
              <button className="button button--ghost" onClick={showNextTeamHubPreview} type="button">
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
