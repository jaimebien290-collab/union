import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import MapView, { Marker } from '@/components/map';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@union/shared';

import { categoryOf, Cover, StatusBadges } from '@/components/activity-card';
import { regionAround } from '@/components/activity-map';
import { Avatar, Button, EmptyState, LoadingScreen, Notice } from '@/components/ui';
import { type Activity, formatRange, spotsLabel, useActivity, useActivityAction, useParticipants } from '@/lib/activities';
import { useActivityConversationId } from '@/lib/chat';
import { Alert } from '@/lib/alert';
import { friendlyError } from '@/lib/errors';
import { isCheckinOpen, useEncounters } from '@/lib/presence';
import { useSession } from '@/lib/session';

// F-ACT-08 : ouvre Plans (iOS) ou Google Maps (Android) sur l'itinéraire.
function openDirections(activity: Activity) {
  const destination = `${activity.lat},${activity.lng}`;
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${destination}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  Linking.openURL(url);
}

// F-CAL-02 : ouvre la fiche d'ajout du calendrier du téléphone, pré-remplie.
async function addToCalendar(activity: Activity) {
  await Calendar.createEventInCalendarAsync({
    title: activity.title,
    startDate: new Date(activity.starts_at),
    endDate: new Date(activity.ends_at),
    location: activity.address ? `${activity.location_name}, ${activity.address}` : activity.location_name,
    notes: [activity.description, `union://activity/${activity.id}`].filter(Boolean).join('\n\n'),
  });
}

function Row({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View className="flex-row items-start gap-3">
      <Ionicons name={icon} size={20} color={colors.coral} style={{ marginTop: 2 }} />
      <View className="flex-1">{children}</View>
    </View>
  );
}

function ParticipantsRow({ activity }: { activity: Activity }) {
  const { data } = useParticipants(activity.id);
  const shown = (data ?? []).slice(0, 6);
  // F-MATCH-04 : combien de mes rencontres y vont.
  const met = new Set((useEncounters().data ?? []).map((person) => person.user_id));
  const familiar = (data ?? []).filter((person) => met.has(person.id)).length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Voir les participants : ${spotsLabel(activity)}`}
      onPress={() => router.push(`/activity/${activity.id}/participants`)}
      className="gap-2 rounded-3xl bg-white p-4 active:opacity-80 dark:bg-night">
      <View className="flex-row">
        {shown.map((person, index) => (
          <View key={person.id} style={{ marginLeft: index === 0 ? 0 : -10 }}>
            <Avatar firstName={person.first_name} lastName={person.last_name} path={person.avatar_url} size={36} />
          </View>
        ))}
      </View>
      <Text className="font-semi text-sm text-night dark:text-cream">{spotsLabel(activity)} · voir la liste</Text>
      {familiar > 0 ? (
        <Text className="font-semi text-sm text-coral">
          👋 {familiar} personne{familiar > 1 ? 's' : ''} que tu as rencontrée{familiar > 1 ? 's' : ''} y {familiar > 1 ? 'vont' : 'va'}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const { data: activity, isPending, isRefetching, refetch } = useActivity(id);
  const join = useActivityAction('join_activity');
  const leave = useActivityAction('leave_activity');
  const cancel = useActivityAction('cancel_activity');
  const conversationId = useActivityConversationId(id, activity?.my_status === 'registered');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // Heure d'ouverture de l'écran : sert à savoir si l'activité a commencé ou est terminée.
  const [now] = useState(Date.now);

  if (isPending) return <LoadingScreen />;
  if (!activity) {
    return (
      <SafeAreaView className="flex-1 bg-cream dark:bg-ink">
        <EmptyState emoji="🤷" message="Cette activité n'est plus disponible." action={<Button label="Retour" onPress={() => router.back()} />} />
      </SafeAreaView>
    );
  }

  const category = categoryOf(activity.category);
  const isOrganizer = activity.creator_id === profile?.id;
  const started = new Date(activity.starts_at).getTime() <= now;
  const open = activity.status === 'published' && !started;
  const full = activity.spots_left !== null && activity.spots_left <= 0;
  const checkinOpen = isCheckinOpen(activity, now);
  const canValidate = isOrganizer || profile?.role === 'ambassador';

  const run = async (action: typeof join, onDone?: (result: string | null) => void) => {
    setError('');
    setInfo('');
    try {
      onDone?.(await action.mutateAsync(activity.id));
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const confirmCancel = () =>
    Alert.alert("Annuler l'activité ?", 'Tous les inscrits seront prévenus. Tu ne pourras pas revenir en arrière.', [
      { text: 'Non, la garder', style: 'cancel' },
      { text: "Oui, l'annuler", style: 'destructive', onPress: () => run(cancel) },
    ]);

  return (
    <View className="flex-1 bg-cream dark:bg-ink">
      <ScrollView
        contentContainerClassName="pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.coral} />}>
        <Cover activity={activity} height={220} />
        <SafeAreaView edges={['top']} className="absolute left-4 top-0">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            hitSlop={12}
            onPress={() => router.back()}
            className="mt-2 h-10 w-10 items-center justify-center rounded-full bg-white/90">
            <Ionicons name="chevron-back" size={24} color={colors.night} />
          </Pressable>
        </SafeAreaView>

        <View className="gap-5 px-5 pt-5">
          <View className="gap-2">
            <StatusBadges activity={activity} />
            <Text accessibilityRole="header" className="font-display text-3xl text-night dark:text-cream">
              {activity.title}
            </Text>
            <Text className="font-semi text-sm text-night/70 dark:text-cream/70">
              {category.emoji} {category.label}
            </Text>
          </View>

          <View className="gap-3">
            <Row icon="calendar">
              <Text className="font-semi text-base text-night dark:text-cream">{formatRange(activity)}</Text>
            </Row>
            <Row icon="location">
              <Text className="font-semi text-base text-night dark:text-cream">{activity.location_name}</Text>
              {activity.address ? <Text className="font-body text-sm text-night/70 dark:text-cream/70">{activity.address}</Text> : null}
            </Row>
          </View>

          <View className="h-40 overflow-hidden rounded-3xl">
            <MapView
              style={{ flex: 1 }}
              pointerEvents="none"
              liteMode
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
              region={regionAround(activity.lat, activity.lng, 0.01)}>
              <Marker coordinate={{ latitude: activity.lat, longitude: activity.lng }} pinColor={colors.category[activity.category]} />
            </MapView>
          </View>
          <Button label="Itinéraire" variant="secondary" onPress={() => openDirections(activity)} />

          {activity.creator_first_name ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/user/${activity.creator_id}`)}
              className="flex-row items-center gap-3 active:opacity-80">
              <Avatar
                firstName={activity.creator_first_name}
                lastName={activity.creator_last_name ?? ''}
                path={activity.creator_avatar_url}
              />
              <View>
                <Text className="font-body text-sm text-night/70 dark:text-cream/70">Organisé par</Text>
                <Text className="font-strong text-base text-night dark:text-cream">
                  {activity.creator_first_name} {activity.creator_last_name}
                </Text>
              </View>
            </Pressable>
          ) : null}

          {activity.description ? <Text className="font-body text-base text-night dark:text-cream">{activity.description}</Text> : null}

          <ParticipantsRow activity={activity} />

          <Notice>{error}</Notice>
          <Notice tone="info">{info}</Notice>

          {open && !activity.my_status ? (
            <View className="gap-2">
              <Button
                label={full ? "Rejoindre la liste d'attente" : 'Je participe'}
                loading={join.isPending}
                onPress={() =>
                  run(join, (status) =>
                    setInfo(status === 'waitlisted' ? "Tu es sur liste d'attente. On te prévient dès qu'une place se libère." : "C'est noté, tu es inscrit !"),
                  )
                }
              />
              {/* §12 : venir seul n'est pas bizarre. */}
              <Text className="text-center font-body text-sm text-night/70 dark:text-cream/70">Beaucoup viennent seuls, c&apos;est fait pour ça 🙂</Text>
            </View>
          ) : null}

          {/* F-ACT-10 : pointage, de 30 min avant le début à 2 h après la fin. */}
          {checkinOpen && canValidate ? (
            <Button label="Valider les présences" onPress={() => router.push(`/activity/${activity.id}/checkin`)} />
          ) : null}
          {checkinOpen && activity.my_status === 'registered' && !isOrganizer ? (
            <Button label="Scanner le QR de présence" onPress={() => router.push('/scan')} />
          ) : null}

          {/* F-CHAT-01 : la discussion de groupe est ouverte aux inscrits. */}
          {conversationId ? <Button label="Discussion du groupe" onPress={() => router.push(`/conversation/${conversationId}`)} /> : null}

          {activity.my_status === 'registered' && activity.status === 'published' ? (
            <Button label="Ajouter à mon calendrier" variant="secondary" onPress={() => addToCalendar(activity).catch(() => setError("Impossible d'ouvrir ton calendrier."))} />
          ) : null}

          {open && activity.my_status && !isOrganizer ? (
            <Button
              label={activity.my_status === 'waitlisted' ? "Quitter la liste d'attente" : 'Me désinscrire'}
              variant="ghost"
              loading={leave.isPending}
              onPress={() => run(leave)}
            />
          ) : null}

          {isOrganizer && activity.status === 'published' && new Date(activity.ends_at).getTime() > now ? (
            <View className="gap-3">
              <Button label="Modifier" variant="secondary" onPress={() => router.push(`/activity/${activity.id}/edit`)} />
              <Button label="Annuler l'activité" variant="danger" loading={cancel.isPending} onPress={confirmCancel} />
            </View>
          ) : null}

          {!isOrganizer ? (
            <Button label="Signaler cette activité" variant="ghost" onPress={() => router.push(`/report?type=activity&id=${activity.id}`)} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
