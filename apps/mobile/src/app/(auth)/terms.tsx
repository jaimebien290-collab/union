import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Checkbox, FormScreen, Notice } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { useSignupDraft } from '@/lib/signup-draft';
import { supabase } from '@/lib/supabase';

export default function TermsScreen() {
  const { draft } = useSignupDraft();
  const { session, loadProfile, setInFlow, signOut } = useSession();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    setLoading(true);
    // Le profil va exister : on garde la main pour proposer la photo avant d'entrer dans l'app.
    setInFlow(true);
    try {
      const { data, error } = await supabase.rpc('complete_signup', {
        p_first_name: draft.firstName,
        p_last_name: draft.lastName,
        p_birth_date: draft.birthDate,
        p_program: draft.program,
        p_study_year: draft.studyYear,
        p_is_newcomer: draft.isNewcomer,
        p_interests: draft.interests,
        p_accept_terms: accepted,
      });
      if (error) throw error;
      if (data === 'underage') {
        await signOut();
        router.replace('/underage');
        return;
      }
      await loadProfile(session!.user.id);
      router.replace('/photo');
    } catch (e) {
      setInFlow(false);
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen
      title="Les règles du jeu"
      subtitle="UNION est un espace entre étudiants de ton école. Pour que ça reste sympa pour tout le monde :"
      footer={<Button label="Créer mon compte" loading={loading} disabled={!accepted} onPress={submit} />}>
      <Text className="font-body text-base text-night dark:text-cream">
        • On se respecte, en ligne comme en vrai.{'\n'}• Pas de harcèlement, de spam ni de faux profil.{'\n'}• Ton école ne voit
        jamais ce que tu fais individuellement, seulement des statistiques anonymes.
      </Text>
      <Button label="Lire les CGU, la confidentialité et la charte" variant="ghost" onPress={() => router.push('/legal')} />
      <Checkbox checked={accepted} onChange={setAccepted}>
        J&apos;ai lu et j&apos;accepte les CGU, la politique de confidentialité et la charte de bonne conduite.
      </Checkbox>
      <Notice>{error}</Notice>
    </FormScreen>
  );
}
