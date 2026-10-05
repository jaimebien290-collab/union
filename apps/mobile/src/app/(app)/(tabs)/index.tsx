import { router } from 'expo-router';

import { Button, EmptyState, Screen } from '@/components/ui';

export default function HomeScreen() {
  return (
    <Screen title="À venir">
      <EmptyState
        emoji="⚽"
        message="Rien de prévu pour l'instant… Et si c'était toi qui lançais le premier foot ?"
        action={<Button label="Créer une activité" onPress={() => router.push('/create')} />}
      />
    </Screen>
  );
}
