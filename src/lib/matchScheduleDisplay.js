const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseIsoDateParts(isoDate = '') {
  const match = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  return {
    day: String(day),
    monthAbbr: MONTH_ABBREVIATIONS[month - 1],
  };
}

export function formatProposedWindowDisplayLabel({ isoDate = '', location = '', timeLabel = '' } = {}) {
  const dateParts = parseIsoDateParts(isoDate);
  const datePart = dateParts ? `${dateParts.monthAbbr} ${dateParts.day}` : 'Date TBD';
  const timePart = timeLabel || 'Time TBD';
  const locationPart = location && location !== 'Location TBD' ? location : '';

  return [datePart, timePart, locationPart].filter(Boolean).join(' · ');
}

export function formatIsoDateForDisplay(isoDate = '') {
  const dateParts = parseIsoDateParts(isoDate);

  if (!dateParts) {
    return 'Date TBD';
  }

  return `${dateParts.monthAbbr} ${dateParts.day}`;
}
