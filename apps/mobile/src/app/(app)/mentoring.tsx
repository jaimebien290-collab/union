import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { colors } from '@union/shared';

import { ActivityCard } from '@/components/activity-card';
import { Avatar, Button, Card, Checkbox, Chip, ChipGroup, FormScreen, Notice } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { openDirectConversation } from '@/lib/chat';
import { friendlyError } from '@/lib/errors';
import {
  type Mentorship,
  type MentoringAction,
  useMentoringAction,
  useMentoringEnabled,
  useMentorships,
  usePartnerActivities,
} from '@/lib/mentoring';
import { useSession } from '@/lib/session';

function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="mt-2 font-strong text-lg text-night dark:text-cream">
      {children}
    </Text>
  );
}

/** Un binôme actif : la personne, un accès direct à la conversation, ses prochaines activités (F-MENT-08). */
function ActivePair({ mentorship, role, onEnd }: { mentorship: Mentorship; role: 'parrain' | 'filleul'; onEnd: () => void }) {
  const partner = mentorship.partner;
  const activities = usePartnerActivities(partner?.id).data ?? [];
  const [busy, setBusy] = useState(false);

  const write = async () => {
    if (!partner) return;
    setBusy(true);
    try {
      router.push(`/conversation/${await openDirectConversation(partner.id)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <Avatar firstName={partner?.first_name ?? '?'} lastName={partner?.last_name ?? ''} path={partner?.avatar_url} size={52} />
        <View className="flex-1">
          <Text className="font-body text-sm text-night/70 dark:text-cream/70">Ton {role}</Text>
          <Text className="font-strong text-lg text-night dark:text-cream">
            {partner ? `${partner.first_name} ${partner.last_name}` : 'Profil indisponible'}
          </Text>
          {partner?.program ? <Text className="font-body text-sm text-night/70 dark:text-cream/70">{partner.program}</Text> : null}
        </View>
      </View>
      <View className="mt-3 gap-2">
        {partner ? <Button label="Lui écrire" loading={busy} onPress={write} /> : null}
        {activities.length ? (
          <>
            <Text className="mt-1 font-semi text-sm text-night dark:text-cream">{partner?.first_name} y va bientôt, tu viens ?</Text>
            {activities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </>
        ) : null}
        <Button label="Mettre fin au parrainage" variant="ghost" onPress={onEnd} />
      </View>
    </Card>
  );
}

export default function MentoringScreen() {
  const { profile } = useSession();
  const enabled = useMentoringEnabled();
  const mentorships = useMentorships();
  const action = useMentoringAction();
  const [error, setError] = useState('');
  const [capacity, setCapacity] = useState(profile?.mentor_capacity || 1);
  const [charter, setCharter] = useState(false);

  if (!profile) return null;

  const run = async (next: MentoringAction) => {
    setError('');
    try {
      await action.mutateAsync(next);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  // F-MENT-07 : sans justification, mais avec une confirmation.
  const confirmEnd = (id: string) =>
    Alert.alert('Mettre fin au parrainage ?', "L'autre personne sera prévenue. Votre conversation reste disponible.", [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Mettre fin', style: 'destructive', onPress: () => run({ name: 'end_mentorship', id }) },
    ]);

  const mine = mentorships.data?.asMentee ?? null;
  const proposals = (mentorships.data?.asMentor ?? []).filter((m) => m.status === 'proposed');
  const mentees = (mentorships.data?.asMentor ?? []).filter((m) => m.status === 'active');
  const canMentor = (profile.study_year ?? 1) >= 2;

  if (!enabled && !mentorships.isPending) {
    return (
      <FormScreen title="Parrainage">
        <Notice tone="info">Le parrainage n&apos;est pas activé dans ton école.</Notice>
      </FormScreen>
    );
  }

  return (
    <FormScreen
      title="Parrainage"
      subtitle="Un étudiant plus ancien pour t'aider à démarrer : les bons plans, les activités, les réponses aux questions qu'on n'ose pas poser.">
      <Notice>{error}</Notice>
      {mentorships.isPending ? <ActivityIndicator color={colors.coral} /> : null}

      {/* Côté filleul (F-MENT-03) */}
      <SectionTitle>Mon parrain</SectionTitle>
      {mine?.status === 'active' ? (
        <ActivePair mentorship={mine} role="parrain" onEnd={() => confirmEnd(mine.id)} />
      ) : mine ? (
        <Card>
          <Text className="font-semi text-base text-night dark:text-cream">
            {mine.status === 'proposed'
              ? 'On a proposé ta demande à un parrain. Il a 72 h pour répondre, on te prévient.'
              : "On te trouve un parrain dès qu'un volontaire est dispo."}
          </Text>
          <View className="mt-3">
            <Button label="Retirer ma demande" variant="ghost" loading={action.isPending} onPress={() => run({ name: 'end_mentorship', id: mine.id })} />
          </View>
        </Card>
      ) : (
        <Button label="Demander un parrain" loading={action.isPending} onPress={() => run({ name: 'request_mentor' })} />
      )}

      {/* Côté parrain (F-MENT-02, 05) */}
      {proposals.length ? <SectionTitle>Ils cherchent un parrain</SectionTitle> : null}
      {proposals.map((proposal) => (
        <Card key={proposal.id}>
          <View className="flex-row items-center gap-3">
            <Avatar firstName={proposal.partner?.first_name ?? '?'} lastName={proposal.partner?.last_name ?? ''} path={proposal.partner?.avatar_url} />
            <View className="flex-1">
              <Text className="font-strong text-base text-night dark:text-cream">
                {proposal.partner ? `${proposal.partner.first_name} ${proposal.partner.last_name}` : 'Un nouvel étudiant'}
              </Text>
              <Text className="font-body text-sm text-night/70 dark:text-cream/70">aimerait que tu sois son parrain</Text>
            </View>
          </View>
          <View className="mt-3 gap-2">
            <Button label="Accepter" disabled={action.isPending} onPress={() => run({ name: 'respond_mentorship', id: proposal.id, accept: true })} />
            <Button label="Refuser" variant="ghost" disabled={action.isPending} onPress={() => run({ name: 'respond_mentorship', id: proposal.id, accept: false })} />
          </View>
        </Card>
      ))}

      {mentees.length ? <SectionTitle>Mes filleuls</SectionTitle> : null}
      {mentees.map((mentee) => (
        <ActivePair key={mentee.id} mentorship={mentee} role="filleul" onEnd={() => confirmEnd(mentee.id)} />
      ))}

      <SectionTitle>Être parrain</SectionTitle>
      {!canMentor ? (
        <Text className="font-body text-base text-night/70 dark:text-cream/70">Tu pourras parrainer un nouveau dès ta 2e année.</Text>
      ) : profile.is_mentor ? (
        <Card>
          <Text className="font-semi text-base text-night dark:text-cream">
            Tu es parrain volontaire, pour {profile.mentor_capacity} filleul{profile.mentor_capacity > 1 ? 's' : ''} au plus. Merci 🤝
          </Text>
          <View className="mt-3">
            <Button label="Ne plus recevoir de demandes" variant="ghost" loading={action.isPending} onPress={() => run({ name: 'set_mentor_status', capacity: 0 })} />
          </View>
        </Card>
      ) : (
        <Card>
          <Text className="font-semi text-base text-night dark:text-cream">Tu te souviens de ta rentrée ? Aide un nouveau à trouver sa place.</Text>
          <Text className="mt-2 font-body text-sm text-night/70 dark:text-cream/70">Combien de filleuls au maximum ?</Text>
          <View className="mt-2">
            <ChipGroup>
              {[1, 2, 3].map((n) => (
                <Chip key={n} label={String(n)} selected={capacity === n} onPress={() => setCapacity(n)} />
              ))}
            </ChipGroup>
          </View>
          <View className="mt-3">
            <Checkbox checked={charter} onChange={setCharter}>
              Je m&apos;engage à répondre à mon filleul, à rester bienveillant et à l&apos;orienter vers l&apos;école si quelque chose m&apos;inquiète.
            </Checkbox>
          </View>
          <View className="mt-3">
            <Button label="Devenir parrain" disabled={!charter} loading={action.isPending} onPress={() => run({ name: 'set_mentor_status', capacity })} />
          </View>
        </Card>
      )}
    </FormScreen>
  );
}
