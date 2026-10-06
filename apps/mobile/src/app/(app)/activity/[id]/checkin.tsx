import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors } from '@union/shared';

import { Avatar, Button, FormScreen, Notice } from '@/components/ui';
import { useParticipants } from '@/lib/activities';
import { friendlyError } from '@/lib/errors';
import { useCheckinToken, useManualCheckin, usePresentIds } from '@/lib/presence';
import { useSession } from '@/lib/session';

// F-ACT-10, côté organisateur : le QR à faire scanner, et la liste pour cocher à la main.
export default function CheckinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const token = useCheckinToken(id);
  const participants = useParticipants(id);
  const present = usePresentIds(id);
  const manual = useManualCheckin(id);
  const [error, setError] = useState('');

  const mark = async (userId: string) => {
    setError('');
    try {
      await manual.mutateAsync(userId);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const others = (participants.data ?? []).filter((person) => person.id !== profile?.id);
  const presentCount = others.filter((person) => present.data?.has(person.id)).length;

  return (
    <FormScreen title="Valider les présences" subtitle="Fais scanner ce QR code par les participants. Il change toutes les minutes : une capture d'écran ne marche pas.">
      <View className="items-center rounded-3xl bg-white p-6">
        {token.data ? (
          <QRCode value={token.data} size={230} color={colors.night} backgroundColor="#fff" />
        ) : token.isError ? (
          <Text className="text-center font-semi text-base text-night">{friendlyError(token.error)}</Text>
        ) : (
          <ActivityIndicator color={colors.coral} />
        )}
      </View>

      <Notice>{error}</Notice>
      <Text accessibilityRole="header" className="font-strong text-lg text-night dark:text-cream">
        {presentCount} présent{presentCount > 1 ? 's' : ''} sur {others.length}
      </Text>
      <Text className="font-body text-sm text-night/70 dark:text-cream/70">
        Un téléphone en panne ? Coche la personne à la main. Ta propre présence est validée avec celle du premier participant.
      </Text>
      {others.map((person) => {
        const isPresent = present.data?.has(person.id) ?? false;
        return (
          <View key={person.id} className="flex-row items-center gap-3 rounded-3xl bg-white p-3 dark:bg-night">
            <Avatar firstName={person.first_name} lastName={person.last_name} path={person.avatar_url} />
            <Text className="flex-1 font-strong text-base text-night dark:text-cream">
              {person.first_name} {person.last_name}
            </Text>
            {isPresent ? (
              <Text className="font-strong text-sm text-coral">✓ Présent</Text>
            ) : (
              <Button label="Présent" variant="secondary" disabled={manual.isPending || token.isError} onPress={() => mark(person.id)} />
            )}
          </View>
        );
      })}
    </FormScreen>
  );
}
