import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CategoryCode } from '@union/shared';

import { supabase } from '@/lib/supabase';

export type Activity = {
  id: string;
  school_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  category: CategoryCode;
  is_official: boolean;
  starts_at: string;
  ends_at: string;
  location_name: string;
  address: string | null;
  lat: number;
  lng: number;
  max_participants: number | null;
  cover_url: string | null;
  status: 'published' | 'cancelled' | 'hidden';
  creator_first_name: string | null;
  creator_last_name: string | null;
  creator_avatar_url: string | null;
  registered_count: number;
  /** null = places illimitées. */
  spots_left: number | null;
  my_status: 'registered' | 'waitlisted' | null;
};

export type Period = 'all' | 'today' | 'week' | 'weekend' | 'month';

export type Filters = {
  categories: CategoryCode[];
  period: Period;
  availableOnly: boolean;
  officialOnly: boolean;
  search: string;
};

export const NO_FILTERS: Filters = { categories: [], period: 'all', availableOnly: false, officialOnly: false, search: '' };

export const hasFilters = (f: Filters) =>
  f.categories.length > 0 || f.period !== 'all' || f.availableOnly || f.officialOnly || f.search.trim() !== '';

const PAGE_SIZE = 20; // NF-PERF-01

/** Bornes [début, fin] de la période, en partant de maintenant (F-DISC-02). */
function periodRange(period: Period): [Date, Date | null] {
  const now = new Date();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  const daysToSunday = (7 - now.getDay()) % 7;
  const sunday = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToSunday));
  switch (period) {
    case 'today':
      return [now, endOfDay(now)];
    case 'week':
      return [now, sunday];
    case 'weekend': {
      const saturday = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - 1);
      return [saturday > now ? saturday : now, sunday];
    }
    case 'month':
      return [now, endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
    default:
      return [now, null];
  }
}

/** Activités publiées pas encore terminées, filtrées, par date. */
function upcomingQuery(filters: Filters) {
  const [from, to] = periodRange(filters.period);
  let query = supabase
    .from('activity_cards')
    .select('*')
    .eq('status', 'published')
    .order('starts_at')
    .order('id');
  // Hors filtre de période, on garde les activités en cours ; avec, on borne sur le début.
  query = filters.period === 'all' ? query.gt('ends_at', from.toISOString()) : query.gte('starts_at', from.toISOString());
  if (to) query = query.lte('starts_at', to.toISOString());
  if (filters.categories.length) query = query.in('category', filters.categories);
  if (filters.officialOnly) query = query.eq('is_official', true);
  if (filters.availableOnly) query = query.or('spots_left.is.null,spots_left.gt.0');
  // F-DISC-03. Les caractères qui ont un sens dans la syntaxe de filtre sont retirés de la saisie.
  const search = filters.search.replace(/[,()*%\\"]/g, ' ').trim();
  if (search) {
    const pattern = `*${search}*`;
    query = query.or(
      `title.ilike.${pattern},description.ilike.${pattern},location_name.ilike.${pattern},address.ilike.${pattern}`,
    );
  }
  return query;
}

export function useFeed(filters: Filters) {
  return useInfiniteQuery({
    queryKey: ['activities', 'feed', filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await upcomingQuery(filters).range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      return data as Activity[];
    },
    getNextPageParam: (lastPage, pages) => (lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined),
  });
}

/** Toutes les activités à venir pour la carte (F-DISC-04), mêmes filtres que le fil. */
export function useMapActivities(filters: Filters) {
  return useQuery({
    queryKey: ['activities', 'map', filters],
    queryFn: async () => {
      const { data, error } = await upcomingQuery(filters).limit(200);
      if (error) throw error;
      return data as Activity[];
    },
  });
}

/** Section « ⭐ Officiel cette semaine » (F-DISC-01). */
export function useOfficialThisWeek() {
  return useQuery({
    queryKey: ['activities', 'official-week'],
    queryFn: async () => {
      const now = new Date();
      const { data, error } = await supabase
        .from('activity_cards')
        .select('*')
        .eq('status', 'published')
        .eq('is_official', true)
        .gt('ends_at', now.toISOString())
        .lte('starts_at', new Date(now.getTime() + 7 * 86_400_000).toISOString())
        .order('starts_at')
        .limit(10);
      if (error) throw error;
      return data as Activity[];
    },
  });
}

export function useActivity(id: string) {
  return useQuery({
    queryKey: ['activities', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_cards').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as Activity | null;
    },
  });
}

/** Mes activités, à venir et passées : inscrit, en liste d'attente ou organisateur (F-CAL-01, F-ACT-11). */
export function useMyActivities() {
  return useQuery({
    queryKey: ['activities', 'mine'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_cards')
        .select('*')
        .not('my_status', 'is', null)
        .neq('status', 'hidden')
        .order('starts_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Activity[];
    },
  });
}

export type Participant = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  program: string | null;
  study_year: number | null;
};

/** Inscrits d'une activité, dans l'ordre d'inscription (F-ACT-08). */
export function useParticipants(activityId: string) {
  return useQuery({
    queryKey: ['activities', 'participants', activityId],
    queryFn: async () => {
      const registrations = await supabase
        .from('activity_participants')
        .select('user_id')
        .eq('activity_id', activityId)
        .eq('status', 'registered')
        .order('created_at');
      if (registrations.error) throw registrations.error;
      const ids = registrations.data.map((row) => row.user_id as string);
      if (ids.length === 0) return [];

      const profiles = await supabase
        .from('public_profiles')
        .select('id, first_name, last_name, avatar_url, program, study_year')
        .in('id', ids);
      if (profiles.error) throw profiles.error;
      const byId = new Map((profiles.data as Participant[]).map((p) => [p.id, p]));
      return ids.map((id) => byId.get(id)).filter((p): p is Participant => Boolean(p));
    },
  });
}

/** Inscription, désinscription, annulation : une RPC, puis on rafraîchit tout ce qui touche aux activités. */
export function useActivityAction(action: 'join_activity' | 'leave_activity' | 'cancel_activity') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (activityId: string) => {
      const { data, error } = await supabase.rpc(action, { p_activity_id: activityId });
      if (error) throw error;
      return data as string | null;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });
}

export type ActivityInput = Pick<
  Activity,
  'title' | 'description' | 'category' | 'is_official' | 'starts_at' | 'ends_at' | 'location_name' | 'address' | 'lat' | 'lng' | 'max_participants' | 'cover_url'
>;

/** Création (sans id) ou modification (avec id). Renvoie l'id de l'activité. */
export function useSaveActivity(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ActivityInput) => {
      const request = id
        ? supabase.from('activities').update(input).eq('id', id).select('id').single()
        : supabase.from('activities').insert(input).select('id').single();
      const { data, error } = await request;
      if (error) throw error;
      return data.id as string;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });
}

// Affichage -------------------------------------------------------------------

const DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT_DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** « Jeudi 8 octobre » */
export const formatDay = (iso: string) => capitalize(DAY.format(new Date(iso)));
/** « jeu. 8 oct. · 18:00 » */
export const formatShort = (iso: string) => `${SHORT_DAY.format(new Date(iso))} · ${TIME.format(new Date(iso))}`;
/** « Jeudi 8 octobre · 18:00 – 20:00 » */
export const formatRange = (activity: Pick<Activity, 'starts_at' | 'ends_at'>) =>
  `${formatDay(activity.starts_at)} · ${TIME.format(new Date(activity.starts_at))} – ${TIME.format(new Date(activity.ends_at))}`;

export function spotsLabel(activity: Activity) {
  const count = `${activity.registered_count} inscrit${activity.registered_count > 1 ? 's' : ''}`;
  if (activity.spots_left === null) return count;
  if (activity.spots_left <= 0) return `${count} · complet`;
  return `${count} · ${activity.spots_left} place${activity.spots_left > 1 ? 's' : ''} restante${activity.spots_left > 1 ? 's' : ''}`;
}
