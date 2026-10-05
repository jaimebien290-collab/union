import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { colors } from '@union/shared';

import { Button, Card, FormScreen, Notice } from '@/components/ui';
import { formatShort } from '@/lib/activities';
import { type ModerationItem, reasonLabel, useModerationQueue } from '@/lib/chat';
import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const TYPE_LABELS = { activity: 'Activité', message: 'Message', user: 'Profil' };

type Action = 'dismiss' | 'hide' | 'warn';

function Item({ item, onResolve, busy }: { item: ModerationItem; onResolve: (action: Action) => void; busy: boolean }) {
  return (
    <Card>
      <Text className="font-semi text-xs uppercase text-coral">
        {TYPE_LABELS[item.target_type]} · {item.report_count} signalement{item.report_count > 1 ? 's' : ''}
        {item.is_hidden ? ' · masqué' : ''}
      </Text>
      <Text className="mt-1 font-strong text-base text-night dark:text-cream">{item.author_name ?? 'Auteur inconnu'}</Text>
      {item.preview ? (
        <Text className="mt-2 rounded-2xl bg-cream p-3 font-body text-base text-night dark:bg-ink dark:text-cream">{item.preview}</Text>
      ) : null}
      <Text className="mt-2 font-body text-sm text-night/70 dark:text-cream/70">
        {item.reasons.map(reasonLabel).join(', ')} · depuis {formatShort(item.first_reported_at)}
      </Text>
      {item.comments.map((comment, index) => (
        <Text key={index} className="mt-1 font-body text-sm italic text-night/70 dark:text-cream/70">
          « {comment} »
        </Text>
      ))}
      {/* F-MOD-03 */}
      <View className="mt-3 gap-2">
        {item.target_type !== 'user' ? <Button label="Masquer le contenu" variant="danger" disabled={busy} onPress={() => onResolve('hide')} /> : null}
        <Button label="Avertir l'auteur" variant="secondary" disabled={busy} onPress={() => onResolve('warn')} />
        <Button label="Rejeter le signalement" variant="ghost" disabled={busy} onPress={() => onResolve('dismiss')} />
      </View>
    </Card>
  );
}

export default function ModerationScreen() {
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const isModerator = profile?.role === 'ambassador' || profile?.role === 'school_admin';
  const { data, isPending } = useModerationQueue(isModerator);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const resolve = async (item: ModerationItem, action: Action) => {
    setError('');
    setBusy(true);
    const { error } = await supabase.rpc('resolve_reports', {
      p_target_type: item.target_type,
      p_target_id: item.target_id,
      p_action: action,
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    await queryClient.invalidateQueries({ queryKey: ['moderation'] });
  };

  return (
    <FormScreen title="Modération" subtitle="Les signalements de ton école. Ceux qui te concernent sont traités par quelqu'un d'autre.">
      {!isModerator ? <Notice tone="info">Cette page est réservée aux ambassadeurs.</Notice> : null}
      <Notice>{error}</Notice>
      {isModerator && isPending ? <ActivityIndicator color={colors.coral} /> : null}
      {data?.length === 0 ? <Notice tone="info">Rien à traiter, tout est calme ✌️</Notice> : null}
      {data?.map((item) => (
        <Item key={`${item.target_type}-${item.target_id}`} item={item} busy={busy} onResolve={(action) => resolve(item, action)} />
      ))}
    </FormScreen>
  );
}
