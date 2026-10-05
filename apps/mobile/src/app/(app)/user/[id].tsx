import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';

import { colors } from '@union/shared';

import { ProfileCard, type PublicProfile } from '@/components/profile-card';
import { Button, FormScreen, Notice } from '@/components/ui';
import { openDirectConversation } from '@/lib/chat';
import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// F-PROF-02 (profil public) et F-PROF-06 (message, bloquer, signaler).
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useSession();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ['public-profile', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_profiles')
        .select('id, first_name, last_name, program, study_year, bio, avatar_url, interests, role, is_mentor')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as PublicProfile | null;
    },
  });

  const message = async () => {
    setError('');
    setBusy(true);
    try {
      router.push(`/conversation/${await openDirectConversation(id)}`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    const { error } = await supabase.from('blocks').insert({ blocked_id: id });
    // 23505 : déjà bloqué, rien à faire.
    if (error && error.code !== '23505') return setError(friendlyError(error));
    await queryClient.invalidateQueries();
    router.back();
  };

  const confirmBlock = () =>
    Alert.alert(
      `Bloquer ${data?.first_name} ?`,
      "Cette personne ne pourra plus t'écrire en privé et vous ne vous verrez plus dans les listes. Elle ne sera pas prévenue. Tu peux la débloquer depuis les réglages.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Bloquer', style: 'destructive', onPress: block },
      ],
    );

  const isMe = me?.id === id;

  return (
    <FormScreen title="Profil">
      {isPending ? <ActivityIndicator color={colors.coral} /> : null}
      {data ? <ProfileCard profile={data} /> : null}
      {!isPending && !data ? <Notice tone="info">Ce profil n&apos;est plus disponible.</Notice> : null}
      <Notice>{error}</Notice>
      {data && !isMe ? (
        <>
          <Button label="Envoyer un message" loading={busy} onPress={message} />
          <Button label="Bloquer" variant="secondary" onPress={confirmBlock} />
          <Button label="Signaler" variant="ghost" onPress={() => router.push(`/report?type=user&id=${id}`)} />
        </>
      ) : null}
    </FormScreen>
  );
}
