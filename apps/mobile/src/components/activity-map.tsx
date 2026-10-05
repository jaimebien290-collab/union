import { useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { colors } from '@union/shared';

import { ActivityCard } from '@/components/activity-card';
import { LoadingScreen } from '@/components/ui';
import type { Activity } from '@/lib/activities';
import { useCampus } from '@/lib/session';

// Sans campus connu : la France entière.
const FRANCE = { latitude: 46.6, longitude: 2.4, latitudeDelta: 9, longitudeDelta: 9 };

export const regionAround = (lat: number, lng: number, delta = 0.04) => ({
  latitude: lat,
  longitude: lng,
  latitudeDelta: delta,
  longitudeDelta: delta,
});

/**
 * Carte des activités à venir (F-DISC-04) : une épingle par activité, à la couleur de sa catégorie.
 * La position des étudiants n'y figure jamais (F-DISC-05).
 */
export function ActivityMap({ activities }: { activities: Activity[] }) {
  const campus = useCampus();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = activities.find((activity) => activity.id === selectedId);

  if (campus.isPending) return <LoadingScreen />;

  return (
    <View className="flex-1 overflow-hidden rounded-3xl">
      <MapView
        style={{ flex: 1 }}
        initialRegion={campus.data ? regionAround(campus.data.lat, campus.data.lng) : FRANCE}
        onPress={() => setSelectedId(null)}
        toolbarEnabled={false}>
        {activities.map((activity) => (
          <Marker
            key={activity.id}
            coordinate={{ latitude: activity.lat, longitude: activity.lng }}
            pinColor={colors.category[activity.category]}
            onPress={(event) => {
              event.stopPropagation();
              setSelectedId(activity.id);
            }}
          />
        ))}
      </MapView>
      {selected ? (
        <View className="absolute bottom-3 left-3 right-3">
          <ActivityCard activity={selected} />
        </View>
      ) : null}
    </View>
  );
}
