import type { ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';

// react-native-maps n'existe pas sur le web. L'aperçu dans le navigateur sert au développement :
// on y affiche un simple encart à la place de la carte.
export default function MapView({ style }: { style?: ViewStyle; children?: ReactNode; [prop: string]: unknown }) {
  return (
    <View style={style} className="items-center justify-center bg-night/10 p-4 dark:bg-cream/10">
      <Text className="text-3xl">🗺️</Text>
      <Text className="text-center font-semi text-sm text-night/70 dark:text-cream/70">La carte s&apos;affiche sur téléphone.</Text>
    </View>
  );
}

export function Marker(_props: Record<string, unknown>) {
  return null;
}
