import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORIES, colors, type CategoryCode } from '@union/shared';

import { ActivityCard } from '@/components/activity-card';
import { ActivityMap } from '@/components/activity-map';
import { Button, Chip, EmptyState, LoadingScreen } from '@/components/ui';
import { useUnreadNotificationCount } from '@/lib/chat';
import { type Filters, hasFilters, NO_FILTERS, type Period, useFeed, useMapActivities, useOfficialThisWeek } from '@/lib/activities';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'weekend', label: 'Ce week-end' },
  { value: 'month', label: 'Ce mois' },
];

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
  const toggleCategory = (code: CategoryCode) =>
    onChange({
      ...filters,
      categories: filters.categories.includes(code) ? filters.categories.filter((c) => c !== code) : [...filters.categories, code],
    });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-5" className="grow-0">
      {PERIODS.map((period) => (
        <Chip
          key={period.value}
          label={period.label}
          selected={filters.period === period.value}
          onPress={() => onChange({ ...filters, period: filters.period === period.value ? 'all' : period.value })}
        />
      ))}
      <Chip label="Places dispo" selected={filters.availableOnly} onPress={() => onChange({ ...filters, availableOnly: !filters.availableOnly })} />
      <Chip label="⭐ Officielles" selected={filters.officialOnly} onPress={() => onChange({ ...filters, officialOnly: !filters.officialOnly })} />
      {CATEGORIES.map((category) => (
        <Chip
          key={category.code}
          label={`${category.emoji} ${category.label}`}
          selected={filters.categories.includes(category.code)}
          onPress={() => toggleCategory(category.code)}
        />
      ))}
    </ScrollView>
  );
}

function FeedList({ filters, onReset }: { filters: Filters; onReset: () => void }) {
  const feed = useFeed(filters);
  const official = useOfficialThisWeek();
  const filtered = hasFilters(filters);
  const activities = feed.data?.pages.flat() ?? [];
  const officialWeek = filtered ? [] : (official.data ?? []);

  if (feed.isPending) return <LoadingScreen />;
  if (feed.isError) {
    return <EmptyState emoji="📡" message="Impossible de charger les activités." action={<Button label="Réessayer" onPress={() => feed.refetch()} />} />;
  }
  if (activities.length === 0) {
    return filtered ? (
      <EmptyState emoji="🔎" message="Aucune activité ne correspond à ta recherche." action={<Button label="Tout afficher" variant="secondary" onPress={onReset} />} />
    ) : (
      // F-DISC-07
      <EmptyState
        emoji="⚽"
        message="Rien de prévu pour l'instant… Et si c'était toi qui lançais le premier foot ?"
        action={<Button label="Créer une activité" onPress={() => router.push('/create')} />}
      />
    );
  }

  return (
    <FlatList
      data={activities}
      keyExtractor={(activity) => activity.id}
      renderItem={({ item }) => <ActivityCard activity={item} />}
      contentContainerClassName="gap-4 px-5 pb-8"
      showsVerticalScrollIndicator={false}
      onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={feed.isRefetching && !feed.isFetchingNextPage}
          onRefresh={() => {
            feed.refetch();
            official.refetch();
          }}
          tintColor={colors.coral}
        />
      }
      ListHeaderComponent={
        officialWeek.length ? (
          <View className="gap-3">
            <Text accessibilityRole="header" className="font-strong text-lg text-night dark:text-cream">
              ⭐ Officiel cette semaine
            </Text>
            {/* Marges négatives : le carrousel va d'un bord à l'autre de l'écran. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-3 px-5">
              {officialWeek.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} compact />
              ))}
            </ScrollView>
            <Text accessibilityRole="header" className="mt-2 font-strong text-lg text-night dark:text-cream">
              Toutes les activités
            </Text>
          </View>
        ) : null
      }
    />
  );
}

function MapPane({ filters }: { filters: Filters }) {
  const { data, isPending } = useMapActivities(filters);
  if (isPending) return <LoadingScreen />;
  return (
    <View className="flex-1 px-5 pb-4">
      <ActivityMap activities={data ?? []} />
    </View>
  );
}

export default function HomeScreen() {
  const dark = useColorScheme() === 'dark';
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [searchText, setSearchText] = useState('');
  const unreadNotifications = useUnreadNotificationCount();

  // La recherche part 300 ms après la dernière frappe.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.search === searchText ? current : { ...current, search: searchText })), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const reset = () => {
    setSearchText('');
    setFilters(NO_FILTERS);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream dark:bg-ink">
      <View className="flex-row items-center justify-between px-5 pt-4">
        <Text accessibilityRole="header" className="font-display text-3xl text-night dark:text-cream">
          À venir
        </Text>
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unreadNotifications ? `Notifications, ${unreadNotifications} nouvelles` : 'Notifications'}
            hitSlop={8}
            onPress={() => router.push('/notifications')}
            className="h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-night">
            <Ionicons name="notifications" size={20} color={colors.coral} />
            {unreadNotifications ? <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-sun" /> : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={view === 'list' ? 'Afficher la carte' : 'Afficher la liste'}
            hitSlop={8}
            onPress={() => setView(view === 'list' ? 'map' : 'list')}
            className="flex-row items-center gap-1.5 rounded-full bg-white px-4 py-2 dark:bg-night">
            <Ionicons name={view === 'list' ? 'map' : 'list'} size={18} color={colors.coral} />
            <Text className="font-strong text-sm text-coral">{view === 'list' ? 'Carte' : 'Liste'}</Text>
          </Pressable>
        </View>
      </View>

      <View className="mx-5 mt-4 flex-row items-center gap-2 rounded-2xl border border-night/15 bg-white px-4 dark:border-cream/20 dark:bg-night">
        <Ionicons name="search" size={18} color="#8A93A6" />
        <TextInput
          accessibilityLabel="Rechercher une activité"
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Foot, escalade, bibliothèque…"
          placeholderTextColor="#8A93A6"
          returnKeyType="search"
          clearButtonMode="while-editing"
          className="min-h-12 flex-1 font-body text-base text-night dark:text-cream"
          style={{ color: dark ? colors.cream : colors.night }}
        />
      </View>

      <View className="py-3">
        <FilterBar filters={filters} onChange={setFilters} />
      </View>

      {view === 'list' ? <FeedList filters={filters} onReset={reset} /> : <MapPane filters={filters} />}
    </SafeAreaView>
  );
}
