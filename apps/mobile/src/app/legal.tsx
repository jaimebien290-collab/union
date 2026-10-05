import { Text, View } from 'react-native';

import { SUPPORT_EMAIL } from '@union/shared';

import { FormScreen, Notice } from '@/components/ui';

// Textes PROVISOIRES. Les versions définitives (CGU, politique de confidentialité, charte) sont
// à rédiger et faire valider juridiquement au lot 7 (NF-RGPD-02), puis à héberger en ligne (NF-STORE-05).
const SECTIONS = [
  {
    title: 'Charte de bonne conduite',
    body: "UNION sert à se retrouver en vrai, entre étudiants d'une même école. On se respecte, en ligne comme pendant les activités. Pas de harcèlement, d'insultes, de discrimination, de spam ni de faux profil. Si tu t'inscris à une activité, viens, ou désinscris-toi pour libérer ta place. Un contenu ou un comportement qui pose problème peut être signalé ; l'école peut suspendre un compte qui ne respecte pas cette charte.",
  },
  {
    title: "Conditions générales d'utilisation",
    body: "UNION est réservé aux étudiants majeurs (18 ans et plus) d'un établissement partenaire, inscrits avec leur email d'école et leur vrai nom. L'application est gratuite pour les étudiants. Tu es responsable de ce que tu publies et des activités que tu organises. Tu peux supprimer ton compte à tout moment depuis les réglages.",
  },
  {
    title: 'Politique de confidentialité',
    body: "On collecte le strict nécessaire : ton email d'école, ton nom, ta date de naissance (uniquement pour vérifier que tu es majeur), ta formation, ton année, et ce que tu choisis d'ajouter (photo, bio, centres d'intérêt). Les autres étudiants de ton école voient ton profil public, jamais ton email ni ta date de naissance. Ton école ne voit aucune donnée individuelle : seulement des statistiques anonymes, masquées en dessous de 5 personnes. Tes données sont hébergées dans l'Union européenne. Depuis les réglages, tu peux les exporter ou supprimer ton compte.",
  },
];

export default function LegalScreen() {
  return (
    <FormScreen title="Les règles d'UNION">
      <Notice tone="info">Version provisoire, en attente de validation juridique.</Notice>
      {SECTIONS.map((section) => (
        <View key={section.title} className="gap-1.5">
          <Text accessibilityRole="header" className="font-strong text-lg text-night dark:text-cream">
            {section.title}
          </Text>
          <Text className="font-body text-base text-night/80 dark:text-cream/80">{section.body}</Text>
        </View>
      ))}
      <Text className="font-body text-sm text-night/60 dark:text-cream/60">Une question ? Écris-nous : {SUPPORT_EMAIL}</Text>
    </FormScreen>
  );
}
