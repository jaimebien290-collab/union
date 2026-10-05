import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Notice } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useSignupDraft } from '@/lib/signup-draft';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function WelcomeScreen() {
  const { notice, setInFlow } = useSession();
  const { update } = useSignupDraft();

  // Revenir ici, c'est abandonner le parcours en cours.
  useFocusEffect(useCallback(() => setInFlow(false), [setInFlow]));

  const start = (mode: 'signup' | 'reset') => {
    update({ mode });
    router.push('/email');
  };

  return (
    <SafeAreaView className="flex-1 bg-coral">
      <View className="flex-1 justify-center px-6">
        <Text accessibilityRole="header" className="font-display text-6xl text-white">
          UNION
        </Text>
        <Text className="mt-3 font-strong text-2xl text-white">Bienvenue sur UNION, trouve ta bande.</Text>
        <Text className="mt-3 font-body text-base text-white/90">
          Rejoins des activités près de chez toi avec des étudiants de ton école.
        </Text>
      </View>
      <View className="gap-3 rounded-t-3xl bg-cream px-6 pb-6 pt-6 dark:bg-ink">
        <Notice tone="info">{notice}</Notice>
        {isSupabaseConfigured ? null : (
          <Notice>Supabase n&apos;est pas configuré (fichier .env manquant) : la connexion ne marchera pas.</Notice>
        )}
        <Button label="C'est parti" onPress={() => start('signup')} />
        <Button label="J'ai déjà un compte" variant="secondary" onPress={() => router.push('/login')} />
      </View>
    </SafeAreaView>
  );
}
