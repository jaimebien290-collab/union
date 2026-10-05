import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { ProfileCard } from '@/components/profile-card';
import { Button, Screen } from '@/components/ui';
import { useMySchool, useSession } from '@/lib/session';

export default function ProfileScreen() {
  const { profile } = useSession();
  const school = useMySchool().data;
  if (!profile) return null;

  return (
    <Screen title="Profil">
      <ScrollView className="mt-6" contentContainerClassName="gap-4 pb-8" showsVerticalScrollIndicator={false}>
        <ProfileCard profile={profile} schoolName={school?.name} />
        <Button label="Modifier mon profil" variant="secondary" onPress={() => router.push('/edit-profile')} />
        <Button label="Réglages" variant="secondary" onPress={() => router.push('/settings')} />
      </ScrollView>
    </Screen>
  );
}
