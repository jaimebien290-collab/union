import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Text, View } from 'react-native';

import { colors } from '@union/shared';

import { Avatar, Button, FormScreen, Notice } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Blocked = { id: string; first_name: string; last_name: string };

// Les personnes bloquées n'apparaissent plus nulle part : c'est ici qu'on peut les débloquer.
export default function BlockedScreen() {
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ['blocked'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_blocked_users');
      if (error) throw error;
      return data as Blocked[];
    },
  });

  const unblock = async (id: string) => {
    await supabase.from('blocks').delete().eq('blocker_id', profile!.id).eq('blocked_id', id);
    // Les profils, participants et conversations redeviennent visibles.
    await queryClient.invalidateQueries();
  };

  return (
    <FormScreen title="Personnes bloquées" subtitle="Elles ne peuvent plus t'écrire en privé et vous ne vous voyez plus dans les listes. Elles ne sont pas prévenues.">
      {isPending ? <ActivityIndicator color={colors.coral} /> : null}
      {data?.length === 0 ? <Notice tone="info">Tu n&apos;as bloqué personne.</Notice> : null}
      {data?.map((person) => (
        <View key={person.id} className="flex-row items-center gap-3 rounded-3xl bg-white p-3 dark:bg-night">
          <Avatar firstName={person.first_name} lastName={person.last_name} />
          <Text className="flex-1 font-strong text-base text-night dark:text-cream">
            {person.first_name} {person.last_name}
          </Text>
          <Button label="Débloquer" variant="ghost" onPress={() => unblock(person.id)} />
        </View>
      ))}
    </FormScreen>
  );
}
