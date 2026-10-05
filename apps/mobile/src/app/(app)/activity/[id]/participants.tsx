import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colors } from '@union/shared';

import { Avatar, FormScreen } from '@/components/ui';
import { useParticipants } from '@/lib/activities';

export default function ParticipantsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending } = useParticipants(id);

  return (
    <FormScreen title="Participants" subtitle={data ? `${data.length} inscrit${data.length > 1 ? 's' : ''}` : undefined}>
      {isPending ? <ActivityIndicator color={colors.coral} /> : null}
      {data?.map((person) => (
        <Pressable
          key={person.id}
          accessibilityRole="button"
          onPress={() => router.push(`/user/${person.id}`)}
          className="flex-row items-center gap-3 rounded-2xl bg-white p-3 active:opacity-80 dark:bg-night">
          <Avatar firstName={person.first_name} lastName={person.last_name} path={person.avatar_url} />
          <View className="flex-1">
            <Text className="font-strong text-base text-night dark:text-cream">
              {person.first_name} {person.last_name}
            </Text>
            {person.program ? <Text className="font-body text-sm text-night/70 dark:text-cream/70">{person.program}</Text> : null}
          </View>
        </Pressable>
      ))}
    </FormScreen>
  );
}
