import { Redirect, useSegments } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { useSession } from '@/lib/session';
import { SignupDraftProvider } from '@/lib/signup-draft';

// Étapes qui n'ont de sens qu'avec une session ouverte (après la vérification du code).
const NEEDS_SESSION = ['password', 'infos', 'interests', 'terms', 'photo'];

export default function AuthLayout() {
  const { session, profile, loading, inFlow } = useSession();
  const screen = useSegments().at(-1) ?? '';

  // Compte complet et aucun parcours en cours : direction l'app.
  if (session && profile && !inFlow) return <Redirect href="/" />;
  // Session perdue en cours de route (déconnexion, compte suspendu) : retour à l'accueil.
  if (!loading && !session && NEEDS_SESSION.includes(screen)) return <Redirect href="/welcome" />;

  return (
    <SignupDraftProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SignupDraftProvider>
  );
}
