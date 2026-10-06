import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { colors } from '@union/shared';

import { Button, Card, FormScreen, Notice } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { friendlyError } from '@/lib/errors';
import { type Reward, useRedeem, useRedemptions, useRewards } from '@/lib/presence';
import { useSession } from '@/lib/session';

const STATUS = { pending: 'À retirer', delivered: 'Remis', cancelled: 'Annulé, points rendus' };

// F-GAME-04 : catalogue géré par l'école, échange contre des points, code de retrait à présenter.
export default function ShopScreen() {
  const { profile } = useSession();
  const rewards = useRewards();
  const redemptions = useRedemptions();
  const redeem = useRedeem();
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (!profile) return null;
  const names = new Map((rewards.data ?? []).map((reward) => [reward.id, reward.name]));

  const confirm = (reward: Reward) =>
    Alert.alert(`Échanger ${reward.cost_points} points ?`, `Contre : ${reward.name}. Tes points sont débités tout de suite.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Échanger',
        onPress: async () => {
          setError('');
          setInfo('');
          try {
            const result = await redeem.mutateAsync(reward.id);
            setInfo(`C'est à toi ! Ton code de retrait : ${result.pickup_code}. Présente-le pour récupérer ton goodie.`);
          } catch (e) {
            setError(friendlyError(e));
          }
        },
      },
    ]);

  return (
    <FormScreen title="Boutique" subtitle={`Tu as ${profile.points_balance} points.`}>
      <Notice>{error}</Notice>
      <Notice tone="info">{info}</Notice>
      {rewards.isPending ? <ActivityIndicator color={colors.coral} /> : null}
      {rewards.data?.length === 0 ? <Notice tone="info">Ton école n&apos;a pas encore ajouté de goodies. Reviens bientôt !</Notice> : null}

      {rewards.data?.map((reward) => {
        const affordable = profile.points_balance >= reward.cost_points;
        return (
          <Card key={reward.id}>
            <Text className="font-strong text-lg text-night dark:text-cream">{reward.name}</Text>
            {reward.description ? <Text className="font-body text-sm text-night/70 dark:text-cream/70">{reward.description}</Text> : null}
            <Text className="mt-1 font-semi text-sm text-coral">
              {reward.cost_points} points · {reward.stock > 0 ? `${reward.stock} en stock` : 'épuisé'}
            </Text>
            <View className="mt-3">
              <Button
                label={reward.stock <= 0 ? 'Épuisé' : affordable ? 'Échanger' : `Encore ${reward.cost_points - profile.points_balance} points`}
                disabled={!affordable || reward.stock <= 0 || redeem.isPending}
                onPress={() => confirm(reward)}
              />
            </View>
          </Card>
        );
      })}

      {redemptions.data?.length ? (
        <Text accessibilityRole="header" className="mt-2 font-strong text-lg text-night dark:text-cream">
          Mes retraits
        </Text>
      ) : null}
      {redemptions.data?.map((redemption) => (
        <View key={redemption.id} className="flex-row items-center justify-between rounded-2xl bg-white px-4 py-3 dark:bg-night">
          <View className="flex-1">
            <Text className="font-semi text-base text-night dark:text-cream">{names.get(redemption.reward_id) ?? 'Goodie'}</Text>
            <Text className="font-body text-xs text-night/60 dark:text-cream/60">{STATUS[redemption.status]}</Text>
          </View>
          {redemption.status === 'pending' ? (
            <Text accessibilityLabel={`Code de retrait ${redemption.pickup_code}`} className="font-display text-xl tracking-widest text-coral">
              {redemption.pickup_code}
            </Text>
          ) : null}
        </View>
      ))}
    </FormScreen>
  );
}
