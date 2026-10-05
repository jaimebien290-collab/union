import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Chip, ChipGroup, FormScreen, Notice, TextField } from '@/components/ui';
import { REPORT_REASONS, type ReportTarget } from '@/lib/chat';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const TITLES: Record<ReportTarget, string> = {
  activity: 'Signaler cette activité',
  message: 'Signaler ce message',
  user: 'Signaler cette personne',
};

// F-MOD-01 : motif + commentaire facultatif.
export default function ReportScreen() {
  const { type, id } = useLocalSearchParams<{ type: ReportTarget; id: string }>();
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!reason) return setError('Choisis un motif 😉');
    setError('');
    setLoading(true);
    const { error } = await supabase.rpc('report_content', {
      p_target_type: type,
      p_target_id: id,
      p_reason: reason,
      p_comment: comment,
    });
    setLoading(false);
    if (error) setError(friendlyError(error));
    else setDone(true);
  };

  if (done) {
    return (
      <FormScreen
        back={false}
        title="Merci 🙏"
        subtitle="Ton signalement est transmis aux ambassadeurs et à ton école. On te prévient quand il est traité. La personne concernée ne saura pas qu'il vient de toi."
        footer={<Button label="Fermer" onPress={() => router.back()} />}
      />
    );
  }

  return (
    <FormScreen
      title={TITLES[type] ?? 'Signaler'}
      subtitle="Dis-nous ce qui ne va pas. En cas de danger immédiat, appelle le 17 ou le 112."
      footer={<Button label="Envoyer le signalement" loading={loading} onPress={submit} />}>
      <ChipGroup>
        {REPORT_REASONS.filter((r) => r.code !== 'auto_filter').map((r) => (
          <Chip key={r.code} label={r.label} selected={reason === r.code} onPress={() => setReason(r.code)} />
        ))}
      </ChipGroup>
      <TextField
        label="Précisions (facultatif)"
        value={comment}
        onChangeText={setComment}
        placeholder="Ce qui s'est passé, en quelques mots"
        maxLength={500}
        multiline
      />
      <Notice>{error}</Notice>
    </FormScreen>
  );
}
