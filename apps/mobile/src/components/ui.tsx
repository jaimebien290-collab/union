import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type TextInputProps,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@union/shared';

import { useAvatarUrl } from '@/lib/avatar';

/** Écran d'onglet : grand titre, contenu libre. */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream dark:bg-ink">
      <View className="flex-1 px-5 pt-4">
        <Text accessibilityRole="header" className="font-display text-3xl text-night dark:text-cream">
          {title}
        </Text>
        {children}
      </View>
    </SafeAreaView>
  );
}

type FormScreenProps = {
  title: string;
  subtitle?: string;
  /** Masquer le retour sur les étapes qu'on ne doit pas quitter en arrière. */
  back?: boolean;
  children?: ReactNode;
  /** Boutons collés en bas de l'écran. */
  footer?: ReactNode;
};

/** Écran de formulaire ou de lecture : retour, titre, contenu défilant, actions en bas. */
export function FormScreen({ title, subtitle, back = true, children, footer }: FormScreenProps) {
  const dark = useColorScheme() === 'dark';
  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-ink">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-8 pt-2">
          <View className="h-11 justify-center">
            {back && router.canGoBack() ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={12} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={28} color={dark ? colors.cream : colors.night} />
              </Pressable>
            ) : null}
          </View>
          <Text accessibilityRole="header" className="font-display text-3xl text-night dark:text-cream">
            {title}
          </Text>
          {subtitle ? <Text className="mt-2 font-body text-base text-night/70 dark:text-cream/70">{subtitle}</Text> : null}
          <View className="mt-6 gap-4">{children}</View>
        </ScrollView>
        {footer ? <View className="gap-3 px-5 pb-4 pt-2">{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

const buttonStyles = {
  primary: { box: 'bg-coral', text: 'text-white' },
  secondary: { box: 'border border-night/15 bg-white dark:border-cream/20 dark:bg-night', text: 'text-night dark:text-cream' },
  ghost: { box: '', text: 'text-coral' },
  danger: { box: 'border border-coral', text: 'text-coral' },
};

export function Button({ label, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const style = buttonStyles[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className={`min-h-12 flex-row items-center justify-center rounded-2xl px-6 active:opacity-80 ${style.box} ${
        disabled ? 'opacity-40' : ''
      }`}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.coral} />
      ) : (
        <Text className={`font-strong text-base ${style.text}`}>{label}</Text>
      )}
    </Pressable>
  );
}

export function TextField({ label, error, className, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View className={`gap-1.5 ${className ?? ''}`}>
      <Text className="font-semi text-sm text-night dark:text-cream">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8A93A6"
        className={`min-h-12 rounded-2xl border bg-white px-4 font-body text-base text-night dark:bg-night dark:text-cream ${
          error ? 'border-coral' : 'border-night/15 dark:border-cream/20'
        }`}
        {...props}
      />
      {error ? <Text className="font-body text-sm text-coral">{error}</Text> : null}
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text className="font-semi text-sm text-night dark:text-cream">{children}</Text>;
}

/** Message d'erreur ou d'information au-dessus d'un formulaire. */
export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' }) {
  if (!children) return null;
  return (
    <View accessibilityLiveRegion="polite" className={`rounded-2xl px-4 py-3 ${tone === 'error' ? 'bg-coral/15' : 'bg-sun/25'}`}>
      <Text className="font-semi text-sm text-night dark:text-cream">{children}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected } : undefined}
      disabled={!onPress}
      onPress={onPress}
      className={`min-h-10 justify-center rounded-full border px-4 ${
        selected ? 'border-coral bg-coral' : 'border-night/15 bg-white dark:border-cream/20 dark:bg-night'
      }`}>
      <Text className={`font-semi text-sm ${selected ? 'text-white' : 'text-night dark:text-cream'}`}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      className="flex-row items-start gap-3">
      <View
        className={`mt-0.5 h-6 w-6 items-center justify-center rounded-lg border ${
          checked ? 'border-coral bg-coral' : 'border-night/30 bg-white dark:border-cream/30 dark:bg-night'
        }`}>
        {checked ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
      </View>
      <Text className="flex-1 font-body text-base text-night dark:text-cream">{children}</Text>
    </Pressable>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View className="rounded-3xl bg-white p-4 shadow-sm dark:bg-night">{children}</View>;
}

const avatarColors = Object.values(colors.category);

type AvatarProps = { firstName: string; lastName: string; path?: string | null; size?: number };

// F-PROF-03 : sans photo, initiales sur une couleur stable pour une même personne.
export function Avatar({ firstName, lastName, path, size = 44 }: AvatarProps) {
  const url = useAvatarUrl(path);
  const name = `${firstName} ${lastName}`;
  if (url) {
    return (
      <Image
        accessibilityLabel={name}
        // La signature de l'URL change à chaque heure : le chemin sert de clé de cache.
        source={{ uri: url, cacheKey: path ?? undefined }}
        cachePolicy="memory-disk"
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  const hash = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (
    <View
      accessibilityLabel={name}
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: avatarColors[hash % avatarColors.length] }}>
      <Text className="font-strong text-white" style={{ fontSize: size * 0.4 }}>
        {(firstName[0] ?? '').toUpperCase()}
        {(lastName[0] ?? '').toUpperCase()}
      </Text>
    </View>
  );
}

export function EmptyState({ emoji, message, action }: { emoji: string; message: string; action?: ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6 pb-16">
      <Text className="text-5xl">{emoji}</Text>
      <Text className="text-center font-semi text-lg text-night/80 dark:text-cream/80">{message}</Text>
      {action}
    </View>
  );
}

export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-cream dark:bg-ink">
      <ActivityIndicator size="large" color={colors.coral} />
    </View>
  );
}
