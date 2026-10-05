import { router } from 'expo-router';

import { InterestsField, MAX_INTERESTS } from '@/components/profile-fields';
import { Button, FormScreen } from '@/components/ui';
import { useSignupDraft } from '@/lib/signup-draft';

export default function InterestsScreen() {
  const { draft, update } = useSignupDraft();

  return (
    <FormScreen
      title="Tu aimes quoi ?"
      subtitle={`Choisis jusqu'à ${MAX_INTERESTS} envies, on te proposera des activités qui te ressemblent. Tu peux aussi passer.`}
      footer={<Button label={draft.interests.length ? 'Continuer' : 'Passer'} onPress={() => router.push('/terms')} />}>
      <InterestsField value={draft.interests} onChange={(interests) => update({ interests })} />
    </FormScreen>
  );
}
