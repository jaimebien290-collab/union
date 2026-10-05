import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { Button, EmptyState, LoadingScreen, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';

// Tout ce qui est sous (app) exige un compte complet (D6 : pas d'accès sans école partenaire).
export default function AppLayout() {
  const { session, profile, loading, profileError, retryProfile, inFlow } = useSession();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/welcome" />;
  if (profileError) {
    return (
      <Screen title="UNION">
        <EmptyState emoji="📡" message="Pas de connexion. Vérifie ton réseau." action={<Button label="Réessayer" onPress={retryProfile} />} />
      </Screen>
    );
  }
  // Inscription commencée mais pas terminée (app fermée en route) : on reprend à la bonne étape.
  if (!profile) return <Redirect href={session.user.user_metadata?.password_set ? '/infos' : '/password'} />;
  if (inFlow) return <LoadingScreen />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
