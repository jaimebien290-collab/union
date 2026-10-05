import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { CategoryCode } from '@union/shared';

import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  program: string | null;
  study_year: number | null;
  is_newcomer: boolean;
  bio: string | null;
  avatar_url: string | null;
  interests: CategoryCode[];
  role: 'student' | 'ambassador' | 'school_admin' | 'super_admin';
  is_mentor: boolean;
  status: 'active' | 'suspended' | 'deleted';
};

const PROFILE_COLUMNS =
  'id, school_id, first_name, last_name, email, program, study_year, is_newcomer, bio, avatar_url, interests, role, is_mentor, status';

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

type SessionContext = {
  session: Session | null;
  /** null = connecté mais inscription pas terminée. */
  profile: Profile | null;
  loading: boolean;
  profileError: boolean;
  retryProfile: () => void;
  /** Recharge le profil et le renvoie (utile juste après une connexion ou une modification). */
  loadProfile: (userId: string) => Promise<Profile | null>;
  /**
   * Vrai pendant un parcours qui doit aller à son terme (nouveau mot de passe, fin d'inscription) :
   * tant qu'il l'est, on ne redirige pas vers l'app même si le compte est complet.
   */
  inFlow: boolean;
  setInFlow: (value: boolean) => void;
  /** Message à afficher sur l'écran d'accueil après une déconnexion forcée. */
  notice: string | null;
  setNotice: (value: string | null) => void;
  signOut: () => Promise<void>;
};

const Context = createContext<SessionContext | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [inFlow, setInFlow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Charge le profil et applique F-AUTH-09 : un compte suspendu (ou supprimé) est déconnecté sur-le-champ,
  // avec le message prévu sur l'écran d'accueil.
  const fetchCheckedProfile = useCallback(async (id: string) => {
    const result = await fetchProfile(id);
    if (result && result.status !== 'active') {
      if (result.status === 'suspended') setNotice('Ton compte a été suspendu, contacte ton école.');
      setInFlow(false);
      await supabase.auth.signOut({ scope: 'local' });
    }
    return result;
  }, []);

  const userId = session?.user.id;
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: () => fetchCheckedProfile(userId!),
  });
  const profile = profileQuery.data ?? null;
  const status = profile?.status;

  const signOut = useCallback(async () => {
    // « local » : marche aussi hors connexion, ou si le compte vient d'être supprimé côté serveur.
    await supabase.auth.signOut({ scope: 'local' });
    setInFlow(false);
    queryClient.clear();
  }, [queryClient]);

  const loadProfile = useCallback(
    (id: string) => queryClient.fetchQuery({ queryKey: ['profile', id], queryFn: () => fetchCheckedProfile(id), staleTime: 0 }),
    [queryClient, fetchCheckedProfile],
  );

  const value = useMemo<SessionContext>(
    () => ({
      session,
      profile: status === 'active' ? profile : null,
      loading: !ready || (Boolean(userId) && profileQuery.isPending),
      profileError: profileQuery.isError,
      retryProfile: () => profileQuery.refetch(),
      loadProfile,
      inFlow,
      setInFlow,
      notice,
      setNotice,
      signOut,
    }),
    [session, profile, status, ready, userId, profileQuery, loadProfile, inFlow, notice, signOut],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error('useSession doit être utilisé dans SessionProvider');
  return value;
}

export type School = { id: string; name: string; programs: string[] };

/** L'école correspondant à l'email du compte connecté. Fonctionne avant que le profil existe. */
export function useMySchool() {
  const { session } = useSession();
  const email = session?.user.email;
  return useQuery({
    queryKey: ['my-school', email],
    enabled: Boolean(email),
    staleTime: Infinity,
    queryFn: async (): Promise<School | null> => {
      const { data, error } = await supabase.rpc('check_school_domain', { p_email: email });
      if (error) throw error;
      const row = (data as { school_id: string; school_name: string; programs: string[] }[])[0];
      return row ? { id: row.school_id, name: row.school_name, programs: row.programs ?? [] } : null;
    },
  });
}
