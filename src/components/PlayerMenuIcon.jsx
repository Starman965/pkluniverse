/** Icons for team hub primary nav (stroke SVGs — matches `AppShell` / `.nav-link svg` rules). */
export default function PlayerMenuIcon({ type }) {
  if (type === 'news') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="m4 11 8-7 8 7" />
        <path d="M6.5 10.5V20h11v-9.5" />
        <path d="M10 20v-5h4v5" />
      </svg>
    );
  }

  if (type === 'members') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M2.8 20a5.8 5.8 0 0 1 11.4 0" />
        <path d="M16.5 10.5a3 3 0 1 0-1.1-5.8M16.2 14.2A5 5 0 0 1 21.2 20" />
      </svg>
    );
  }

  if (type === 'competition') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M7 17 17 7" />
        <path d="M14 4h6v6" />
        <path d="M10 20H4v-6" />
      </svg>
    );
  }

  if (type === 'matches') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M6.5 3.5v3M17.5 3.5v3M4.5 8h15" />
        <path d="M5 5.5h14v15H5z" />
        <path d="M8 12h3v3H8zM14 12h2" />
      </svg>
    );
  }

  if (type === 'standings') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M5 20V9h4v11M10 20V4h4v16M15 20v-7h4v7" />
      </svg>
    );
  }

  if (type === 'events') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M6.5 3.5v3M17.5 3.5v3M4.5 8h15" />
        <path d="M5 5.5h14v15H5z" />
        <path d="M8 12h3M8 16h7M14 12h2" />
      </svg>
    );
  }

  if (type === 'activity') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M4 19V5" />
        <path d="M4 17c2.2 0 3.1-1.5 4.4-4.5C9.5 9.9 10.4 8 12 8s2.5 1.9 3.6 4.5C16.9 15.5 17.8 17 20 17" />
        <path d="M7 19h14" />
      </svg>
    );
  }

  if (type === 'club') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M4 20V8l8-4 8 4v12" />
        <path d="M9 20v-7h6v7M7 10.5h2M15 10.5h2" />
      </svg>
    );
  }

  if (type === 'profile') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </svg>
    );
  }

  if (type === 'help') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.8 9.3a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  if (type === 'signout') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M10 17 15 12 10 7" />
        <path d="M15 12H3" />
        <path d="M14 4h5v16h-5" />
      </svg>
    );
  }

  if (type === 'switch') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M7 7h11" />
        <path d="m15 4 3 3-3 3" />
        <path d="M17 17H6" />
        <path d="m9 14-3 3 3 3" />
      </svg>
    );
  }

  if (type === 'admin') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M12 3 19 6v5c0 4.4-2.8 8.1-7 10-4.2-1.9-7-5.6-7-10V6l7-3Z" />
        <path d="M9.5 12.2 11.2 14l3.5-4" />
      </svg>
    );
  }

  return null;
}
