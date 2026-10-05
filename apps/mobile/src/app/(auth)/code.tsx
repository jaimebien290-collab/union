import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, FormScreen, Notice, TextField } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { useSignupDraft } from '@/lib/signup-draft';
import { supabase } from '@/lib/supabase';

const RESEND_DELAY = 60; // F-AUTH-02

export default function CodeScreen() {
  const { draft } = useSignupDraft();
  const { setInFlow } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(RESEND_DELAY);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const verify = async (value: string) => {
    setError('');
    setInfo('');
    setLoading(true);
    // La vérification ouvre la session : on bloque la redirection automatique, l'étape suivante est
    // toujours le choix du mot de passe (inscription comme mot de passe oublié).
    setInFlow(true);
    const { error } = await supabase.auth.verifyOtp({ email: draft.email, token: value, type: 'email' });
    setLoading(false);
    if (error) {
      setInFlow(false);
      setError(friendlyError(error));
      return;
    }
    router.replace('/password');
  };

  const onChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !loading) verify(digits);
  };

  const resend = async () => {
    setError('');
    setWait(RESEND_DELAY);
    const { error } = await supabase.auth.signInWithOtp({
      email: draft.email,
      options: { shouldCreateUser: draft.mode !== 'reset' },
    });
    if (error) setError(friendlyError(error));
    else setInfo('Nouveau code envoyé !');
  };

  return (
    <FormScreen
      title="Entre ton code"
      subtitle={`On vient d'envoyer un code à 6 chiffres à ${draft.email}. Il est valable 10 minutes.`}
      footer={
        <>
          <Button label="Valider" loading={loading} disabled={code.length !== 6} onPress={() => verify(code)} />
          <Button
            label={wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
            variant="ghost"
            disabled={wait > 0}
            onPress={resend}
          />
        </>
      }>
      <TextField
        label="Code reçu par email"
        value={code}
        onChangeText={onChange}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
      />
      <Notice>{error}</Notice>
      <Notice tone="info">{info}</Notice>
    </FormScreen>
  );
}
