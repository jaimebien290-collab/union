import { EmptyState, Screen } from '@/components/ui';

export default function AgendaScreen() {
  return (
    <Screen title="Mon agenda">
      <EmptyState emoji="📅" message="Ton agenda est vide. Rejoins une activité et elle apparaîtra ici." />
    </Screen>
  );
}
