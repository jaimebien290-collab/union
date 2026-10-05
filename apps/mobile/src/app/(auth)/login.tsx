import { router } from 'expo-router';
import { useState } from 'react';

import { Button, FormScreen, Notice, TextField } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { useSignupDraft } from '@/lib/signup-draft';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const { notice, setNotice, loadProfile } = useSession();
  const { update } = useSignupDraft();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return setError('Il manque ton email ou ton mot de passe 😉');
    setError('');
    setNotice(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      // Compte complet : la redirection vers l'app est automatique. Sinon on reprend l'inscription.
      if (!(await loadProfile(data.user.id))) router.replace('/infos');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const forgot = () => {
    update({ mode: 'reset', email: email.trim().toLowerCase() });
    router.push('/email');
  };

  return (
    <FormScreen
      title="Content de te revoir"
      footer={
        <>
          <Button label="Me connecter" loading={loading} onPress={submit} />
          <Button label="Mot de passe oublié ?" variant="ghost" onPress={forgot} />
        </>
      }>
      <TextField
        label="Email étudiant"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
      />
      <TextField
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Notice>{error}</Notice>
      <Notice tone="info">{notice}</Notice>
    </FormScreen>
  );
}
