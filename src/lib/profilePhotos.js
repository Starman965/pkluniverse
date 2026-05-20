export function isGooglePhotoUrl(url = '') {
  return String(url).includes('googleusercontent.com');
}

export function isCustomHeadshotUrl(url = '') {
  const trimmed = String(url).trim();

  if (!trimmed || isGooglePhotoUrl(trimmed)) {
    return false;
  }

  return (
    trimmed.includes('firebasestorage.googleapis.com') ||
    trimmed.includes('storage.googleapis.com')
  );
}

export function normalizeStoredHeadshotUrl(url = '') {
  const trimmed = String(url).trim();

  if (!trimmed || isGooglePhotoUrl(trimmed)) {
    return '';
  }

  return trimmed;
}

export function resolveProfileAvatarUrl(profile = {}, authPhotoUrl = '') {
  const customHeadshot = normalizeStoredHeadshotUrl(profile.headshotUrl ?? '');

  if (customHeadshot) {
    return customHeadshot;
  }

  return profile.photoURL || authPhotoUrl || '';
}

export function resolvePlayerAvatarUrl({ authPhotoUrl = '', player = {}, profile = null } = {}) {
  if (profile) {
    return resolveProfileAvatarUrl(profile, authPhotoUrl);
  }

  const customHeadshot = normalizeStoredHeadshotUrl(player.headshotUrl ?? '');

  if (customHeadshot) {
    return customHeadshot;
  }

  const rawHeadshotUrl = String(player.headshotUrl ?? '').trim();

  return player.photoURL || rawHeadshotUrl || authPhotoUrl || '';
}
