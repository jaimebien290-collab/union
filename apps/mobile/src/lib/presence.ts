import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { BADGES, type BadgeCode } from '@union/shared';

import type { Activity } from '@/lib/activities';
import { supabase } from '@/lib/supabase';

export type CheckinResult = { status: 'ok' | 'already'; points: number; badges: BadgeCode[] };

/** F-ACT-10 : le check-in est ouvert de 30 min avant le début à 2 h après la fin. */
export function isCheckinOpen(activity: Pick<Activity, 'starts_at' | 'ends_at' | 'status'>, now: number) {
  return (
    activity.status === 'published' &&
    now >= new Date(activity.starts_at).getTime() - 30 * 60_000 &&
    now <= new Date(activity.ends_at).getTime() + 2 * 3_600_000
  );
}

/** Jeton du QR de l'organisateur. Il change chaque minute côté serveur (NF-SEC-03) : on le redemande souvent. */
export function useCheckinToken(activityId: string) {
  return useQuery({
    queryKey: ['presence', 'token', activityId],
    refetchInterval: 20_000,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_checkin_token', { p_activity_id: activityId });
      if (error) throw error;
      return (data as { token: string }).token;
    },
  });
}

/** Après une présence validée, presque tout change : points, badges, rencontres, recommandations. */
function useRefreshAfterCheckin() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ['presence', 'activities', 'profile', 'profile-extras'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
}

export function useCheckin() {
  const refresh = useRefreshAfterCheckin();
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc('checkin', { p_token: token });
      if (error) throw error;
      return data as CheckinResult;
    },
    onSuccess: refresh,
  });
}

export function useManualCheckin(activityId: string) {
  const refresh = useRefreshAfterCheckin();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('manual_checkin', { p_activity_id: activityId, p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** Qui est déjà pointé présent, pour la liste de l'organisateur. */
export function usePresentIds(activityId: string) {
  return useQuery({
    queryKey: ['presence', 'present', activityId],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_participants')
        .select('user_id')
        .eq('activity_id', activityId)
        .not('checked_in_at', 'is', null);
      if (error) throw error;
      return new Set(data.map((row) => row.user_id as string));
    },
  });
}

// Points et badges ------------------------------------------------------------

export type PointTransaction = { id: string; amount: number; reason: string; created_at: string };

const REASONS: Record<string, string> = {
  attendance: 'Présence à une activité',
  first_activity_bonus: 'Bonus première activité',
  organizer_success: 'Activité organisée réussie',
  new_category: 'Nouvelle catégorie découverte',
  mentor_pair_attendance: 'Activité avec ton binôme de parrainage',
  mentee_accepted: 'Filleul accepté',
};

export const pointsReasonLabel = (reason: string) => REASONS[reason] ?? reason;

export function usePointHistory() {
  return useQuery({
    queryKey: ['presence', 'points'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_transactions')
        .select('id, amount, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as PointTransaction[];
    },
  });
}

export const badgeOf = (code: string) => BADGES.find((badge) => badge.code === code);

/** Badges et nombre d'activités réalisées d'un étudiant de mon école (F-PROF-02). */
export function useProfileExtras(userId: string) {
  return useQuery({
    queryKey: ['profile-extras', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [badges, stats] = await Promise.all([
        supabase.from('user_badges').select('badge_code').eq('user_id', userId),
        supabase.from('public_profiles').select('activities_done').eq('id', userId).maybeSingle(),
      ]);
      if (badges.error) throw badges.error;
      if (stats.error) throw stats.error;
      return {
        badges: badges.data.map((row) => row.badge_code as BadgeCode),
        activitiesDone: (stats.data?.activities_done as number | undefined) ?? 0,
      };
    },
  }).data;
}

// Rencontres et recommandations ------------------------------------------------

export type Encounter = {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  shared_count: number;
  last_met_at: string;
  last_activity_title: string | null;
};

/** F-MATCH-01 : par nombre d'activités partagées, puis par date de la dernière. */
export function useEncounters() {
  return useQuery({
    queryKey: ['presence', 'encounters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('my_encounters')
        .select('*')
        .order('shared_count', { ascending: false })
        .order('last_met_at', { ascending: false });
      if (error) throw error;
      return data as Encounter[];
    },
  });
}

/** F-MATCH-03 / F-DISC-06 : les 5 activités « Pour toi ». */
export function useRecommended() {
  return useQuery({
    queryKey: ['activities', 'recommended'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('recommended_activities');
      if (error) throw error;
      return data as Activity[];
    },
  });
}
