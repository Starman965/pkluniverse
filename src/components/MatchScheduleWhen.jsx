import { parseIsoDateParts } from '../lib/matchScheduleDisplay';

function normalizeDisplayTime(timeLabel = '') {
  return String(timeLabel ?? '').replace(':undefined', ':00').trim();
}

export default function MatchScheduleWhen({
  className = '',
  isoDate = '',
  location = '',
  timeLabel = '',
}) {
  const dateParts = parseIsoDateParts(isoDate);
  const normalizedTime = normalizeDisplayTime(timeLabel);
  const normalizedLocation = String(location ?? '').trim();
  const showLocation = normalizedLocation && normalizedLocation !== 'Location TBD';

  if (!dateParts) {
    return (
      <div className={`match-schedule-when match-schedule-when--tbd ${className}`.trim()}>
        <div className="match-schedule-when__date-card match-schedule-when__date-card--tbd">
          <span className="match-schedule-when__month">TBD</span>
        </div>
        <div className="match-schedule-when__details">
          <span className="match-schedule-when__time">{normalizedTime || 'Time TBD'}</span>
          {showLocation ? <span className="match-schedule-when__location">{normalizedLocation}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`match-schedule-when ${className}`.trim()}>
      <div className="match-schedule-when__date-card" aria-hidden="true">
        <span className="match-schedule-when__month">{dateParts.monthAbbr}</span>
        <span className="match-schedule-when__day">{dateParts.day}</span>
      </div>
      <div className="match-schedule-when__details">
        <span className="match-schedule-when__time">{normalizedTime || 'Time TBD'}</span>
        {showLocation ? <span className="match-schedule-when__location">{normalizedLocation}</span> : null}
      </div>
    </div>
  );
}
