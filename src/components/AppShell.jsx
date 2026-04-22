import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listMemberships } from '../lib/data';
import pklUniverseLogo from '../../pkl_universe_logo.png';

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
  const [membershipError, setMembershipError] = useState('');

  const loadMemberships = useCallback(async () => {
    if (!user?.uid) {
      setMemberships([]);
      setMembershipError('');
      return;
    }

    try {
      const items = await listMemberships(user.uid);
      setMemberships(items);
      setMembershipError('');
    } catch (error) {
      setMembershipError(error.message ?? 'Unable to load your teams yet.');
    }
  }, [user?.uid]);

  useEffect(() => {
    loadMemberships();

    const intervalId = window.setInterval(() => {
      loadMemberships();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [clubSlug, loadMemberships, teamSlug]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img alt="PKL Universe logo" className="sidebar__logo" src={pklUniverseLogo} />
          <div>
            <p className="eyebrow">PKL Universe</p>
            <h1>Team workspace</h1>
          </div>
        </div>

        <div className="sidebar__section">
          <p className="sidebar__label">Active team</p>
          <div className="team-switcher">
            {membershipError ? (
              <p className="sidebar__empty">
                Team list is still syncing. Refresh after your Firestore index finishes building.
              </p>
            ) : null}

            {memberships.length === 0 && !membershipError ? (
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
