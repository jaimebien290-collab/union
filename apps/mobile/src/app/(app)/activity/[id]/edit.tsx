import { router, useLocalSearchParams } from 'expo-router';

import { ActivityForm } from '@/components/activity-form';
import { FormScreen, LoadingScreen, Notice } from '@/components/ui';
import { useActivity } from '@/lib/activities';
import { useSession } from '@/lib/session';

// F-ACT-09 : seul l'organisateur modifie. Les inscrits sont prévenus si la date ou le lieu change.
export default function EditActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const { data: activity, isPending } = useActivity(id);

  if (isPending) return <LoadingScreen />;

  return (
    <FormScreen title="Modifier l'activité">
      {activity && activity.creator_id === profile?.id ? (
        <ActivityForm activity={activity} submitLabel="Enregistrer" onSaved={() => router.back()} />
      ) : (
        <Notice tone="info">Cette activité n&apos;est plus modifiable.</Notice>
      )}
    </FormScreen>
  );
}
