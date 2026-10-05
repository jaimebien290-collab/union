import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { CATEGORIES, colors } from '@union/shared';

import { type Activity, formatShort, spotsLabel } from '@/lib/activities';
import { useSignedUrl } from '@/lib/storage';

export const categoryOf = (code: string) => CATEGORIES.find((category) => category.code === code) ?? CATEGORIES[CATEGORIES.length - 1];

/** Photo de couverture, ou un aplat à la couleur de la catégorie avec son emoji. */
export function Cover({ activity, height }: { activity: Pick<Activity, 'cover_url' | 'category'>; height: number }) {
  const url = useSignedUrl('covers', activity.cover_url);
  const category = categoryOf(activity.category);
  if (url) {
    return <Image source={{ uri: url, cacheKey: activity.cover_url ?? undefined }} style={{ height, width: '100%' }} contentFit="cover" />;
  }
  return (
    <View className="items-center justify-center" style={{ height, backgroundColor: colors.category[category.code] }}>
      <Text style={{ fontSize: height * 0.4 }}>{category.emoji}</Text>
    </View>
  );
}

export function StatusBadges({ activity }: { activity: Activity }) {
  const badges: { label: string; className: string }[] = [];
  if (activity.status === 'cancelled') badges.push({ label: 'Annulée', className: 'bg-night' });
  if (activity.is_official) badges.push({ label: '⭐ Officiel', className: 'bg-sun' });
  if (activity.my_status === 'registered') badges.push({ label: '✓ Inscrit', className: 'bg-coral' });
  if (activity.my_status === 'waitlisted') badges.push({ label: "Liste d'attente", className: 'bg-coral' });
  if (badges.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {badges.map((badge) => (
        <View key={badge.label} className={`rounded-full px-2.5 py-1 ${badge.className}`}>
          <Text className={`font-strong text-xs ${badge.className === 'bg-sun' ? 'text-night' : 'text-white'}`}>{badge.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function ActivityCard({ activity, compact }: { activity: Activity; compact?: boolean }) {
  const category = categoryOf(activity.category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${activity.title}, ${formatShort(activity.starts_at)}, ${activity.location_name}`}
      onPress={() => router.push(`/activity/${activity.id}`)}
      className={`overflow-hidden rounded-3xl bg-white shadow-sm active:opacity-90 dark:bg-night ${compact ? 'w-64' : ''}`}>
      <Cover activity={activity} height={compact ? 90 : 120} />
      <View className="gap-1.5 p-4">
        <StatusBadges activity={activity} />
        <Text numberOfLines={2} className="font-strong text-lg text-night dark:text-cream">
          {activity.title}
        </Text>
        <Text className="font-semi text-sm text-coral">{formatShort(activity.starts_at)}</Text>
        <Text numberOfLines={1} className="font-body text-sm text-night/70 dark:text-cream/70">
          {category.emoji} {category.label} · {activity.location_name}
        </Text>
        {compact ? null : <Text className="font-body text-sm text-night/70 dark:text-cream/70">{spotsLabel(activity)}</Text>}
      </View>
    </Pressable>
  );
}
