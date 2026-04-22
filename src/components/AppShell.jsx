import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listMemberships } from '../lib/data';

const teamRoutes = [
  { label: 'Dashboard', to: '' },
  { label: 'Roster', to: 'roster' },
  { label: 'Schedule', to: 'schedule' },
  { label: 'Availability', to: 'availability' },
  { label: 'News', to: 'news' },
  { label: 'Settings', to: 'settings' },
  { label: 'Admin', to: 'admin' },
];

export default function AppShell() {
  const { signOutUser, user } = useAuth();
  const { clubSlug, teamSlug } = useParams();
  const [memberships, setMemberships] = useState([]);

  useEffect(() => {
    let ignore = false;

    if (!user?.uid) {
      setMemberships([]);
      return undefined;
    }

    listMemberships(user.uid)
      .then((items) => {
        if (!ignore) {
          setMemberships(items);
        }
      })
      .catch(() => {
        if (!ignore) {
          setMemberships([]);
        }
      });

    return () => {
      ignore = true;
    };
  }, [user?.uid]);

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
            {memberships.length === 0 ? (
              <p className="sidebar__empty">No teams yet. Create one or join with a code.</p>
            ) : null}

            {memberships.map((membership) => {
              const active =
                membership.clubSlug === clubSlug && membership.teamSlug === teamSlug;

              return (
                <NavLink
                  key={`${membership.clubSlug}-${membership.teamSlug}`}
                  className={`team-pill ${active ? 'team-pill--active' : ''}`}
                  to={`/c/${membership.clubSlug}/t/${membership.teamSlug}`}
                >
                  <strong>{membership.teamName}</strong>
                  <span className="team-pill__meta">
                    {membership.clubSlug} · {membership.role}
                  </span>
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
