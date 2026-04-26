import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listClubDirectory } from '../lib/data';

function buildClubInitials(name) {
  return (name || 'Club')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatClubLocation(club) {
  return [club.address, club.city, club.state, club.zip].filter(Boolean).join(', ');
}

export default function ClubDirectoryPage() {
  const [clubs, setClubs] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    listClubDirectory()
      .then((clubData) => {
        if (!cancelled) {
          setClubs(clubData);
          setErrorMessage('');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setClubs([]);
          setErrorMessage(error.message ?? 'Unable to load the club directory right now.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="auth-page">
      <section className="card auth-card team-directory">
        <p className="eyebrow">Club Directory</p>
        <div className="team-chooser__intro">
          <h1>Browse clubs</h1>
          <p>Find approved clubs and see how many teams are active in each club network.</p>
        </div>

        {errorMessage ? <div className="notice notice--error">{errorMessage}</div> : null}

        {loading ? (
          <div className="state-panel">
            <p>Loading club directory...</p>
          </div>
        ) : clubs.length > 0 ? (
          <div className="club-directory-grid">
            {clubs.map((club) => (
              <article key={club.slug} className="club-directory-card">
                {club.logoUrl ? (
                  <img alt={`${club.name} logo`} className="club-directory-card__logo" src={club.logoUrl} />
                ) : (
                  <div className="club-directory-card__badge">{buildClubInitials(club.name)}</div>
                )}
                <div className="club-directory-card__content">
                  <strong>{club.name}</strong>
                  {formatClubLocation(club) ? <span>{formatClubLocation(club)}</span> : null}
                  <span>
                    PKL Universe Teams: {club.teamCount}
                  </span>
                  <span>
                    PKL Universe Members: {club.memberCount}
                  </span>
                  <span>
                    Courts: {club.numberOfCourts ?? 0}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No clubs are listed yet.</p>
        )}
      </section>

      <div className="team-entry__footer">
        <Link className="button button--ghost" to="/">
          Return to Home
        </Link>
        <Link className="button button--ghost" to="/team-directory">
          Team Directory
        </Link>
      </div>
      <p className="club-directory__request-note">
        Want your club added to PKL Universe? Contact David Lewis on WhatsApp or by email at{' '}
        <a href="mailto:demandgendave@gmail.com">demandgendave@gmail.com</a>.
      </p>
    </div>
  );
}
