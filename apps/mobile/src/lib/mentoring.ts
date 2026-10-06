import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Activity } from '@/lib/activities';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type Partner = { id: string; first_name: string; last_name: string; avatar_url: string | null; program: string | null };

export type Mentorship = {
  id: string;
  mentee_id: string;
  mentor_id: string | null;
  status: 'requested' | 'proposed' | 'active';
  /** L'autre personne du binôme, si elle est connue et visible. */
  partner: Partner | null;
};

/** F-MENT-01 : le parrainage peut être désactivé par l'école. */
export function useMentoringEnabled() {
  const { profile } = useSession();
  return (
    useQuery({
      queryKey: ['mentoring', 'enabled', profile?.school_id],
      enabled: Boolean(profile),
      staleTime: 10 * 60_000,
      queryFn: async () => {
        const { data, error } = await supabase.from('schools').select('settings').maybeSingle();
        if (error) throw error;
        return (data?.settings as { mentoring_enabled?: boolean } | null)?.mentoring_enabled !== false;
      },
    }).data ?? false
  );
}

/** Mes parrainages en cours : celui où je suis filleul, et ceux où je suis parrain (demandes et filleuls). */
export function useMentorships() {
  const { profile } = useSession();
  const me = profile?.id;
  return useQuery({
    queryKey: ['mentoring', 'mine', me],
    enabled: Boolean(me),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mentorships')
        .select('id, mentee_id, mentor_id, status')
        .neq('status', 'ended')
        .order('created_at');
      if (error) throw error;
      const rows = data as Omit<Mentorship, 'partner'>[];

      const partnerIds = rows.map((row) => (row.mentee_id === me ? row.mentor_id : row.mentee_id)).filter((id): id is string => Boolean(id));
      const partners = new Map<string, Partner>();
      if (partnerIds.length) {
        const profiles = await supabase.from('public_profiles').select('id, first_name, last_name, avatar_url, program').in('id', partnerIds);
        if (profiles.error) throw profiles.error;
        for (const partner of profiles.data as Partner[]) partners.set(partner.id, partner);
      }
      const withPartner = rows.map((row) => ({
        ...row,
        partner: partners.get((row.mentee_id === me ? row.mentor_id : row.mentee_id) ?? '') ?? null,
      }));
      return {
        asMentee: withPartner.find((row) => row.mentee_id === me) ?? null,
        asMentor: withPartner.filter((row) => row.mentor_id === me),
      };
    },
  });
}

export type MentoringAction =
  | { name: 'request_mentor' }
  | { name: 'set_mentor_status'; capacity: number }
  | { name: 'respond_mentorship'; id: string; accept: boolean }
  | { name: 'end_mentorship'; id: string };

/** Toutes les actions de parrainage passent par des fonctions serveur ; on rafraîchit ensuite ce qui en dépend. */
export function useMentoringAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: MentoringAction) => {
      const params =
        action.name === 'set_mentor_status'
          ? { p_capacity: action.capacity }
          : action.name === 'respond_mentorship'
            ? { p_mentorship_id: action.id, p_accept: action.accept }
            : action.name === 'end_mentorship'
              ? { p_mentorship_id: action.id }
              : undefined;
      const { data, error } = await supabase.rpc(action.name, params);
      if (error) throw error;
      return data as string | null;
    },
    onSettled: () =>
      Promise.all(['mentoring', 'profile', 'profile-extras', 'chat', 'notifications'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
}

/** F-MENT-08 : les activités à venir auxquelles mon parrain (ou mon filleul) est inscrit. */
export function usePartnerActivities(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['activities', 'partner', partnerId],
    enabled: Boolean(partnerId),
    queryFn: async () => {
      const registrations = await supabase.from('activity_participants').select('activity_id').eq('user_id', partnerId!).eq('status', 'registered');
      if (registrations.error) throw registrations.error;
      const ids = registrations.data.map((row) => row.activity_id as string);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('activity_cards')
        .select('*')
        .in('id', ids)
        .eq('status', 'published')
        .gt('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(5);
      if (error) throw error;
      return data as Activity[];
    },
  });
}

// « Besoin de parler » ---------------------------------------------------------

export type SupportResource = {
  id: string;
  school_id: string | null;
  name: string;
  description: string | null;
  phone: string | null;
  url: string | null;
  hours: string | null;
};

/** Simple lecture : rien n'est enregistré sur la consultation de cet écran (F-HELP-04). */
export function useSupportResources() {
  return useQuery({
    queryKey: ['support-resources'],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_resources')
        .select('id, school_id, name, description, phone, url, hours')
        .order('sort_order');
      if (error) throw error;
      return data as SupportResource[];
    },
  });
}

// Sondage d'intégration ---------------------------------------------------------

export type SurveyWave = 'signup' | 'd60';

/** La vague à proposer maintenant, ou null : inscription (les 14 premiers jours), puis J+60 (F-SURV-01). */
export function usePendingSurvey() {
  const { profile } = useSession();
  return useQuery({
    queryKey: ['survey', profile?.id],
    enabled: Boolean(profile),
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<SurveyWave | null> => {
      const { data, error } = await supabase.from('integration_surveys').select('wave');
      if (error) throw error;
      const answered = new Set(data.map((row) => row.wave as SurveyWave));
      const ageDays = (Date.now() - new Date(profile!.created_at).getTime()) / 86_400_000;
      if (ageDays >= 60) return answered.has('d60') ? null : 'd60';
      if (ageDays <= 14) return answered.has('signup') ? null : 'signup';
      return null;
    },
  });
}

export function useSubmitSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ wave, score }: { wave: SurveyWave; score: number | null }) => {
      const { error } = await supabase.rpc('submit_integration_survey', { p_wave: wave, p_score: score });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['survey'] }),
  });
}
