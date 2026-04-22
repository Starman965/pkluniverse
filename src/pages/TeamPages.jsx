import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMembership, getTeam } from '../lib/data';
import TeamPageTemplate from './TeamPageTemplate';

export function TeamDashboardPage() {
  const { clubSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [membership, setMembership] = useState(null);

  useEffect(() => {
    let ignore = false;

    Promise.all([
      getTeam(clubSlug, teamSlug),
      user?.uid ? getMembership(clubSlug, teamSlug, user.uid) : Promise.resolve(null),
    ])
      .then(([teamData, membershipData]) => {
        if (!ignore) {
          setTeam(teamData);
          setMembership(membershipData);
        }
      })
      .catch(() => {
        if (!ignore) {
          setTeam(null);
          setMembership(null);
        }
      });

    return () => {
      ignore = true;
    };
  }, [clubSlug, teamSlug, user?.uid]);

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">
          {clubSlug} / {teamSlug}
        </p>
        <h1>{team?.name ?? 'Team dashboard'}</h1>
        <p>
          This dashboard is now reading the saved team document. It will become the summary surface
          for roster health, upcoming fixtures, standings, news, and join settings.
        </p>

        <div className="detail-grid">
          <div className="detail-card">
            <span>Role</span>
            <strong>{membership?.role ?? 'Not yet loaded'}</strong>
          </div>
          <div className="detail-card">
            <span>Join code</span>
            <strong>{team?.joinCode ?? 'Not available yet'}</strong>
          </div>
          <div className="detail-card">
            <span>Status</span>
            <strong>{team?.status ?? 'Unknown'}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">Next implementation step</p>
        <ul className="feature-list">
          <li>Show upcoming schedule and availability summary cards.</li>
          <li>Load team-specific news and standings snapshots.</li>
          <li>Expose captain and co-captain actions around roster and pairings.</li>
        </ul>
      </section>
    </div>
  );
}

export function RosterPage() {
  return (
    <TeamPageTemplate
      description="Roster management will stay manual in the first release. Players can self-link to a profile, while captains and co-captains can reconcile duplicates or edit roster details."
      nextSteps={[
        'Create the team roster collection and player-link documents.',
        'Build manual add, edit, and link flows.',
        'Add role-aware controls for captain and co-captain editing.',
      ]}
      title="Roster"
    />
  );
}

export function SchedulePage() {
  return (
    <TeamPageTemplate
      description="Schedule entries and results will be team-specific so each team can run independently, even if other teams in the club do not use the app."
      nextSteps={[
        'Create schedule and game models under the team document path.',
        'Add manual schedule entry and result updates.',
        'Tie standings calculations to team-managed result data.',
      ]}
      title="Schedule and standings"
    />
  );
}

export function AvailabilityPage() {
  return (
    <TeamPageTemplate
      description="Availability will move from the open player dropdown to authenticated, player-linked updates so each member only updates their own status."
      nextSteps={[
        'Read the signed-in member player link.',
        'Render upcoming games with availability controls.',
        'Restrict writes to the signed-in user or team leadership.',
      ]}
      title="Availability"
    />
  );
}

export function NewsPage() {
  return (
    <TeamPageTemplate
      description="News is team-specific in the rebuild, so each team gets its own feed without requiring a club-wide newsroom."
      nextSteps={[
        'Create team-scoped news post documents.',
        'Add image uploads under team-prefixed storage paths.',
        'Limit publish and edit actions to captains and co-captains.',
      ]}
      title="News"
    />
  );
}

export function SettingsPage() {
  return (
    <TeamPageTemplate
      description="Team settings will hold branding, team metadata, join settings, and member role management."
      nextSteps={[
        'Persist team profile fields including logo URL and slug.',
        'Add join-code rotation and membership role controls.',
        'Expose safe self-service team settings to captains and co-captains.',
      ]}
      title="Settings"
    />
  );
}

export function AdminPage() {
  return (
    <TeamPageTemplate
      description="The first version keeps club administration lightweight. This area is for team-level admin tasks, while club-admin recovery tools stay restricted and minimal."
      nextSteps={[
        'Separate team-level admin actions from club-admin utilities.',
        'Show pairings management to captains and co-captains.',
        'Add safety checks around captain assignment and team archival.',
      ]}
      title="Admin"
    />
  );
}
