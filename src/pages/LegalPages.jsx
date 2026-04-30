import { Link } from 'react-router-dom';

const LAST_UPDATED = 'April 29, 2026';

function LegalPage({ children, eyebrow, title }) {
  return (
    <div className="marketing-page legal-page">
      <section className="card legal-card">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-card__updated">Last updated: {LAST_UPDATED}</p>
        {children}
        <div className="legal-card__footer">
          <Link className="button button--ghost" to="/">
            Back to homepage
          </Link>
        </div>
      </section>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalPage eyebrow="Privacy" title="Privacy Policy">
      <p>
        PKL Universe helps clubs, captains, and players organize teams, rosters, schedules, availability, challenges,
        and team updates. This policy explains the information we collect and how we use it.
      </p>

      <h2>Information We Collect</h2>
      <p>
        When you sign in, we may receive your Google account identifier, name, email address, and profile photo. Within
        the app, users may add team names, club names, player names, phone numbers, skill levels, availability, roster
        assignments, schedules, match scores, comments, reactions, logos, headshots, and news feed images or posts.
      </p>

      <h2>How We Use Information</h2>
      <p>
        We use this information to operate the app, show the right team and club information to members, support captain
        and admin tools, keep rosters and schedules organized, and improve the reliability and performance of the
        platform.
      </p>

      <h2>Sharing and Visibility</h2>
      <p>
        Team and club information may be visible to teammates, captains, club administrators, and platform administrators
        depending on their role. Public directory or club information may be visible to signed-in users. We do not sell
        personal information.
      </p>

      <h2>Storage and Service Providers</h2>
      <p>
        PKL Universe uses Firebase services for authentication, database storage, file storage, and hosting-related app
        functionality. Images uploaded through the app may be resized or converted to WebP to improve performance.
      </p>

      <h2>Your Choices</h2>
      <p>
        You can update many profile and team details in the app. Captains and administrators may manage team, roster,
        club, and content records. To request help with access, correction, or removal of information, contact the app
        administrator.
      </p>

      <h2>Account Deletion Requests</h2>
      <p>
        PKL Universe does not currently offer a self-service account deletion button. If you want your account or
        personal information removed, contact the app administrator. Some team, match, roster, or administrative records
        may need to be retained or de-identified so shared team history and platform operations continue to work.
      </p>

      <h2>Team Deactivation</h2>
      <p>
        Captains or administrators may deactivate or archive a team. Deactivation generally removes the team from active
        use and navigation, but it does not automatically delete all team records, member history, schedules, scores,
        posts, images, or related club and challenge records.
      </p>

      <h2>Security</h2>
      <p>
        We use role-based access controls and Firebase security rules to limit access to app data. No online service can
        guarantee perfect security, so users should avoid posting sensitive information that is not needed for team
        operations.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy as the app changes. Continued use of PKL Universe after updates means you accept the
        revised policy.
      </p>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage eyebrow="Terms" title="Terms of Use">
      <p>
        These terms govern your use of PKL Universe. By using the app, you agree to use it responsibly and only for
        lawful team, club, roster, scheduling, and pickleball-related activities.
      </p>

      <h2>Accounts and Access</h2>
      <p>
        You are responsible for activity under your account. Team access, captain tools, club administration, and platform
        administration depend on the role assigned to your signed-in account.
      </p>

      <h2>User Content</h2>
      <p>
        Users may submit team names, player details, availability, match information, comments, posts, images, logos, and
        other content. You are responsible for content you submit and must have the right to upload or share it.
      </p>

      <h2>Acceptable Use</h2>
      <p>
        Do not use PKL Universe to upload unlawful, abusive, misleading, infringing, or harmful content. Do not attempt
        to access teams, clubs, accounts, or data you are not authorized to access.
      </p>

      <h2>Team and Club Administration</h2>
      <p>
        Captains, co-captains, club administrators, and platform administrators may update or remove team, roster, club,
        challenge, schedule, image, and news content when needed to operate the platform.
      </p>

      <h2>Team Deactivation</h2>
      <p>
        Captains and authorized administrators may deactivate or archive a team. A deactivated team may no longer appear
        as active or be available for normal team activity, but related records may remain for history, administration,
        dispute resolution, audit, or platform integrity purposes.
      </p>

      <h2>Account Removal</h2>
      <p>
        Self-service account deletion is not currently available. Users may request account or personal information
        removal by contacting the app administrator. Removal may be limited where information is part of shared team,
        match, club, roster, or administrative records.
      </p>

      <h2>Service Availability</h2>
      <p>
        PKL Universe is provided as-is and may change, experience downtime, or be discontinued. We are not responsible for
        missed matches, scheduling disputes, lost data, or other indirect losses related to use of the app.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms as the app changes. Continued use of PKL Universe after updates means you accept the
        revised terms.
      </p>
    </LegalPage>
  );
}

export function ContactPage() {
  return (
    <LegalPage eyebrow="Contact" title="Contact PKL Universe">
      <p>
        For help with account access, team setup, club administration, data correction or removal requests, bug reports,
        or general PKL Universe questions, contact the app administrator.
      </p>

      <p>
        Clubs interested in using PKL Universe for organized team play can also use this contact email to ask about setup,
        club administration, and how the platform can fit alongside regular drop-ins, ladders, leagues, or recurring
        player groups.
      </p>

      <h2>Email</h2>
      <p>
        <a href="mailto:demandgendave@gmail.com">demandgendave@gmail.com</a>
      </p>

      <h2>What To Include</h2>
      <p>
        Please include your name, the team or club involved, the email address you use to sign in, and a short
        description of what you need help with.
      </p>

      <h2>Account and Data Requests</h2>
      <p>
        If you are asking about account removal, profile changes, team deactivation, or data removal, include enough
        detail for the administrator to identify the relevant account, team, club, or content.
      </p>
    </LegalPage>
  );
}
