import { Link } from 'react-router-dom';
import pklUniverseWideLogo from '../../pkl_universe_wide_logo.webp';
import heroActionImage from '../assets/homepage/pkl-home-hero-action.png';
import communityImage from '../assets/homepage/pkl-home-community.png';
import rivalryHeroAltImage from '../assets/homepage/pkl-home-rivalry-hero-alt.png';
import bigAppleLogo from '../assets/homepage/team-big-apple-bangers.png';
import dinkLogo from '../assets/homepage/team-dinks-on-the-rocks.png';
import chillPicklersLogo from '../assets/homepage/chill_picklers_logo.png';
import hawkeyesLogo from '../assets/homepage/team-hawkeyes.png';
import paddleTappersLogo from '../assets/homepage/team-paddle-tappers.png';
import kitchenHeatLogo from '../assets/homepage/team-kitchen-heat.png';
import communityAvatar01 from '../assets/homepage/community-avatar-01.png';
import communityAvatar02 from '../assets/homepage/community-avatar-02.png';
import communityAvatar03 from '../assets/homepage/community-avatar-03.png';
import communityAvatar04 from '../assets/homepage/community-avatar-04.png';
import communityAvatar05 from '../assets/homepage/community-avatar-05.png';
import communityAvatar06 from '../assets/homepage/community-avatar-06.png';
import communityAvatar07 from '../assets/homepage/community-avatar-07.png';
import avengersTeamLogo from '../assets/homepage/avengers.png';
import PlayerMenuIcon from '../components/PlayerMenuIcon';

const HOME_SECTION_IDS = new Set(['competition-board', 'how-it-works', 'standings']);

/**
 * HashRouter uses the hash for routes (`#/…`). Plain `#section` links strip the route and break navigation.
 * Keep `href` as `/#/` and scroll to the target `id` on the landing page.
 */
function HomeScrollLink({ children, className, sectionId, ...rest }) {
  const handleClick = (event) => {
    event.preventDefault();
    if (!HOME_SECTION_IDS.has(sectionId)) {
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <a {...rest} className={className} href="#/" onClick={handleClick}>
      {children}
    </a>
  );
}

const heroRhythmIconProps = {
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  'aria-hidden': true,
};

/** Line icons for hero rhythm strip (stroke weight aligned with hub nav). */
function HeroRhythmIcon({ name }) {
  const s = heroRhythmIconProps;
  if (name === 'challenge') {
    return (
      <svg {...s} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M7 17 17 7" />
        <path d="M14 4h6v6" />
        <path d="M10 20H4v-6" />
      </svg>
    );
  }
  if (name === 'play') {
    return (
      <svg {...s} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <circle cx="12" cy="12" opacity="0.55" r="9" />
        <path d="M10.25 8.9v6.2L15.8 12l-5.55-3.1Z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === 'tap') {
    return (
      <svg {...s} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <g transform="translate(12 12) rotate(-22) translate(-12 -12)">
          <rect height="11" rx="2" width="9" x="7.5" y="4" />
          <path d="M12 15v4.5" />
        </g>
      </svg>
    );
  }
  if (name === 'repeat') {
    return (
      <svg {...s} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M20 9.5A8.5 8.5 0 0 0 6.7 5.6" />
        <path d="M4 5v5h5" />
        <path d="M4 14.5A8.5 8.5 0 0 0 17.3 18.4" />
        <path d="M20 19v-5h-5" />
      </svg>
    );
  }
  return null;
}

/** Crossed paddles + ball for Competition Board CTA (matches yellow pill treatment in CSS) */
function ChallengeTeamCtaIcon() {
  return (
    <svg aria-hidden="true" className="challenge-board__cta-svg" height="24" viewBox="0 0 24 24" width="24">
      <g fill="currentColor">
        <g transform="translate(12 10.5)">
          <g transform="rotate(-34)">
            <rect height="11" rx="2" width="9.5" x="-4.75" y="-9" />
            <rect height="7.5" rx="1" width="2.8" x="-1.4" y="2" />
          </g>
          <g transform="rotate(34)">
            <rect height="11" rx="2" width="9.5" x="-4.75" y="-9" />
            <rect height="7.5" rx="1" width="2.8" x="-1.4" y="2" />
          </g>
        </g>
        <path
          d="M12 2.2l.35 1 .65-.55-.25.9.95.35-.95.35.25.9-.65-.55-.35 1-.35-1-.65.55.25-.9-.95-.35.95-.35-.25-.9.65.55.35-1z"
          opacity="0.92"
        />
        <circle cx="12" cy="20.5" fill="#f5e000" r="2.9" stroke="currentColor" strokeWidth="0.75" />
        <circle cx="10.85" cy="19.85" fill="currentColor" r="0.45" />
        <circle cx="13.1" cy="20.15" fill="currentColor" r="0.38" />
        <circle cx="11.9" cy="21.45" fill="currentColor" r="0.35" />
      </g>
    </svg>
  );
}

/** Step icons for “Captains build the rivalry” (dark badge, currentColor = white) */
function CaptainStepIcon({ step }) {
  const s = { 'aria-hidden': true, height: 22, viewBox: '0 0 24 24', width: 22 };
  switch (step) {
    case 'create':
      return (
        <svg {...s}>
          <path
            d="M12 2.2L5 5.4v5.1c0 4 2.8 7.7 7 8.8 4.2-1.1 7-4.8 7-8.8V5.4L12 2.2zm0 2.3l4.5 2.4v4.8c0 2.8-2 5.3-4.5 6.3-2.5-1-4.5-3.5-4.5-6.3V7L12 4.5z"
            fill="currentColor"
          />
          <path
            d="M12 8.2c.4 0 .8.3.8.8v1.4h1.4c.4 0 .8.3.8.8s-.3.8-.8.8h-1.4v1.4c0 .4-.3.8-.8.8s-.8-.3-.8-.8v-1.4H9.8c-.4 0-.8-.3-.8-.8s.3-.8.8-.8h1.4V9c0-.5.3-.8.8-.8z"
            fill="currentColor"
          />
        </svg>
      );
    case 'roster':
      return (
        <svg {...s}>
          <path
            d="M10 12.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zm-5.5 2.3C2.7 14.5 1 16 1 18.2V20h11v-2c0-1.3.5-2.4 1.3-3.3-2.2-1.2-4.8-1.9-7.3-2.2zM17.5 10a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zm1.2 5.4c1.9.3 3.5 1.1 3.5 2.4V20h-5.2v-2.2c0-1.5-.6-2.8-1.5-3.7.6-.6 1.3-1 2.1-1.1h1.1zM19 14.5h2.2v1.8H23v2h-1.8V20h-2v-1.8H17v-2h3.2v-1.8z"
            fill="currentColor"
          />
        </svg>
      );
    case 'challenge':
      return (
        <svg {...s}>
          <path
            d="M13.5 2L4 14h7.2L9.5 22 20 10h-7.3L13.5 2z"
            fill="currentColor"
          />
        </svg>
      );
    case 'result':
      return (
        <svg {...s}>
          <path
            d="M7 3h10a2 2 0 0 1 2 2v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2zm0 2v14h10V5H7zm2 2h6v2H9V7zm0 4h6v2H9v-2zm0 4h4v2H9v-2z"
            fill="currentColor"
          />
        </svg>
      );
    default:
      return null;
  }
}

const challengeRows = [
  {
    action: 'Accept',
    captain: 'Mike R.',
    challenge: 'Dinks on the Rocks',
    date: 'Sat, May 18 · 9:00 AM',
    logo: dinkLogo,
    opponent: 'Kitchen Heat',
    place: 'Court 3',
  },
  {
    action: 'View Details',
    captain: 'Sarah L.',
    challenge: 'Big Apple Bangers',
    date: 'Sun, May 19 · 10:30 AM',
    logo: bigAppleLogo,
    opponent: 'Paddle Tappers',
    place: 'Court 7',
  },
  {
    action: 'Enter Score',
    captain: 'Jason K.',
    challenge: 'Chill Picklers',
    date: 'Tue, May 21 · 6:30 PM',
    logo: chillPicklersLogo,
    opponent: 'Dinks on the Rocks',
    place: 'Court 1',
  },
  {
    action: 'Accept',
    captain: 'Lisa T.',
    challenge: 'Hawkeyes',
    date: 'Fri, May 24 · 9:00 AM',
    logo: hawkeyesLogo,
    opponent: 'Chill Picklers',
    place: 'Court 10',
  },
  {
    action: 'Enter Score',
    captain: 'Tom G.',
    challenge: 'Paddle Tappers',
    date: 'Sat, May 25 · 11:00 AM',
    logo: paddleTappersLogo,
    opponent: 'Big Apple Bangers',
    place: 'Court 5',
  },
];

/** Homepage preview of club standings (matches in-app Team Rankings styling). */
const landingClubStandings = [
  {
    diff: 22,
    gp: 12,
    isYours: true,
    l: 3,
    logo: chillPicklersLogo,
    name: 'Chill Picklers',
    pa: 96,
    pf: 118,
    rank: 1,
    w: 9,
    winPct: '75%',
  },
  {
    diff: 18,
    gp: 11,
    isYours: false,
    l: 3,
    logo: dinkLogo,
    name: 'Dinks on the Rocks',
    pa: 94,
    pf: 112,
    rank: 2,
    w: 8,
    winPct: '73%',
  },
  {
    diff: 9,
    gp: 12,
    isYours: false,
    l: 4,
    logo: kitchenHeatLogo,
    name: 'Kitchen Heat',
    pa: 101,
    pf: 110,
    rank: 3,
    w: 8,
    winPct: '67%',
  },
  {
    diff: 4,
    gp: 10,
    isYours: false,
    l: 4,
    logo: hawkeyesLogo,
    name: 'Hawkeyes',
    pa: 88,
    pf: 92,
    rank: 4,
    w: 6,
    winPct: '60%',
  },
  {
    diff: -3,
    gp: 11,
    isYours: false,
    l: 5,
    logo: paddleTappersLogo,
    name: 'Paddle Tappers',
    pa: 105,
    pf: 102,
    rank: 5,
    w: 6,
    winPct: '55%',
  },
  {
    diff: -8,
    gp: 10,
    isYours: false,
    l: 6,
    logo: bigAppleLogo,
    name: 'Big Apple Bangers',
    pa: 98,
    pf: 90,
    rank: 6,
    w: 4,
    winPct: '40%',
  },
];

const communityProofAvatars = [
  communityAvatar01,
  communityAvatar02,
  communityAvatar03,
  communityAvatar04,
  communityAvatar05,
  communityAvatar06,
  communityAvatar07,
];

const captainSteps = [
  {
    copy: 'Name it. Brand it. Set your goals.',
    step: 'create',
    title: 'Create your team',
  },
  {
    copy: 'Bring your crew together in seconds.',
    step: 'roster',
    title: 'Invite your roster',
  },
  {
    copy: 'Pick your opponent, set the date, rally your squad.',
    step: 'challenge',
    title: 'Post a challenge',
  },
  {
    copy: 'Log scores, update stats, and climb the board.',
    step: 'result',
    title: 'Record the result',
  },
];

/** Same labels / order as `AppShell` primary routes + Profile (static preview). */
const landingHubNavPreview = [
  { active: true, icon: 'news', label: 'Home' },
  { icon: 'competition', label: 'Competition Hub' },
  { icon: 'matches', label: 'Matches' },
  { icon: 'standings', label: 'Standings' },
  { icon: 'members', label: 'Teams' },
  { icon: 'events', label: 'Events' },
  { icon: 'activity', label: 'Activity' },
  { icon: 'profile', label: 'Profile' },
];

export default function LandingPage() {
  return (
    <div className="home-page">
      <header className="home-nav" aria-label="PKL Universe homepage navigation">
        <Link className="home-nav__brand" to="/">
          <img alt="PKL Universe" src={pklUniverseWideLogo} />
        </Link>
        <nav className="home-nav__links" aria-label="Homepage sections">
          <HomeScrollLink sectionId="how-it-works">How it Works</HomeScrollLink>
          <HomeScrollLink sectionId="competition-board">Competition Board</HomeScrollLink>
          <HomeScrollLink sectionId="standings">Standings</HomeScrollLink>
        </nav>
        <div className="home-nav__actions">
          <Link className="home-button home-button--outline" to="/teams">
            Log in
          </Link>
          <Link className="home-button home-button--yellow" to="/create">
            Create a Team
          </Link>
          <Link className="home-button home-button--blue" to="/join">
            Join Team
          </Link>
        </div>
      </header>

      <main>
        <section className="home-hero">
          <img alt="PKL Universe pickleball court action" className="home-hero__image" src={heroActionImage} />
          <div className="home-hero__shade" />
          <div className="home-hero__content">
            <div className="home-hero__copy">
              <h1>Start your squad. Challenge the court.</h1>
              <p>
                PKL Universe turns regular pickleball into team play your friends can join and compete in.
              </p>
              <div className="home-hero__actions">
                <Link className="home-button home-button--yellow" to="/create">Create a Team</Link>
                <Link className="home-button home-button--outline" to="/join">Join Team with Code</Link>
              </div>
              <div className="home-social-proof" aria-label="Community proof">
                {communityProofAvatars.map((src) => (
                  <span key={src}>
                    <img alt="" decoding="async" src={src} />
                  </span>
                ))}
                <p>Players. Captains. Rivals. All in your community.</p>
              </div>
            </div>

            <div className="home-hero__cards" aria-label="PKL Universe match previews">
              <article className="floating-card floating-card--wide">
                <span className="floating-card__label">Open Challenges</span>
                <div className="floating-card__match">
                  <div className="floating-card__logos" aria-hidden="true">
                    <img alt="" src={bigAppleLogo} />
                    <span className="floating-card__vs">vs</span>
                    <img alt="" src={paddleTappersLogo} />
                  </div>
                  <strong>Big Apple Bangers <small>vs Paddle Tappers</small></strong>
                </div>
                <p>Sun, May 19 · 10:30 AM</p>
              </article>
              <article className="floating-card floating-card--standings">
                <span className="floating-card__label">Standings</span>
                <ol>
                  <li><span>Dinks on the Rocks</span><strong>6-1</strong></li>
                  <li><span>Kitchen Heat</span><strong>5-2</strong></li>
                  <li><span>Chill Picklers</span><strong>4-2</strong></li>
                  <li><span>Paddle Tappers</span><strong>3-4</strong></li>
                </ol>
                <HomeScrollLink sectionId="standings">View Full Standings</HomeScrollLink>
              </article>
              <article className="floating-card floating-card--match">
                <span className="floating-card__label">Next Match</span>
                <div className="floating-card__match">
                  <div className="floating-card__logos" aria-hidden="true">
                    <img alt="" src={hawkeyesLogo} />
                    <span className="floating-card__vs">vs</span>
                    <img alt="" src={chillPicklersLogo} />
                  </div>
                  <strong>Hawkeyes <small>vs Chill Picklers</small></strong>
                </div>
                <p>Fri, May 24 · 9:00 AM<br />Court 10</p>
              </article>
            </div>
          </div>
          <HomeScrollLink
            aria-label="Jump to Competition Board: Challenge, Play, Tap, Repeat"
            className="home-hero__scroll"
            sectionId="competition-board"
          >
            <span className="home-hero__scroll-inner">
              <span className="home-hero__scroll-item">
                <HeroRhythmIcon name="challenge" />
                <span className="home-hero__scroll-label">Challenge</span>
              </span>
              <span aria-hidden="true" className="home-hero__scroll-sep" />
              <span className="home-hero__scroll-item">
                <HeroRhythmIcon name="play" />
                <span className="home-hero__scroll-label">Play</span>
              </span>
              <span aria-hidden="true" className="home-hero__scroll-sep" />
              <span className="home-hero__scroll-item">
                <HeroRhythmIcon name="tap" />
                <span className="home-hero__scroll-label">Tap</span>
              </span>
              <span aria-hidden="true" className="home-hero__scroll-sep" />
              <span className="home-hero__scroll-item">
                <HeroRhythmIcon name="repeat" />
                <span className="home-hero__scroll-label">Repeat</span>
              </span>
            </span>
          </HomeScrollLink>
        </section>

        <section className="challenge-section" id="competition-board">
          <div className="home-section-heading home-section-heading--center">
            <h2>The Competition Board keeps the fun and rivalry going.</h2>
          </div>
          <div className="challenge-board">
            <div className="challenge-board__tabs">
              <button className="challenge-board__tab challenge-board__tab--active" type="button">All Challenges</button>
              <button className="challenge-board__tab" type="button">My Team</button>
              <button className="challenge-board__tab" type="button">Open Challenges</button>
              <button className="challenge-board__tab" type="button">Completed</button>
              <Link className="challenge-board__cta" to="/create">
                <span className="challenge-board__cta-icon">
                  <ChallengeTeamCtaIcon />
                </span>
                <span className="challenge-board__cta-label">Challenge a Team</span>
              </Link>
            </div>
            <div className="challenge-table" role="table" aria-label="Competition Board">
              <div className="challenge-table__head" role="row">
                <span>Challenge</span>
                <span>Date & Time</span>
                <span>Captain</span>
                <span>Court(s)</span>
                <span>Actions</span>
              </div>
              {challengeRows.map((row) => (
                <div className="challenge-table__row" role="row" key={`${row.challenge}-${row.opponent}`}>
                  <div className="challenge-table__match">
                    <img alt="" src={row.logo} />
                    <strong>{row.challenge}<small>vs {row.opponent}</small></strong>
                  </div>
                  <span>{row.date}</span>
                  <span>{row.captain}</span>
                  <span>{row.place}</span>
                  <div className="challenge-table__actions">
                    <span
                      className={
                        row.action === 'Accept' || row.action === 'Enter Score'
                          ? 'table-action table-action--primary'
                          : 'table-action'
                      }
                    >
                      {row.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="captains-section" id="captains">
          <div className="captains-section__copy" id="how-it-works">
            <div className="home-section-heading">
              <h2>Captains build the rivalry.</h2>
              <p>Everything you need to run your team and keep the competition moving.</p>
            </div>
            <div className="captain-steps">
              {captainSteps.map(({ copy, step, title }) => (
                <article className="captain-step" key={title}>
                  <span className="captain-step__badge" aria-hidden="true">
                    <CaptainStepIcon step={step} />
                  </span>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="captains-section__visual">
            <div className="landing-sidebar-preview">
              <aside className="sidebar" aria-label="Team hub navigation preview">
                <div className="sidebar__header">
                  <div className="sidebar__team-card">
                    <img alt="Avengers team logo" className="sidebar__team-logo" src={avengersTeamLogo} />
                    <div className="sidebar__team-copy">
                      <p className="sidebar__team-title">Avengers</p>
                      <div className="sidebar__team-stats" aria-hidden="true">
                        <span className="sidebar__team-stat sidebar__team-stat--members">
                          Team Members: <strong>2</strong>
                        </span>
                        <span className="sidebar__team-stat">
                          <strong>1-0</strong>
                          W-L
                        </span>
                        <span className="sidebar__team-stat">
                          <strong>100%</strong>
                          Win %
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <nav className="sidebar__nav" aria-label="Example main navigation">
                  <div className="sidebar__nav-group">
                    <p className="sidebar__nav-heading">Main</p>
                    {landingHubNavPreview.map(({ active, icon, label }) => (
                      <div
                        className={`nav-link${active ? ' nav-link--active' : ''}`}
                        key={label}
                        role="presentation"
                      >
                        <PlayerMenuIcon type={icon} />
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </nav>
              </aside>
            </div>
          </div>
        </section>

        <section className="standings-section" id="standings">
          <div className="standings-section__copy">
            <h2>Play for bragging rights.</h2>
            <p>Track standings, streaks, and results in real time.</p>
            <p>Climb the board one match at a time.</p>
            <Link className="home-button home-button--yellow" to="/create">Create a Team</Link>
          </div>
          <div className="standings-panel landing-club-standings">
            <div className="landing-club-standings__top">
              <div className="landing-club-standings__intro">
                <p className="landing-club-standings__eyebrow">Club standings</p>
                <h3 className="landing-club-standings__heading">Team Rankings</h3>
                <p className="landing-club-standings__sub">
                  Teams are ranked by wins, then losses, win percentage, and point differential.
                </p>
              </div>
              <p className="landing-club-standings__count">{landingClubStandings.length} teams</p>
            </div>
            <div className="landing-club-standings__table-wrap">
              <div className="landing-club-standings__table" role="table" aria-label="Team rankings preview">
                <div className="landing-club-standings__head" role="row">
                  <span role="columnheader">Rank</span>
                  <span role="columnheader">Team</span>
                  <span role="columnheader">GP</span>
                  <span role="columnheader">W</span>
                  <span role="columnheader">L</span>
                  <span role="columnheader">Win %</span>
                  <span role="columnheader">PF</span>
                  <span role="columnheader">PA</span>
                  <span role="columnheader">Diff</span>
                </div>
                {landingClubStandings.map((row) => (
                  <div
                    className={`landing-club-standings__row${row.isYours ? ' landing-club-standings__row--yours' : ''}`}
                    key={row.name}
                    role="row"
                  >
                    <div className="landing-club-standings__rank-block" role="cell">
                      <span className="landing-club-standings__rank-num">#{row.rank}</span>
                      {row.isYours ? (
                        <span className="landing-club-standings__your-team">Your team</span>
                      ) : null}
                    </div>
                    <div className="landing-club-standings__team" role="cell">
                      <img alt="" decoding="async" src={row.logo} />
                      <strong>{row.name}</strong>
                    </div>
                    <span role="cell">{row.gp}</span>
                    <span role="cell">{row.w}</span>
                    <span role="cell">{row.l}</span>
                    <span role="cell">{row.winPct}</span>
                    <span role="cell">{row.pf}</span>
                    <span role="cell">{row.pa}</span>
                    <span
                      className={
                        row.diff > 0
                          ? 'landing-club-standings__diff landing-club-standings__diff--pos'
                          : row.diff < 0
                            ? 'landing-club-standings__diff landing-club-standings__diff--neg'
                            : 'landing-club-standings__diff'
                      }
                      role="cell"
                    >
                      {row.diff > 0 ? `+${row.diff}` : row.diff}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="recent-results">
              {[
                ['Dinks on the Rocks', '11', 'Kitchen Heat', '7'],
                ['Chill Picklers', '9', 'Paddle Tappers', '11'],
                ['Kitchen Heat', '11', 'Big Apple Bangers', '6'],
                ['Dinks on the Rocks', '11', 'Chill Picklers', '10'],
              ].map(([teamA, scoreA, teamB, scoreB]) => (
                <article className="result-card" key={`${teamA}-${teamB}`}>
                  <span>{teamA}<strong>{scoreA}</strong></span>
                  <span>{teamB}<strong>{scoreB}</strong></span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="community-section">
          <div className="community-section__image">
            <img alt="Blackhawk pickleball players connecting after a match" src={communityImage} />
            <div className="message-stack">
              <span>Great win today!</span>
              <span>What a battle! Rematch soon.</span>
              <span>Next up: Kitchen Heat. Let's get it.</span>
            </div>
          </div>
          <div className="community-section__copy">
            <h2>Made for your Blackhawk pickleball circle.</h2>
            <p>PKL Universe keeps your community connected, on and off the court.</p>
            <div className="community-points">
              <article>
                <strong>Your people, your teams</strong>
                <p>Invite friends, build lineups, and keep everyone in the loop.</p>
              </article>
              <article>
                <strong>Match days that stick</strong>
                <p>Set recurring days, fill lineups, and show up ready to play.</p>
              </article>
              <article>
                <strong>Chat, celebrate, compete</strong>
                <p>Trash talk, hype, highlights, because it is more fun together.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <img alt="" src={rivalryHeroAltImage} />
          <div>
            <h2>Create a team before your next drop in.</h2>
            <div className="final-cta__actions">
              <Link className="home-button home-button--yellow" to="/create">Create a Team</Link>
              <Link className="home-button home-button--blue" to="/join">Join Team</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <Link className="home-footer__brand" to="/">
          <img alt="PKL Universe" src={pklUniverseWideLogo} />
        </Link>
        <nav aria-label="Footer sections">
          <HomeScrollLink sectionId="how-it-works">How it Works</HomeScrollLink>
          <HomeScrollLink sectionId="competition-board">Competition Board</HomeScrollLink>
          <HomeScrollLink sectionId="standings">Standings</HomeScrollLink>
        </nav>
        <div className="home-footer__legal">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <p>© 2026 PKL Universe</p>
      </footer>
    </div>
  );
}
