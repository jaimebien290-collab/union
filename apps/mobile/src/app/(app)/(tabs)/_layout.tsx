import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { type ColorValue, useColorScheme, View } from 'react-native';

import { colors } from '@union/shared';

import { useUnreadTotal } from '@/lib/chat';

type IconName = keyof typeof Ionicons.glyphMap;

const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };

function CreateIcon() {
  return (
    <View className="-mt-4 h-14 w-14 items-center justify-center rounded-full bg-coral shadow-md">
      <Ionicons name="add" color="#fff" size={32} />
    </View>
  );
}

export default function TabsLayout() {
  const dark = useColorScheme() === 'dark';
  const unread = useUnreadTotal();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: dark ? '#8A93A6' : '#6B7489',
        tabBarLabelStyle: { fontFamily: 'Nunito_600SemiBold', fontSize: 11 },
        tabBarStyle: {
          backgroundColor: dark ? colors.ink : '#fff',
          borderTopColor: dark ? '#232B45' : '#F1E7DF',
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen
        name="create"
        options={{ title: 'Créer', tabBarLabel: () => null, tabBarIcon: CreateIcon, tabBarAccessibilityLabel: 'Créer une activité' }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: icon('chatbubbles'),
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.coral, color: '#fff' },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
