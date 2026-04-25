const ONBOARDING_INTENT_KEY = 'pkl-onboarding-intent';

function parseIntent(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

export function readOnboardingIntent() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const localIntent = parseIntent(window.localStorage.getItem(ONBOARDING_INTENT_KEY));

    if (localIntent) {
      return localIntent;
    }
  } catch {
    // Storage can be unavailable in restricted browsing contexts.
  }

  try {
    return parseIntent(window.sessionStorage.getItem(ONBOARDING_INTENT_KEY));
  } catch {
    return null;
  }
}

export function writeOnboardingIntent(intent) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextValue = JSON.stringify(intent);

  try {
    window.localStorage.setItem(ONBOARDING_INTENT_KEY, nextValue);
  } catch {
    // Session storage fallback is enough for browsers that block local storage.
  }

  try {
    window.sessionStorage.setItem(ONBOARDING_INTENT_KEY, nextValue);
  } catch {
    // If both storage APIs are unavailable, Firebase redirect can still continue.
  }
}

export function clearOnboardingIntent() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(ONBOARDING_INTENT_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }

  try {
    window.sessionStorage.removeItem(ONBOARDING_INTENT_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}
