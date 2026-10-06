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
        <Button label={`⭐ ${profile.points_balance} points · mes badges`} onPress={() => router.push('/points')} />
        <Button label="Mes rencontres" variant="secondary" onPress={() => router.push('/encounters')} />
        <Button label="Parrainage" variant="secondary" onPress={() => router.push('/mentoring')} />
        {/* F-HELP-01 : toujours accessible. */}
        <Button label="Besoin de parler ?" variant="secondary" onPress={() => router.push('/help')} />
        {profile.role === 'ambassador' || profile.role === 'school_admin' ? (
          <Button label="Modération" onPress={() => router.push('/moderation')} />
        ) : null}
        <Button label="Modifier mon profil" variant="secondary" onPress={() => router.push('/edit-profile')} />
        <Button label="Réglages" variant="secondary" onPress={() => router.push('/settings')} />
      </ScrollView>
    </Screen>
  );
}
