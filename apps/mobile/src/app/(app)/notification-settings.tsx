import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';

import { colors } from '@union/shared';

import { Button, FormScreen, Notice } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { getPushStatus, PUSH_CATEGORIES, registerForPush } from '@/lib/push';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const STATUS_TEXT = {
  unsupported: "Les notifications ne fonctionnent pas dans cette version de test (Expo Go ou navigateur). Elles arriveront avec l'application installée depuis le store.",
  unconfigured: "Les notifications ne sont pas encore configurées pour cette version de l'application.",
  denied: 'Les notifications sont bloquées pour UNION dans les réglages de ton téléphone.',
  undetermined: "Active les notifications pour être prévenu d'un rappel, d'un message ou d'une place qui se libère. Tu choisis ensuite ce que tu veux recevoir.",
  granted: 'Les notifications sont activées sur ce téléphone.',
};

// F-NOTIF-10 : l'étudiant règle chaque type de notification. Rien n'est envoyé entre 22 h et 8 h, sauf les
// messages et les rappels « dans 1 h » (F-NOTIF-12).
export default function NotificationSettingsScreen() {
  const { profile, loadProfile } = useSession();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['push-status'], queryFn: getPushStatus });
  const prefs = useQuery({
    queryKey: ['notification-prefs', profile?.id],
    enabled: Boolean(profile),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('notification_prefs').eq('id', profile!.id).single();
      if (error) throw error;
      return (data.notification_prefs ?? {}) as Record<string, boolean>;
    },
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!profile) return null;

  const enable = async () => {
    setError('');
    setBusy(true);
    try {
      await registerForPush(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ['push-status'] });
    }
  };

  const toggle = async (key: string, enabled: boolean) => {
    setError('');
    const next = { ...(prefs.data ?? {}), [key]: enabled };
    queryClient.setQueryData(['notification-prefs', profile.id], next);
    const { error } = await supabase.from('profiles').update({ notification_prefs: next }).eq('id', profile.id);
    if (error) {
      setError(friendlyError(error));
      prefs.refetch();
    } else loadProfile(profile.id);
  };

  const current = status.data ?? 'undetermined';

  return (
    <FormScreen title="Notifications" subtitle="Pas de notification entre 22 h et 8 h, sauf les messages et le rappel une heure avant une activité.">
      <Notice tone="info">{status.isPending ? '' : STATUS_TEXT[current]}</Notice>
      {current === 'undetermined' ? <Button label="Activer les notifications" loading={busy} onPress={enable} /> : null}
      {current === 'denied' ? <Button label="Ouvrir les réglages du téléphone" variant="secondary" onPress={() => Linking.openSettings()} /> : null}
      <Notice>{error}</Notice>

      {PUSH_CATEGORIES.map((category) => (
        <View key={category.key} className="flex-row items-center gap-3 rounded-3xl bg-white p-4 dark:bg-night">
          <View className="flex-1">
            <Text className="font-strong text-base text-night dark:text-cream">{category.label}</Text>
            <Text className="font-body text-sm text-night/70 dark:text-cream/70">{category.hint}</Text>
          </View>
          <Switch
            accessibilityLabel={category.label}
            value={prefs.data?.[category.key] !== false}
            disabled={prefs.isPending}
            onValueChange={(enabled) => toggle(category.key, enabled)}
            trackColor={{ true: colors.coral }}
          />
        </View>
      ))}
    </FormScreen>
  );
}
