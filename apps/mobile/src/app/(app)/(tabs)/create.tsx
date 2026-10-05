import { EmptyState, Screen } from '@/components/ui';

export default function CreateScreen() {
  return (
    <Screen title="Nouvelle activité">
      <EmptyState emoji="✨" message="Bientôt : lance un foot, une sortie ou une session révisions en 30 secondes." />
    </Screen>
  );
}
