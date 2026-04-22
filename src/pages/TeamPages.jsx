import TeamPageTemplate from './TeamPageTemplate';

export function TeamDashboardPage() {
  return (
    <TeamPageTemplate
      description="This dashboard is the landing surface for a selected team. It will summarize roster health, upcoming fixtures, availability, standings snapshot, and recent team news."
      nextSteps={[
        'Load the active club and team documents from Firestore.',
        'Show team branding, captain roles, and join-code status.',
        'Add summary cards for schedule, availability, standings, and news.',
      ]}
      title="Team dashboard"
    />
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
