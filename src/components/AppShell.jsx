import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const teamRoutes = [
  { label: 'Dashboard', to: '' },
  { label: 'Roster', to: 'roster' },
  { label: 'Schedule', to: 'schedule' },
  { label: 'Availability', to: 'availability' },
  { label: 'News', to: 'news' },
  { label: 'Settings', to: 'settings' },
  { label: 'Admin', to: 'admin' },
];

const sampleMemberships = [
  { label: 'Blackhawk / Hawks', clubSlug: 'blackhawk', teamSlug: 'hawks' },
  { label: 'Blackhawk / Falcons', clubSlug: 'blackhawk', teamSlug: 'falcons' },
];

export default function AppShell() {
  const { signOutUser, user } = useAuth();
  const { clubSlug, teamSlug } = useParams();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img alt="Blackhawk logo" className="sidebar__logo" src="./logo.jpg" />
          <div>
            <p className="eyebrow">Blackhawk Club App</p>
            <h1>Team workspace</h1>
          </div>
        </div>

        <div className="sidebar__section">
          <p className="sidebar__label">Active team</p>
          <div className="team-switcher">
            {sampleMemberships.map((membership) => {
              const active =
                membership.clubSlug === clubSlug && membership.teamSlug === teamSlug;

              return (
                <NavLink
                  key={membership.label}
                  className={`team-pill ${active ? 'team-pill--active' : ''}`}
                  to={`/c/${membership.clubSlug}/t/${membership.teamSlug}`}
                >
                  {membership.label}
                </NavLink>
              );
            })}
          </div>
        </div>

        <nav className="sidebar__nav">
          {teamRoutes.map((route) => (
            <NavLink
              key={route.label}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
              end={route.to === ''}
              to={route.to}
            >
              {route.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <p className="sidebar__label">Signed in as</p>
          <strong>{user?.displayName ?? user?.email}</strong>
          <button className="button button--ghost" onClick={signOutUser} type="button">
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
