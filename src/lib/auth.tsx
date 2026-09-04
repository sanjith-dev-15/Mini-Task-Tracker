import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { getApp } from '@react-native-firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from '@react-native-firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * The "Web client" OAuth client ID Firebase auto-creates when you enable
 * Google as a sign-in provider (Firebase console → Authentication → Sign-in
 * method → Google → the "Web SDK configuration" section). It is NOT the
 * Android client ID, and it's safe to ship in the app (it identifies the
 * project, it isn't a secret).
 */
const WEB_CLIENT_ID =
  '476991889871-qadrf1obq6lonr9q7g268kvd0dshesld.apps.googleusercontent.com';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  configured = true;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, offlineAccess: false });
}

export type AuthUser = {
  uid: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
};

type AuthContextValue = {
  /** null until the first auth-state callback fires. */
  user: AuthUser | null;
  /** True until Firebase has reported the initial signed-in/out state. */
  initializing: boolean;
  /** True while a sign-in or sign-out is in flight. */
  busy: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toUser(u: FirebaseUser | null): AuthUser | null {
  if (!u) return null;
  return { uid: u.uid, email: u.email, name: u.displayName, photoURL: u.photoURL };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigured();
    const auth = getAuth(getApp());
    return onAuthStateChanged(auth, (u) => {
      setUser(toUser(u));
      setInitializing(false);
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      ensureConfigured();
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
      const idToken = res.data?.idToken;
      if (!idToken) throw new Error('Google did not return an ID token.');
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(getAuth(getApp()), credential);
    } catch (e) {
      console.warn('Google sign-in failed', e);
      setError('Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await firebaseSignOut(getAuth(getApp()));
      await GoogleSignin.signOut().catch(() => {});
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, busy, error, signInWithGoogle, signOut }),
    [user, initializing, busy, error, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
