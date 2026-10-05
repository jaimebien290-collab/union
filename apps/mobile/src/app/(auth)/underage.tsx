import { router } from 'expo-router';

import { Button, FormScreen } from '@/components/ui';

// F-AUTH-04 : refus bienveillant. À ce stade le compte a déjà été supprimé côté serveur.
export default function UnderageScreen() {
  return (
    <FormScreen
      back={false}
      title="On se retrouve bientôt 👋"
      subtitle="UNION est réservé aux étudiants de 18 ans et plus. On n'a rien gardé de ce que tu as saisi. Reviens nous voir dès tes 18 ans, on t'attend !"
      footer={<Button label="Retour à l'accueil" onPress={() => router.replace('/welcome')} />}
    />
  );
}
