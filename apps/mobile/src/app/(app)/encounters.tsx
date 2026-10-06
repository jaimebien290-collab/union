import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colors } from '@union/shared';

import { Avatar, FormScreen, Notice } from '@/components/ui';
import { useEncounters } from '@/lib/presence';

// F-MATCH-01 et 02 : les personnes réellement croisées (présences validées à la même activité).
export default function EncountersScreen() {
  const { data, isPending } = useEncounters();

  return (
    <FormScreen title="Mes rencontres" subtitle="Les étudiants avec qui tu as vraiment partagé une activité.">
      {isPending ? <ActivityIndicator color={colors.coral} /> : null}
      {data?.length === 0 ? (
        <Notice tone="info">Personne pour l&apos;instant. Va à une activité et fais valider ta présence : les participants apparaîtront ici.</Notice>
      ) : null}
      {data?.map((person) => (
        <Pressable
          key={person.user_id}
          accessibilityRole="button"
          onPress={() => router.push(`/user/${person.user_id}`)}
          className="flex-row items-center gap-3 rounded-3xl bg-white p-3 active:opacity-80 dark:bg-night">
          <Avatar firstName={person.first_name} lastName={person.last_name} path={person.avatar_url} />
          <View className="flex-1">
            <Text className="font-strong text-base text-night dark:text-cream">
              {person.first_name} {person.last_name}
            </Text>
            <Text numberOfLines={1} className="font-body text-sm text-night/70 dark:text-cream/70">
              {person.shared_count} activité{person.shared_count > 1 ? 's' : ''} ensemble
              {person.last_activity_title ? ` · dernière : ${person.last_activity_title}` : ''}
            </Text>
          </View>
        </Pressable>
      ))}
    </FormScreen>
  );
}
