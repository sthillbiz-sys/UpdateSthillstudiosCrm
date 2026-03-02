import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiPost, clearStoredSession, getStoredToken, getStoredUser, persistSession, type ApiUser } from './api';

type AuthContextType = {
  user: ApiUser | null;
  loading: boolean;
  token: string;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    nameOrEmail: string,
    emailOrPassword: string,
    maybePassword?: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(() => getStoredUser());
  const [token, setToken] = useState<string>(() => getStoredToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    const onExpired = () => {
      clearStoredSession();
      setUser(null);
      setToken('');
    };

    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const data = await apiPost<{ token: string; user: ApiUser }>(
        '/auth/login',
        { email, password },
      );

      persistSession(data.token, data.user);
      setToken(data.token);
      setUser(data.user);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Unable to sign in') };
    }
  }, []);

  const signUp = useCallback(
    async (nameOrEmail: string, emailOrPassword: string, maybePassword?: string) => {
      const hasExplicitName = typeof maybePassword === 'string';
      const name = hasExplicitName ? nameOrEmail : nameOrEmail.split('@')[0] || 'User';
      const email = hasExplicitName ? emailOrPassword : nameOrEmail;
      const password = hasExplicitName ? maybePassword : emailOrPassword;

    try {
      const data = await apiPost<{ token: string; user: ApiUser }>(
        '/auth/signup',
        { name, email, password },
      );

      persistSession(data.token, data.user);
      setToken(data.token);
      setUser(data.user);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Unable to sign up') };
    }
    },
    [],
  );

  const signOut = useCallback(async () => {
    clearStoredSession();
    setToken('');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      token,
      signIn,
      signUp,
      signOut,
    }),
    [loading, signIn, signOut, signUp, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
