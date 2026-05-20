function getScheduleViewedStorageKey(clubSlug, teamSlug) {
  return `pxl-schedule-viewed::${clubSlug}::${teamSlug}`;
}

export function getTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getScheduleLastViewedMs(clubSlug, teamSlug) {
  if (!clubSlug || !teamSlug || typeof window === 'undefined') {
    return 0;
  }

  const storedValue = window.localStorage.getItem(getScheduleViewedStorageKey(clubSlug, teamSlug));

  if (!storedValue) {
    return 0;
  }

  const parsed = Number(storedValue);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function markScheduleViewed(clubSlug, teamSlug, viewedAtMs = Date.now()) {
  if (!clubSlug || !teamSlug || typeof window === 'undefined') {
    return viewedAtMs;
  }

  window.localStorage.setItem(getScheduleViewedStorageKey(clubSlug, teamSlug), String(viewedAtMs));

  return viewedAtMs;
}

function isCompletedGame(game) {
  return game?.matchStatus === 'completed' || game?.matchStatus === 'final';
}

export function gameBelongsInPast(game, todayDateKey) {
  if (!game?.isoDate) {
    return false;
  }

  return game.isoDate < todayDateKey;
}

export function isGameNeedsScheduling(game) {
  if (isCompletedGame(game)) {
    return false;
  }

  return game?.dateTbd === true || !game?.isoDate;
}

export function isGameNewScheduled(game, lastViewedMs, todayDateKey) {
  if (isCompletedGame(game)) {
    return false;
  }

  if (gameBelongsInPast(game, todayDateKey)) {
    return false;
  }

  if (isGameNeedsScheduling(game)) {
    return false;
  }

  const createdAtMs = Number(game?.createdAtMs) || 0;

  if (!createdAtMs) {
    return false;
  }

  return createdAtMs > lastViewedMs;
}

export function countScheduleAttentionGames(games = [], lastViewedMs = 0, todayDateKey = getTodayDateKey()) {
  let needsSchedulingCount = 0;
  let newScheduledCount = 0;

  games.forEach((game) => {
    if (isCompletedGame(game) || gameBelongsInPast(game, todayDateKey)) {
      return;
    }

    if (isGameNeedsScheduling(game)) {
      needsSchedulingCount += 1;
      return;
    }

    if (isGameNewScheduled(game, lastViewedMs, todayDateKey)) {
      newScheduledCount += 1;
    }
  });

  return {
    needsSchedulingCount,
    newScheduledCount,
    total: needsSchedulingCount + newScheduledCount,
  };
}

export function buildScheduleAttentionLabel({ needsSchedulingCount = 0, newScheduledCount = 0, total = 0 } = {}) {
  if (!total) {
    return '';
  }

  const parts = [];

  if (needsSchedulingCount > 0) {
    parts.push(
      `${needsSchedulingCount} match${needsSchedulingCount === 1 ? '' : 'es'} still need${needsSchedulingCount === 1 ? 's' : ''} a date`,
    );
  }

  if (newScheduledCount > 0) {
    parts.push(`${newScheduledCount} new scheduled match${newScheduledCount === 1 ? '' : 'es'}`);
  }

  return parts.join(', ');
}
