import '@/global.css';

import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { colors } from '@union/shared';

import { SessionProvider } from '@/lib/session';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn, enabled: !__DEV__ });
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const lightTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.coral, background: colors.cream, card: colors.cream, text: colors.night },
};
const darkTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: colors.coral, background: colors.ink, card: colors.ink, text: colors.cream },
};

function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ThemeProvider value={scheme === 'dark' ? darkTheme : lightTheme}>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

export default sentryDsn ? Sentry.wrap(RootLayout) : RootLayout;
