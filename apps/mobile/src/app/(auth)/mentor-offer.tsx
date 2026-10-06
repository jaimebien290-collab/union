import { useState } from 'react';

import { Button, FormScreen, Notice } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { useMentoringAction } from '@/lib/mentoring';
import { useSession } from '@/lib/session';

// P1, étape 9 : proposé aux nouveaux arrivants à la fin de l'inscription (F-MENT-03).
export default function MentorOfferScreen() {
  const { setInFlow } = useSession();
  const action = useMentoringAction();
  const [error, setError] = useState('');

  const accept = async () => {
    setError('');
    try {
      await action.mutateAsync({ name: 'request_mentor' });
      setInFlow(false);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <FormScreen
      back={false}
      title="Tu veux un parrain ?"
      subtitle="Un étudiant plus ancien de ton école, volontaire, pour t'aider à démarrer : les bons plans, les activités, les questions qu'on n'ose pas poser. Tu pourras arrêter quand tu veux."
      footer={
        <>
          <Button label="Oui, je veux bien" loading={action.isPending} onPress={accept} />
          {/* Fin du parcours d'inscription : la redirection vers l'app se fait dès que inFlow repasse à faux. */}
          <Button label="Plus tard" variant="secondary" onPress={() => setInFlow(false)} />
        </>
      }>
      <Notice>{error}</Notice>
    </FormScreen>
  );
}
