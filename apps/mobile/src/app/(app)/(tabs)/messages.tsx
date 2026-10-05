import { EmptyState, Screen } from '@/components/ui';

export default function MessagesScreen() {
  return (
    <Screen title="Messages">
      <EmptyState emoji="💬" message="Pas encore de message. Les discussions s'ouvrent dès que tu rejoins une activité." />
    </Screen>
  );
}
