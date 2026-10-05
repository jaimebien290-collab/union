import { router } from 'expo-router';
import { useState } from 'react';

import { Button, FormScreen, Notice, TextField } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// F-AUTH-03 : 8 caractères minimum, dont au moins une lettre et un chiffre.
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Encore un effort : 8 caractères minimum.';
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'Il faut au moins une lettre et un chiffre.';
  return null;
}

export default function PasswordScreen() {
  const { loadProfile, setInFlow } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setLoading(true);
    try {
      // password_set permet, si l'app est fermée en cours d'inscription, de reprendre à la bonne étape.
      const { data, error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
      if (error) throw error;
      const profile = await loadProfile(data.user.id);
      if (profile) setInFlow(false); // compte déjà complet : la redirection vers l'app se fait toute seule
      else router.replace('/infos');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen
      back={false}
      title="Choisis ton mot de passe"
      subtitle="8 caractères minimum, avec au moins une lettre et un chiffre."
      footer={<Button label="Continuer" loading={loading} onPress={submit} />}>
      <TextField
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={submit}
        autoFocus
      />
      <Notice>{error}</Notice>
    </FormScreen>
  );
}
