import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TeamDivisionLabel from '../components/TeamDivisionLabel';
import { getVisibleTeamDivisionLabel } from '../lib/teamDivision';
import defaultTeamLogo from '../../default_team_logo.webp';
import { listTeamDirectory } from '../lib/data';

export default function TeamDirectoryPage() {
  const [clubGroups, setClubGroups] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    listTeamDirectory()
      .then((groups) => {
        if (!cancelled) {
          setClubGroups(groups);
          setErrorMessage('');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setClubGroups([]);
          setErrorMessage(error.message ?? 'Unable to load the team directory right now.');
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
        <p className="eyebrow">Team Directory</p>
        <div className="team-chooser__intro">
          <h1>Browse teams by club</h1>
          <p>Clubs are listed alphabetically. Independent teams appear under Independent.</p>
        </div>

        {errorMessage ? <div className="notice notice--error">{errorMessage}</div> : null}

        {loading ? (
          <div className="state-panel">
            <p>Loading team directory...</p>
          </div>
        ) : (
          <div className="team-directory__groups">
            {clubGroups.length > 0 ? (
              clubGroups.map((group) => (
                <section key={group.clubSlug} className="team-directory__group">
                  <div className="team-directory__group-header">
                    <h2>{group.clubName}</h2>
                    <span>
                      {group.teams.length} {group.teams.length === 1 ? 'team' : 'teams'}
                    </span>
                  </div>

                  <div className="membership-list">
                    {group.teams.map((team) => (
                      <article key={`${team.sourceClubSlug}-${team.teamSlug}`} className="membership-card">
                        <img
                          alt={`${team.name} logo`}
                          className="membership-card__logo"
                          decoding="async"
                          loading="lazy"
                          src={team.logoUrl || defaultTeamLogo}
                        />
                        <div className="membership-card__content">
                          <strong>{team.name}</strong>
                          <span>
                            Captain:{' '}
                            {team.captainNames?.length ? team.captainNames.join(', ') : 'TBD'}
                          </span>
                          <span>
                            Members: {team.memberCount ?? 0}
                          </span>
                          {getVisibleTeamDivisionLabel(team) ? (
                            <TeamDivisionLabel className="membership-card__division" value={team.teamDivision} />
                          ) : null}
                          <span>Club: {group.clubName}</span>
                          <span>Location: {team.primaryLocation || 'Not set'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <p>No teams are listed yet.</p>
            )}
          </div>
        )}
      </section>

      <div className="team-entry__footer">
        <Link className="button button--ghost" to="/">
          Return to Home
        </Link>
      </div>
    </div>
  );
}
