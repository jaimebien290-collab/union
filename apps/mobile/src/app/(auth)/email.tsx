import { router } from 'expo-router';
import { useState } from 'react';

import { Button, FormScreen, Notice, TextField } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { useSignupDraft } from '@/lib/signup-draft';
import { supabase } from '@/lib/supabase';

export default function EmailScreen() {
  const { draft, update } = useSignupDraft();
  const reset = draft.mode === 'reset';
  const [email, setEmail] = useState(draft.email);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Cette adresse n'a pas l'air complète 😉");
      return;
    }
    setError('');
    setLoading(true);
    try {
      // F-AUTH-01 : seules les écoles partenaires passent.
      const school = await supabase.rpc('check_school_domain', { p_email: value });
      if (school.error) throw school.error;
      if (school.data.length === 0) {
        setError("Ton école n'est pas encore sur UNION. Parle-en à ton BDE !");
        return;
      }
      const otp = await supabase.auth.signInWithOtp({ email: value, options: { shouldCreateUser: !reset } });
      if (otp.error) throw otp.error;
      update({ email: value });
      router.push('/code');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen
      title={reset ? 'Mot de passe oublié ?' : "C'est quoi ton email étudiant ?"}
      subtitle={
        reset
          ? 'Donne ton email étudiant, on t’envoie un code pour en choisir un nouveau.'
          : "Celui de ton école. On t'envoie un code pour vérifier que c'est bien toi."
      }
      footer={<Button label="Recevoir mon code" loading={loading} onPress={submit} />}>
      <TextField
        label="Email étudiant"
        value={email}
        onChangeText={setEmail}
        placeholder="prenom.nom@ecole.fr"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
        autoFocus
      />
      <Notice>{error}</Notice>
    </FormScreen>
  );
}
