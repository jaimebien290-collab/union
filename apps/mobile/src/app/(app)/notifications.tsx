import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colors } from '@union/shared';

import { FormScreen, Notice } from '@/components/ui';
import { formatShort } from '@/lib/activities';
import { useNotifications } from '@/lib/chat';
import { supabase } from '@/lib/supabase';

// En attendant les push (voir DECISIONS.md) : tout ce que l'app a à te dire est ici.
export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { data, isPending } = useNotifications();
  const hasUnread = data?.some((notification) => !notification.read_at) ?? false;

  // Ouvrir l'écran marque tout comme lu (la pastille de la cloche disparaît).
  useEffect(() => {
    if (!hasUnread) return;
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] }));
  }, [hasUnread, queryClient]);

  return (
    <FormScreen title="Notifications">
      {isPending ? <ActivityIndicator color={colors.coral} /> : null}
      {data?.length === 0 ? <Notice tone="info">Rien de neuf pour l&apos;instant.</Notice> : null}
      {data?.map((notification) => {
        const activityId = notification.data?.activity_id;
        return (
          <Pressable
            key={notification.id}
            accessibilityRole={activityId ? 'button' : undefined}
            disabled={!activityId}
            onPress={() => router.push(`/activity/${activityId}`)}
            className="flex-row gap-3 rounded-3xl bg-white p-4 active:opacity-80 dark:bg-night">
            <View className={`mt-2 h-2.5 w-2.5 rounded-full ${notification.read_at ? 'bg-transparent' : 'bg-coral'}`} />
            <View className="flex-1">
              <Text className="font-strong text-base text-night dark:text-cream">{notification.title}</Text>
              <Text className="font-body text-base text-night/80 dark:text-cream/80">{notification.body}</Text>
              <Text className="mt-1 font-body text-xs text-night/50 dark:text-cream/50">{formatShort(notification.created_at)}</Text>
            </View>
          </Pressable>
        );
      })}
    </FormScreen>
  );
}
