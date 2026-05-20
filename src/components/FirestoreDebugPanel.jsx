export default function FirestoreDebugPanel({ debugInfo, label = 'Technical details for support' }) {
  if (!debugInfo) {
    return null;
  }

  return (
    <details className="firestore-debug">
      <summary>{label}</summary>
      <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
    </details>
  );
}
