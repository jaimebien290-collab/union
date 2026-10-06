import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, FormScreen, Notice } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { badgeOf, type CheckinResult, useCheckin } from '@/lib/presence';

// F-ACT-10, côté participant : scanner le QR affiché par l'organisateur.
export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const checkin = useCheckin();
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState('');
  // La caméra relit le même code plusieurs fois par seconde : on ne traite qu'un scan à la fois.
  const busy = useRef(false);

  const onScanned = async ({ data }: { data: string }) => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      setResult(await checkin.mutateAsync(data));
    } catch (e) {
      setError(friendlyError(e));
      // Laisse le temps de lire le message avant d'accepter un nouveau scan.
      setTimeout(() => (busy.current = false), 2500);
    }
  };

  if (result) {
    const badges = result.badges.map(badgeOf).filter((badge) => badge !== undefined);
    return (
      <FormScreen
        back={false}
        title={result.status === 'already' ? 'Déjà validé 👍' : 'Présence validée 🎉'}
        subtitle={
          result.status === 'already'
            ? 'Ta présence à cette activité était déjà enregistrée.'
            : result.points > 0
              ? `+${result.points} points. Les participants apparaissent maintenant dans « Mes rencontres ».`
              : 'Tu as atteint le plafond de points du jour, mais ta présence compte bien.'
        }
        footer={<Button label="Super" onPress={() => router.back()} />}>
        {badges.map((badge) => (
          <View key={badge.code} className="items-center gap-1 rounded-3xl bg-sun/30 p-5">
            <Text className="text-5xl">{badge.emoji}</Text>
            <Text className="font-display text-xl text-night dark:text-cream">Badge « {badge.name} » débloqué</Text>
            <Text className="font-body text-sm text-night/70 dark:text-cream/70">{badge.description}</Text>
          </View>
        ))}
      </FormScreen>
    );
  }

  if (!permission?.granted) {
    return (
      <FormScreen
        title="Scanner le QR code"
        subtitle="UNION a besoin de l'appareil photo, uniquement pour lire le QR code de l'organisateur. Aucune photo n'est prise ni envoyée."
        footer={
          permission && !permission.canAskAgain ? (
            <Button label="Ouvrir les réglages" onPress={() => Linking.openSettings()} />
          ) : (
            <Button label="Autoriser l'appareil photo" onPress={requestPermission} />
          )
        }
      />
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScanned} />
      <SafeAreaView className="absolute bottom-0 left-0 right-0 gap-3 px-5 pb-4">
        <Notice>{error}</Notice>
        <Text className="text-center font-strong text-base text-white">Vise le QR code sur l&apos;écran de l&apos;organisateur</Text>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    </View>
  );
}
