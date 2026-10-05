import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { CATEGORIES } from '@union/shared';

import { Avatar, Button, Card, Chip, ChipGroup, Screen } from '@/components/ui';
import { useMySchool, useSession } from '@/lib/session';

const yearLabel = (year: number) => (year === 1 ? '1re année' : `${year}e année`);

export default function ProfileScreen() {
  const { profile } = useSession();
  const school = useMySchool().data;
  if (!profile) return null;

  const interests = CATEGORIES.filter((category) => profile.interests.includes(category.code));
  const studies = [profile.program, profile.study_year ? yearLabel(profile.study_year) : null].filter(Boolean).join(' · ');

  return (
    <Screen title="Profil">
      <ScrollView className="mt-6" contentContainerClassName="gap-4 pb-8" showsVerticalScrollIndicator={false}>
        <Card>
          <View className="flex-row items-center gap-4">
            <Avatar firstName={profile.first_name} lastName={profile.last_name} path={profile.avatar_url} size={72} />
            <View className="flex-1">
              <Text className="font-strong text-xl text-night dark:text-cream">
                {profile.first_name} {profile.last_name}
              </Text>
              {studies ? <Text className="font-body text-sm text-night/70 dark:text-cream/70">{studies}</Text> : null}
              {school ? <Text className="font-body text-sm text-night/70 dark:text-cream/70">{school.name}</Text> : null}
            </View>
          </View>
          {/* F-PROF-05 */}
          {profile.role === 'ambassador' || profile.is_mentor ? (
            <View className="mt-3">
              <ChipGroup>
                {profile.role === 'ambassador' ? <Chip label="⭐ Ambassadeur" selected /> : null}
                {profile.is_mentor ? <Chip label="🤝 Parrain" selected /> : null}
              </ChipGroup>
            </View>
          ) : null}
          {profile.bio ? <Text className="mt-3 font-body text-base text-night dark:text-cream">{profile.bio}</Text> : null}
          {interests.length ? (
            <View className="mt-3">
              <ChipGroup>
                {interests.map((category) => (
                  <Chip key={category.code} label={`${category.emoji} ${category.label}`} />
                ))}
              </ChipGroup>
            </View>
          ) : null}
        </Card>
        <Button label="Modifier mon profil" variant="secondary" onPress={() => router.push('/edit-profile')} />
        <Button label="Réglages" variant="secondary" onPress={() => router.push('/settings')} />
      </ScrollView>
    </Screen>
  );
}
