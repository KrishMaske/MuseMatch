import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { setAccessTokenProvider } from '@/api/client';
import { env, isSupabaseConfigured } from '@/lib/env';

/**
 * Identity.
 *
 * Supabase owns authentication; this provider owns the session in React and
 * hands the access token to the API client. The development bypass exists so
 * the app can be run end to end against seed data without a Supabase project,
 * and is gated on both sides -- the server refuses it unless it is also
 * configured for it, and never in production.
 */

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl as string, env.supabaseAnonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

interface AuthContextValue {
  session: Session | null;
  /** True while the initial session is being restored from storage. */
  loading: boolean;
  isAuthenticated: boolean;
  email: string | null;
  /** True when running on the development identity rather than a real session. */
  isDevSession: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Returns whether the project requires an emailed confirmation link before
   * the account can be used. With auto-confirm on, sign-up returns a session
   * immediately and the caller should go straight into the app.
   */
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The token the API client reads, held outside React.
 *
 * Registering the provider from an effect would be too late: effects run
 * child-first, so a child's very first query could fire before the provider
 * had the token. Holding it here and registering once at module load means the
 * token is correct from the first request, without a side effect during render
 * (which would misbehave under StrictMode and concurrent rendering).
 */
let currentSession: Session | null = null;
setAccessTokenProvider(() => currentSession?.access_token ?? null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Updating the holder alongside React state keeps the two in step; a
  // refreshed token reaches the API client on the same tick as the re-render.
  const setSession = useCallback((next: Session | null) => {
    currentSession = next;
    setSessionState(next);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      // Cached data belongs to whoever was signed in; drop it on any change.
      queryClient.clear();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [queryClient, setSession]);

  const value = useMemo<AuthContextValue>(() => {
    const isDevSession = env.devAuthBypass && !session;

    return {
      session,
      loading,
      isAuthenticated: Boolean(session) || isDevSession,
      email: session?.user.email ?? (isDevSession ? 'dev@musematch.local' : null),
      isDevSession,

      async signIn(email, password) {
        if (!supabase) throw new Error('Sign-in needs a Supabase project. See the README.');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      },

      async signUp(email, password) {
        if (!supabase) throw new Error('Sign-up needs a Supabase project. See the README.');
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw new Error(error.message);
        return { needsEmailConfirmation: !data.session };
      },

      async signOut() {
        if (supabase) await supabase.auth.signOut();
        setSession(null);
        queryClient.clear();
      },
    };
  }, [session, loading, queryClient, setSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}
