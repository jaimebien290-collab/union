import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { InterestsField, MAX_INTERESTS, ProgramField, StudyYearField } from '@/components/profile-fields';
import { Avatar, Button, FieldLabel, FormScreen, Notice, TextField } from '@/components/ui';
import { pickAndUploadAvatar, removeAvatar } from '@/lib/avatar';
import { friendlyError } from '@/lib/errors';
import { useMySchool, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const BIO_MAX = 150; // F-PROF-01

// F-PROF-04 : tout est modifiable sauf l'email et l'école.
export default function EditProfileScreen() {
  const { profile, loadProfile } = useSession();
  const programs = useMySchool().data?.programs ?? [];

  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [program, setProgram] = useState(profile?.program ?? '');
  const [studyYear, setStudyYear] = useState(profile?.study_year ?? null);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [interests, setInterests] = useState(profile?.interests ?? []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  if (!profile) return null;

  const changePhoto = async (action: 'pick' | 'remove') => {
    setError('');
    setPhotoBusy(true);
    try {
      if (action === 'pick') {
        await pickAndUploadAvatar(profile.id, profile.avatar_url);
      } else {
        const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id);
        if (error) throw error;
        await removeAvatar(profile.avatar_url);
      }
      await loadProfile(profile.id);
    } catch (e) {
      setError(e instanceof Error && !('code' in e) ? e.message : friendlyError(e));
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async () => {
    if (!firstName.trim() || !lastName.trim()) return setError('Il manque ton prénom ou ton nom 😉');
    if (!program.trim()) return setError('Il manque juste ta formation 😉');
    setError('');
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          program: program.trim(),
          study_year: studyYear,
          bio: bio.trim() || null,
          interests,
        })
        .eq('id', profile.id);
      if (error) throw error;
      await loadProfile(profile.id);
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormScreen title="Mon profil" footer={<Button label="Enregistrer" loading={saving} onPress={save} />}>
      <View className="items-center gap-3">
        <Avatar firstName={firstName} lastName={lastName} path={profile.avatar_url} size={110} />
        <View className="flex-row gap-2">
          <Button
            label={profile.avatar_url ? 'Changer de photo' : 'Ajouter une photo'}
            variant="secondary"
            loading={photoBusy}
            onPress={() => changePhoto('pick')}
          />
          {profile.avatar_url ? <Button label="Retirer" variant="ghost" disabled={photoBusy} onPress={() => changePhoto('remove')} /> : null}
        </View>
      </View>
      <TextField label="Prénom" value={firstName} onChangeText={setFirstName} maxLength={50} />
      <TextField label="Nom" value={lastName} onChangeText={setLastName} maxLength={50} />
      <ProgramField programs={programs} value={program} onChange={setProgram} />
      <StudyYearField value={studyYear} onChange={setStudyYear} />
      <TextField
        label={`Bio (${bio.length}/${BIO_MAX})`}
        value={bio}
        onChangeText={setBio}
        placeholder="Deux mots sur toi : ce que tu aimes, ce que tu cherches…"
        maxLength={BIO_MAX}
        multiline
      />
      <View className="gap-1.5">
        <FieldLabel>Centres d&apos;intérêt ({MAX_INTERESTS} max)</FieldLabel>
        <InterestsField value={interests} onChange={setInterests} />
      </View>
      <TextField label="Email (non modifiable)" value={profile.email ?? ''} editable={false} />
      <Notice>{error}</Notice>
    </FormScreen>
  );
}
