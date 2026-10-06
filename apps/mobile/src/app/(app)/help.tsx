import { ActivityIndicator, Linking, Text, View } from 'react-native';

import { colors } from '@union/shared';

import { Button, FormScreen } from '@/components/ui';
import { type SupportResource, useSupportResources } from '@/lib/mentoring';

// F-HELP. Ton sobre : pas d'emoji festif, pas de points (F-HELP-05). Rien n'est enregistré sur l'ouverture
// de cet écran, et l'école ne sait pas qui l'a consulté (F-HELP-04).

function Resource({ resource }: { resource: SupportResource }) {
  return (
    <View className="gap-2 rounded-3xl bg-white p-4 dark:bg-night">
      <Text className="font-strong text-base text-night dark:text-cream">{resource.name}</Text>
      {resource.description ? <Text className="font-body text-base text-night/80 dark:text-cream/80">{resource.description}</Text> : null}
      {resource.hours ? <Text className="font-body text-sm text-night/60 dark:text-cream/60">{resource.hours}</Text> : null}
      {/* F-HELP-03 */}
      {resource.phone ? <Button label={`Appeler le ${resource.phone}`} variant="secondary" onPress={() => Linking.openURL(`tel:${resource.phone}`)} /> : null}
      {resource.url ? <Button label="Ouvrir le site" variant="secondary" onPress={() => Linking.openURL(resource.url!)} /> : null}
    </View>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="mt-2 font-strong text-lg text-night dark:text-cream">
      {children}
    </Text>
  );
}

export default function HelpScreen() {
  const { data, isPending } = useSupportResources();
  const school = (data ?? []).filter((resource) => resource.school_id);
  const national = (data ?? []).filter((resource) => !resource.school_id);

  return (
    <FormScreen
      title="Besoin de parler ?"
      subtitle="Ça arrive à tout le monde de ne pas aller bien. Voici des personnes dont c'est le métier d'écouter, gratuitement et sans jugement. Ton école ne sait pas que tu as ouvert cette page.">
      {isPending ? <ActivityIndicator color={colors.night} /> : null}

      {school.length ? <Heading>Dans ton école</Heading> : null}
      {school.map((resource) => (
        <Resource key={resource.id} resource={resource} />
      ))}

      {national.length ? <Heading>Partout en France</Heading> : null}
      {national.map((resource) => (
        <Resource key={resource.id} resource={resource} />
      ))}

      <Heading>En cas d&apos;urgence</Heading>
      <View className="gap-2 rounded-3xl bg-white p-4 dark:bg-night">
        <Text className="font-body text-base text-night/80 dark:text-cream/80">
          Si toi ou quelqu&apos;un d&apos;autre êtes en danger immédiat, appelle les secours.
        </Text>
        <Button label="Appeler le 15 (SAMU)" variant="secondary" onPress={() => Linking.openURL('tel:15')} />
        <Button label="Appeler le 112 (urgences)" variant="secondary" onPress={() => Linking.openURL('tel:112')} />
      </View>
    </FormScreen>
  );
}
