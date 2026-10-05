import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityForm } from '@/components/activity-form';

export default function CreateScreen() {
  // Changer la clé remet le formulaire à zéro après une publication.
  const [formKey, setFormKey] = useState(0);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream dark:bg-ink">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-6 px-5 pb-10 pt-4">
          <Text accessibilityRole="header" className="font-display text-3xl text-night dark:text-cream">
            Nouvelle activité
          </Text>
          <ActivityForm
            key={formKey}
            submitLabel="Publier"
            onSaved={(id) => {
              setFormKey((key) => key + 1);
              router.push(`/activity/${id}`);
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
