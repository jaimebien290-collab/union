import { router } from 'expo-router';
import { SectionList, Text } from 'react-native';

import { ActivityCard } from '@/components/activity-card';
import { Button, EmptyState, LoadingScreen, Screen } from '@/components/ui';
import { type Activity, formatDay, useMyActivities } from '@/lib/activities';

/** À venir, jour par jour (F-CAL-01), puis l'historique du plus récent au plus ancien (F-ACT-11). */
function toSections(activities: Activity[]) {
  const now = Date.now();
  const upcoming = activities.filter((a) => new Date(a.ends_at).getTime() > now && a.status === 'published').reverse();
  const past = activities.filter((a) => new Date(a.ends_at).getTime() <= now);

  const sections: { title: string; data: Activity[] }[] = [];
  for (const activity of upcoming) {
    const title = formatDay(activity.starts_at);
    const last = sections[sections.length - 1];
    if (last?.title === title) last.data.push(activity);
    else sections.push({ title, data: [activity] });
  }
  if (past.length) sections.push({ title: 'Mon historique', data: past });
  return sections;
}

export default function AgendaScreen() {
  const { data, isPending, isRefetching, refetch } = useMyActivities();
  const sections = toSections(data ?? []);

  return (
    <Screen title="Mon agenda">
      {isPending ? (
        <LoadingScreen />
      ) : sections.length === 0 ? (
        <EmptyState
          emoji="📅"
          message="Ton agenda est vide. Rejoins une activité et elle apparaîtra ici."
          action={<Button label="Voir les activités" onPress={() => router.push('/')} />}
        />
      ) : (
        <SectionList
          className="mt-4"
          sections={sections}
          keyExtractor={(activity) => activity.id}
          renderItem={({ item }) => <ActivityCard activity={item} />}
          renderSectionHeader={({ section }) => (
            <Text accessibilityRole="header" className="bg-cream pb-2 pt-4 font-strong text-lg text-night dark:bg-ink dark:text-cream">
              {section.title}
            </Text>
          )}
          contentContainerClassName="gap-3 pb-8"
          showsVerticalScrollIndicator={false}
          refreshing={isRefetching}
          onRefresh={refetch}
        />
      )}
    </Screen>
  );
}
