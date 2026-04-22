import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isFirebaseConfigured, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="state-panel">Checking your sign-in status...</div>;
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="state-panel">
        <h2>Firebase setup required</h2>
        <p>
          Add your Firebase web app values to <code>.env</code> to enable Google sign-in and
          team data.
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/auth" />;
  }

  return children;
}
