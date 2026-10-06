import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';

import { Button, EmptyState, LoadingScreen, Screen } from '@/components/ui';
import { useChatRealtime } from '@/lib/chat';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

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

  return (
    <>
      <ChatRealtime />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

/** Écoute les nouveaux messages tant qu'on est connecté (F-CHAT-04). */
function ChatRealtime() {
  useChatRealtime();
  // F-DASH-02 : signale l'ouverture de l'app (le serveur n'en garde qu'une par heure).
  useEffect(() => {
    supabase.rpc('touch_last_seen').then(() => undefined);
  }, []);
  return null;
}
