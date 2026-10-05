import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MIN_AGE } from '@union/shared';

import { ProgramField, StudyYearField } from '@/components/profile-fields';
import { Button, Checkbox, FieldLabel, FormScreen, Notice, TextField } from '@/components/ui';
import { useMySchool, useSession } from '@/lib/session';
import { useSignupDraft } from '@/lib/signup-draft';
import { supabase } from '@/lib/supabase';

/** Renvoie AAAA-MM-JJ si la date existe vraiment, sinon null. */
function toIsoDate(day: string, month: string, year: string): string | null {
  const [d, m, y] = [Number(day), Number(month), Number(year)];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (year.length !== 4 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || date > new Date()) return null;
  return date.toISOString().slice(0, 10);
}

function isAdult(isoDate: string) {
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - MIN_AGE);
  return isoDate <= limit.toISOString().slice(0, 10);
}

export default function InfosScreen() {
  const { draft, update } = useSignupDraft();
  const { signOut } = useSession();
  const school = useMySchool().data;
  const programs = school?.programs ?? [];

  const [firstName, setFirstName] = useState(draft.firstName);
  const [lastName, setLastName] = useState(draft.lastName);
  const [day, setDay] = useState(draft.birthDate.slice(8, 10));
  const [month, setMonth] = useState(draft.birthDate.slice(5, 7));
  const [year, setYear] = useState(draft.birthDate.slice(0, 4));
  const [program, setProgram] = useState(draft.program);
  const [studyYear, setStudyYear] = useState(draft.studyYear);
  const [isNewcomer, setIsNewcomer] = useState(draft.isNewcomer);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const birthDate = toIsoDate(day, month, year);
    if (!firstName.trim() || !lastName.trim()) return setError('Il manque ton prénom ou ton nom 😉');
    if (!birthDate) return setError("Ta date de naissance n'a pas l'air bonne.");
    if (!program.trim()) return setError('Il manque juste ta formation 😉');
    if (!studyYear) return setError("Il manque juste ton année d'études 😉");
    setError('');

    // F-AUTH-04 : pas de mineurs, et on ne garde rien.
    if (!isAdult(birthDate)) {
      setLoading(true);
      await supabase.rpc('abandon_signup');
      await signOut();
      router.replace('/underage');
      return;
    }

    update({ firstName: firstName.trim(), lastName: lastName.trim(), birthDate, program: program.trim(), studyYear, isNewcomer });
    router.push('/interests');
  };

  const digits = (setter: (v: string) => void) => (text: string) => setter(text.replace(/\D/g, ''));

  return (
    <FormScreen
      back={false}
      title="Parle-nous de toi"
      subtitle={school ? `Tu rejoins ${school.name}. Ton vrai nom, c'est ce qui permet de se retrouver en vrai.` : undefined}
      footer={<Button label="Continuer" loading={loading} onPress={submit} />}>
      <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoComplete="given-name" textContentType="givenName" maxLength={50} />
      <TextField label="Nom" value={lastName} onChangeText={setLastName} autoComplete="family-name" textContentType="familyName" maxLength={50} />
      <View className="gap-1.5">
        <FieldLabel>Date de naissance</FieldLabel>
        <View className="flex-row gap-2">
          <TextField className="flex-1" label="Jour" value={day} onChangeText={digits(setDay)} placeholder="JJ" keyboardType="number-pad" maxLength={2} />
          <TextField className="flex-1" label="Mois" value={month} onChangeText={digits(setMonth)} placeholder="MM" keyboardType="number-pad" maxLength={2} />
          <TextField className="flex-[1.4]" label="Année" value={year} onChangeText={digits(setYear)} placeholder="AAAA" keyboardType="number-pad" maxLength={4} />
        </View>
      </View>
      <ProgramField programs={programs} value={program} onChange={setProgram} />
      <StudyYearField value={studyYear} onChange={setStudyYear} />
      <Checkbox checked={isNewcomer} onChange={setIsNewcomer}>
        Je suis nouveau dans l&apos;établissement cette année
      </Checkbox>
      <Notice>{error}</Notice>
    </FormScreen>
  );
}
