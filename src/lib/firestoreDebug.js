export function isFirestorePermissionError(error) {
  return (
    error?.code === 'permission-denied' ||
    /missing or insufficient permissions/i.test(error?.message ?? '')
  );
}

export function formatFirestoreDebugError(error, context = {}) {
  return {
    step: context.step ?? 'unknown',
    code: error?.code ?? '',
    message: error?.message ?? String(error ?? 'Unknown error'),
    routeClub: context.clubSlug ?? '',
    routeTeam: context.teamSlug ?? '',
    uid: context.uid ?? '',
    email: context.email ?? '',
    membershipFound: context.membershipFound ?? null,
    activeClubSlug: context.activeClubSlug ?? '',
    timestamp: new Date().toISOString(),
    ...context.extra,
  };
}

export function createFirestoreStepError(step, error, context = {}) {
  const debugInfo = formatFirestoreDebugError(error, { step, ...context });

  console.error(`[Firestore:${step}]`, debugInfo, error);

  const wrapped = new Error(
    isFirestorePermissionError(error)
      ? 'Missing or insufficient permissions.'
      : (error?.message ?? 'Request failed.'),
  );
  wrapped.debugInfo = debugInfo;
  return wrapped;
}

export function extractFirestoreDebugInfo(error, fallbackContext = {}) {
  if (error?.debugInfo) {
    return error.debugInfo;
  }

  return formatFirestoreDebugError(error, fallbackContext);
}
