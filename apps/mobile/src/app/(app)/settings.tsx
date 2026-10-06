import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Share, Text } from 'react-native';

import { SUPPORT_EMAIL } from '@union/shared';

import { Button, FormScreen, Notice } from '@/components/ui';
import { removeAvatar } from '@/lib/avatar';
import { Alert } from '@/lib/alert';
import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { profile, signOut, setNotice } = useSession();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);

  if (!profile) return null;

  // F-AUTH-10 : mes données, via la feuille de partage du téléphone.
  const exportData = async () => {
    setError('');
    setBusy('export');
    try {
      const { data, error } = await supabase.rpc('export_my_data');
      if (error) throw error;
      await Share.share({ title: 'Mes données UNION', message: JSON.stringify(data, null, 2) });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  // F-AUTH-08 / NF-STORE-01 : suppression du compte depuis l'app.
  const deleteAccount = async () => {
    setError('');
    setBusy('delete');
    try {
      await removeAvatar(profile.avatar_url);
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      setNotice('Ton compte a été supprimé. À bientôt 👋');
      await signOut();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Supprimer ton compte ?',
      "Ton profil et ta photo seront effacés, et tu ne pourras plus te connecter. C'est définitif.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer mon compte', style: 'destructive', onPress: deleteAccount },
      ],
    );

  return (
    <FormScreen title="Réglages">
      <Notice>{error}</Notice>
      <Button label="Personnes bloquées" variant="secondary" onPress={() => router.push('/blocked')} />
      <Button label="CGU, confidentialité et charte" variant="secondary" onPress={() => router.push('/legal')} />
      <Button label="Contacter l'assistance" variant="secondary" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
      <Button label="Exporter mes données" variant="secondary" loading={busy === 'export'} onPress={exportData} />
      <Button label="Me déconnecter" variant="secondary" onPress={signOut} />
      <Button label="Supprimer mon compte" variant="danger" loading={busy === 'delete'} onPress={confirmDelete} />
      <Text className="text-center font-body text-xs text-night/50 dark:text-cream/50">Connecté en tant que {profile.email}</Text>
    </FormScreen>
  );
}
