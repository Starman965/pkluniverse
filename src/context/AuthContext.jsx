import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../lib/firebase';
import { syncUserProfile } from '../lib/data';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return undefined;
    }

    getRedirectResult(auth).catch((error) => {
      setAuthError(error.message);
    });

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      },
      (error) => {
        setAuthError(error.message);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || !isFirebaseConfigured) {
      return;
    }

    syncUserProfile(user).catch((error) => {
      setAuthError(error.message ?? 'Unable to sync your user profile.');
    });
  }, [user]);

  async function signInWithGoogle() {
    if (!auth || !googleProvider) {
      setAuthError('Firebase is not configured yet.');
      return;
    }

    setAuthError('');

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const popupBlocked =
        error?.code === 'auth/popup-blocked' ||
        error?.code === 'auth/cancelled-popup-request' ||
        error?.code === 'auth/popup-closed-by-user';

      if (popupBlocked) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }

      setAuthError(error.message ?? 'Unable to sign in right now.');
      throw error;
    }
  }

  async function signOutUser() {
    if (!auth) {
      return;
    }

    await signOut(auth);
  }

  const value = useMemo(
    () => ({
      authError,
      isAuthenticated: Boolean(user),
      isFirebaseConfigured,
      loading,
      signInWithGoogle,
      signOutUser,
      user,
    }),
    [authError, loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
