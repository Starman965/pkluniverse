import { getTeamDivisionLabel, normalizeTeamDivision } from '../lib/teamDivision';

function TeamDivisionIcon({ value }) {
  const division = normalizeTeamDivision(value);

  if (division === 'men') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <circle cx="9.5" cy="14.5" r="5.5" />
        <path d="M13.5 10.5 20 4m0 0h-5.2M20 4v5.2" />
      </svg>
    );
  }

  if (division === 'women') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="5.5" />
        <path d="M12 13.5V21m-4-3.7h8" />
      </svg>
    );
  }

  if (division === 'mixed') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <circle cx="10" cy="10" r="4.7" />
        <path d="M13.4 6.6 19 1m0 0h-4.6M19 1v4.6M10 14.7V22m-3.6-3.6h7.2" />
      </svg>
    );
  }

  return <span aria-hidden="true">-</span>;
}

export default function TeamDivisionLabel({ className = '', showLabel = true, value }) {
  const label = getTeamDivisionLabel(value);
  const classNames = ['team-division-label', className].filter(Boolean).join(' ');

  if (!label && showLabel) {
    return null;
  }

  return (
    <span className={classNames} aria-label={label || 'No team division selected'}>
      <TeamDivisionIcon value={value} />
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}
