import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import MapView, { Marker } from '@/components/map';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@union/shared';

import { regionAround } from '@/components/activity-map';
import { Button, TextField } from '@/components/ui';
import { emitPlacePicked, type Place, reversePlace, searchPlaces } from '@/lib/geocode';
import { useCampus } from '@/lib/session';

// F-ACT-03 : adresse avec autocomplétion OU épingle posée sur la carte.
export default function PickLocationScreen() {
  const campus = useCampus().data ?? undefined;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    let stale = false;
    const timer = setTimeout(() => {
      searchPlaces(query, campus)
        .then((places) => !stale && setResults(places))
        .catch(() => !stale && setResults([]));
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, campus]);

  const choose = (next: Place) => {
    setPlace(next);
    setName(next.name);
    setResults([]);
    setQuery('');
  };

  const confirm = () => {
    if (!place) return;
    emitPlacePicked({ ...place, name: name.trim() || place.name });
    router.back();
  };

  const center = place ?? campus;

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-ink">
      <View className="gap-2 px-5 pb-3 pt-4">
        <Text accessibilityRole="header" className="font-display text-2xl text-night dark:text-cream">
          C&apos;est où ?
        </Text>
        <TextField
          label="Chercher une adresse"
          value={query}
          onChangeText={setQuery}
          placeholder="Ex. 3 rue du Docteur Fréry, Belfort"
          autoCorrect={false}
          returnKeyType="search"
        />
        {results.map((result) => (
          <Pressable
            key={`${result.address}-${result.lat}`}
            accessibilityRole="button"
            onPress={() => choose(result)}
            className="rounded-2xl bg-white px-4 py-3 active:opacity-80 dark:bg-night">
            <Text className="font-body text-base text-night dark:text-cream">{result.address}</Text>
          </Pressable>
        ))}
        <Text className="font-body text-sm text-night/70 dark:text-cream/70">Ou touche la carte pour poser l&apos;épingle.</Text>
      </View>

      <View className="mx-5 flex-1 overflow-hidden rounded-3xl">
        <MapView
          // La carte se recentre quand le lieu (ou le campus, une fois chargé) change.
          key={center ? `${center.lat},${center.lng}` : 'none'}
          style={{ flex: 1 }}
          initialRegion={center ? regionAround(center.lat, center.lng, place ? 0.01 : 0.04) : undefined}
          onPress={(event) => {
            const { latitude, longitude } = event.nativeEvent.coordinate;
            reversePlace(latitude, longitude).then(choose);
          }}>
          {place ? <Marker coordinate={{ latitude: place.lat, longitude: place.lng }} pinColor={colors.coral} /> : null}
        </MapView>
      </View>

      <View className="gap-3 px-5 pb-4 pt-3">
        {place ? <TextField label="Nom du lieu" value={name} onChangeText={setName} placeholder="Ex. Gymnase, BU, Le Bistrot…" maxLength={120} /> : null}
        <Button label="Valider ce lieu" disabled={!place} onPress={confirm} />
        <Button label="Annuler" variant="ghost" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}
