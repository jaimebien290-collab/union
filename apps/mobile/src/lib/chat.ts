import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { CategoryCode } from '@union/shared';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type Conversation = {
  id: string;
  type: 'activity' | 'direct' | 'mentorship';
  activity_id: string | null;
  last_message_at: string | null;
  muted: boolean;
  activity_title: string | null;
  activity_category: CategoryCode | null;
  other_id: string | null;
  other_first_name: string | null;
  other_last_name: string | null;
  other_avatar_url: string | null;
  writable: boolean;
  last_message: string | null;
  last_sender_id: string | null;
  unread_count: number;
};

export type Message = { id: string; conversation_id: string; sender_id: string; content: string; created_at: string };

// F-AUTH-08 : un compte supprimé n'a plus de profil visible.
export const DELETED_USER = 'Utilisateur supprimé';

export const conversationTitle = (c: Conversation) =>
  c.type === 'activity' ? (c.activity_title ?? 'Activité') : c.other_first_name ? `${c.other_first_name} ${c.other_last_name}` : DELETED_USER;

const PAGE_SIZE = 30;

/** Mes conversations, la plus récente en premier (F-CHAT-04). Une conversation privée vide n'apparaît pas. */
export function useConversations() {
  return useQuery({
    queryKey: ['chat', 'list'],
    // Filet de sécurité si le temps réel est coupé.
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_list')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data as Conversation[]).filter((c) => c.type === 'activity' || c.last_message_at);
    },
  });
}

/** Nombre de messages non lus, hors conversations en sourdine : pastille de l'onglet Messages. */
export function useUnreadTotal() {
  const { data } = useConversations();
  return (data ?? []).reduce((total, c) => total + (c.muted ? 0 : c.unread_count), 0);
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ['chat', 'conversation', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('conversation_list').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as Conversation | null;
    },
  });
}

/** L'identifiant de la discussion de groupe d'une activité, si j'en suis membre. */
export function useActivityConversationId(activityId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['chat', 'for-activity', activityId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('conversations').select('id').eq('activity_id', activityId).maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },
  }).data;
}

/** Messages du plus récent au plus ancien, par pages (la liste est affichée inversée). */
export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: ['chat', 'messages', conversationId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      return data as Message[];
    },
    getNextPageParam: (lastPage, pages) => (lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined),
  });
}

export type Sender = { id: string; first_name: string; last_name: string; avatar_url: string | null };

/** Noms et photos des auteurs. Ceux qui manquent (compte supprimé) s'affichent comme « Utilisateur supprimé ». */
export function useSenders(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['chat', 'senders', key],
    enabled: key.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('public_profiles').select('id, first_name, last_name, avatar_url').in('id', key);
      if (error) throw error;
      return new Map((data as Sender[]).map((sender) => [sender.id, sender]));
    },
  }).data;
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, content });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['chat'] }),
  });
}

/** Marque la conversation lue jusqu'à ce message (heure du serveur, pour ne pas dépendre de l'horloge du téléphone). */
export function useMarkRead(conversationId: string) {
  const queryClient = useQueryClient();
  const { profile } = useSession();
  return useMutation({
    mutationFn: async (readUntil: string) => {
      if (!profile) return;
      await supabase
        .from('conversation_members')
        .update({ last_read_at: readUntil })
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat', 'list'] }),
  });
}

/** F-CHAT-07 : mode silencieux par conversation. */
export function useSetMuted(conversationId: string) {
  const queryClient = useQueryClient();
  const { profile } = useSession();
  return useMutation({
    mutationFn: async (muted: boolean) => {
      const { error } = await supabase
        .from('conversation_members')
        .update({ muted })
        .eq('conversation_id', conversationId)
        .eq('user_id', profile!.id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['chat'] }),
  });
}

export async function openDirectConversation(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_direct_conversation', { p_user_id: userId });
  if (error) throw error;
  return data as string;
}

/**
 * Temps réel (F-CHAT-04) : à chaque nouveau message qui me concerne, on rafraîchit les données de chat.
 * La RLS s'applique côté serveur : on ne reçoit que les messages de ses conversations.
 */
export function useChatRealtime() {
  const queryClient = useQueryClient();
  const { profile } = useSession();
  const userId = profile?.id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`messages:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['chat'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}

// Modération -----------------------------------------------------------------

export const REPORT_REASONS = [
  { code: 'inappropriate', label: 'Contenu inapproprié' },
  { code: 'harassment', label: 'Harcèlement' },
  { code: 'spam', label: 'Spam' },
  { code: 'fake_profile', label: 'Faux profil' },
  { code: 'danger', label: 'Danger' },
  { code: 'other', label: 'Autre' },
  { code: 'auto_filter', label: 'Filtre automatique' },
] as const;

export const reasonLabel = (code: string) => REPORT_REASONS.find((reason) => reason.code === code)?.label ?? code;

export type ReportTarget = 'activity' | 'message' | 'user';

export type ModerationItem = {
  target_type: ReportTarget;
  target_id: string;
  author_name: string | null;
  report_count: number;
  reasons: string[];
  comments: string[];
  first_reported_at: string;
  preview: string | null;
  is_hidden: boolean;
};

export function useModerationQueue(enabled: boolean) {
  return useQuery({
    queryKey: ['moderation', 'queue'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('moderation_queue');
      if (error) throw error;
      return data as ModerationItem[];
    },
  });
}

// Notifications dans l'app ----------------------------------------------------

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { activity_id?: string };
  created_at: string;
  read_at: string | null;
};

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, data, created_at, read_at')
        // Les messages ont leur propre onglet et leur propre pastille.
        .neq('type', 'message')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as AppNotification[];
    },
  });
}

export function useUnreadNotificationCount() {
  return (
    useQuery({
      queryKey: ['notifications', 'unread'],
      refetchInterval: 60_000,
      queryFn: async () => {
        const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null).neq('type', 'message');
        if (error) throw error;
        return count ?? 0;
      },
    }).data ?? 0
  );
}
