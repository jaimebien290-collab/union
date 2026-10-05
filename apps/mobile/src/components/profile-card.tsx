import { Text, View } from 'react-native';

import { CATEGORIES, type CategoryCode } from '@union/shared';

import { Avatar, Card, Chip, ChipGroup } from '@/components/ui';

export type PublicProfile = {
  id: string;
  first_name: string;
  last_name: string;
  program: string | null;
  study_year: number | null;
  bio: string | null;
  avatar_url: string | null;
  interests: CategoryCode[];
  role: string;
  is_mentor: boolean;
};

const yearLabel = (year: number) => (year === 1 ? '1re année' : `${year}e année`);

/** Profil tel que le voient les étudiants de la même école (F-PROF-02) : jamais d'email ni de date de naissance. */
export function ProfileCard({ profile, schoolName }: { profile: PublicProfile; schoolName?: string }) {
  const interests = CATEGORIES.filter((category) => profile.interests.includes(category.code));
  const studies = [profile.program, profile.study_year ? yearLabel(profile.study_year) : null].filter(Boolean).join(' · ');

  return (
    <Card>
      <View className="flex-row items-center gap-4">
        <Avatar firstName={profile.first_name} lastName={profile.last_name} path={profile.avatar_url} size={72} />
        <View className="flex-1">
          <Text className="font-strong text-xl text-night dark:text-cream">
            {profile.first_name} {profile.last_name}
          </Text>
          {studies ? <Text className="font-body text-sm text-night/70 dark:text-cream/70">{studies}</Text> : null}
          {schoolName ? <Text className="font-body text-sm text-night/70 dark:text-cream/70">{schoolName}</Text> : null}
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
  );
}
