import { ActivityIndicator, Text, View } from 'react-native';

import { BADGES, colors } from '@union/shared';

import { router } from 'expo-router';

import { Button, FormScreen } from '@/components/ui';
import { formatShort } from '@/lib/activities';
import { pointsReasonLabel, usePointHistory, useProfileExtras } from '@/lib/presence';
import { useSession } from '@/lib/session';

// F-GAME-02 et 03 : solde, badges (obtenus et à venir), historique.
export default function PointsScreen() {
  const { profile } = useSession();
  const history = usePointHistory();
  const extras = useProfileExtras(profile?.id ?? '');
  if (!profile) return null;

  const earned = new Set<string>(extras?.badges ?? []);
  const next = BADGES.find((badge) => !earned.has(badge.code));

  return (
    <FormScreen title="Mes points">
      <View className="items-center rounded-3xl bg-sun p-6">
        <Text className="font-display text-6xl text-night">{profile.points_balance}</Text>
        <Text className="font-strong text-base text-night">points</Text>
      </View>
      <Text className="font-body text-sm text-night/70 dark:text-cream/70">
        Les points se gagnent en venant vraiment aux activités : fais scanner ta présence sur place. 60 points maximum par jour.
      </Text>
      <Button label="🎁 Boutique de goodies" onPress={() => router.push('/shop')} />

      <Text accessibilityRole="header" className="mt-2 font-strong text-lg text-night dark:text-cream">
        Badges
      </Text>
      {next ? (
        <Text className="font-semi text-sm text-coral">
          Prochain badge : {next.emoji} {next.name} — {next.description}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-3">
        {BADGES.map((badge) => (
          <View
            key={badge.code}
            accessibilityLabel={`${badge.name}, ${earned.has(badge.code) ? 'obtenu' : 'à débloquer'} : ${badge.description}`}
            className={`w-[30%] items-center rounded-3xl bg-white p-3 dark:bg-night ${earned.has(badge.code) ? '' : 'opacity-35'}`}>
            <Text className="text-4xl">{badge.emoji}</Text>
            <Text className="text-center font-semi text-xs text-night dark:text-cream">{badge.name}</Text>
          </View>
        ))}
      </View>

      <Text accessibilityRole="header" className="mt-2 font-strong text-lg text-night dark:text-cream">
        Historique
      </Text>
      {history.isPending ? <ActivityIndicator color={colors.coral} /> : null}
      {history.data?.length === 0 ? (
        <Text className="font-body text-base text-night/70 dark:text-cream/70">Pas encore de points. Ta première activité t&apos;en rapporte 30 !</Text>
      ) : null}
      {history.data?.map((transaction) => (
        <View key={transaction.id} className="flex-row items-center justify-between rounded-2xl bg-white px-4 py-3 dark:bg-night">
          <View className="flex-1">
            <Text className="font-semi text-base text-night dark:text-cream">{pointsReasonLabel(transaction.reason)}</Text>
            <Text className="font-body text-xs text-night/60 dark:text-cream/60">{formatShort(transaction.created_at)}</Text>
          </View>
          <Text className="font-display text-lg text-coral">{transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount}</Text>
        </View>
      ))}
    </FormScreen>
  );
}
