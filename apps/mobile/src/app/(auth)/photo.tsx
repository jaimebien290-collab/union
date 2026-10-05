import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, Button, FormScreen, Notice } from '@/components/ui';
import { pickAndUploadAvatar } from '@/lib/avatar';
import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';

export default function PhotoScreen() {
  const { profile, loadProfile, setInFlow } = useSession();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!profile) return null;

  const pick = async () => {
    setError('');
    setLoading(true);
    try {
      if (await pickAndUploadAvatar(profile.id, profile.avatar_url)) await loadProfile(profile.id);
    } catch (e) {
      setError(e instanceof Error && !('code' in e) ? e.message : friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen
      back={false}
      title={`Bienvenue ${profile.first_name} !`}
      subtitle="Une photo, ça aide à te reconnaître le jour de l'activité. C'est facultatif, tu pourras en ajouter une plus tard."
      footer={
        <>
          <Button label={profile.avatar_url ? 'Changer de photo' : 'Ajouter une photo'} variant="secondary" loading={loading} onPress={pick} />
          {/* Fin du parcours : la redirection vers l'app se fait dès que inFlow repasse à faux. */}
          <Button label={profile.avatar_url ? "C'est parti" : 'Plus tard'} onPress={() => setInFlow(false)} />
        </>
      }>
      <View className="items-center py-6">
        <Avatar firstName={profile.first_name} lastName={profile.last_name} path={profile.avatar_url} size={140} />
      </View>
      <Notice>{error}</Notice>
    </FormScreen>
  );
}
