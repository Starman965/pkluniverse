export const TEAM_DIVISION_VALUES = ['men', 'women', 'mixed'];

export const TEAM_DIVISION_OPTIONS = [
  { label: 'Not set', value: '' },
  { label: 'Men', value: 'men' },
  { label: 'Women', value: 'women' },
  { label: 'Mixed', value: 'mixed' },
];

export function normalizeTeamDivision(value) {
  return TEAM_DIVISION_VALUES.includes(value) ? value : '';
}

export function getTeamDivisionLabel(value) {
  const normalizedValue = normalizeTeamDivision(value);

  if (normalizedValue === 'men') {
    return 'Division: Men';
  }

  if (normalizedValue === 'women') {
    return 'Division: Women';
  }

  if (normalizedValue === 'mixed') {
    return 'Division: Mixed';
  }

  return '';
}

export function getVisibleTeamDivisionLabel(team) {
  return getTeamDivisionLabel(team.teamDivision);
}
