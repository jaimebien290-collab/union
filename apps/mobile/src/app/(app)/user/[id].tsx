import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { colors } from '@union/shared';

import { ProfileCard, type PublicProfile } from '@/components/profile-card';
import { FormScreen, Notice } from '@/components/ui';
import { supabase } from '@/lib/supabase';

// F-PROF-02. Message, bloquer et signaler (F-PROF-06) arrivent avec la messagerie et la modération (lot 3).
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  return (
    <FormScreen title="Profil">
      {isPending ? <ActivityIndicator color={colors.coral} /> : null}
      {data ? <ProfileCard profile={data} /> : null}
      {!isPending && !data ? <Notice tone="info">Ce profil n&apos;est plus disponible.</Notice> : null}
    </FormScreen>
  );
}
