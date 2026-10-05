import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CATEGORIES, type CategoryCode } from '@union/shared';

import { Cover } from '@/components/activity-card';
import { DateTimeField } from '@/components/date-time-field';
import { Button, Checkbox, Chip, ChipGroup, FieldLabel, Notice, TextField } from '@/components/ui';
import { type Activity, type ActivityInput, useSaveActivity } from '@/lib/activities';
import { friendlyError } from '@/lib/errors';
import { onPlacePicked, type Place } from '@/lib/geocode';
import { useSession } from '@/lib/session';
import { isOwnError, pickAndUpload, removeFile } from '@/lib/storage';

const HOUR = 3_600_000;

/** Demain à 18 h : un point de départ plausible pour une activité étudiante. */
function defaultStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 18, 0);
}

type Props = { activity?: Activity; submitLabel: string; onSaved: (id: string) => void };

/** Formulaire de création et de modification d'une activité (F-ACT-01 à 05, P3). */
export function ActivityForm({ activity, submitLabel, onSaved }: Props) {
  const { profile } = useSession();
  const save = useSaveActivity(activity?.id);

  const [title, setTitle] = useState(activity?.title ?? '');
  const [category, setCategory] = useState<CategoryCode | null>(activity?.category ?? null);
  const [startsAt, setStartsAt] = useState(activity ? new Date(activity.starts_at) : defaultStart);
  // null = fin par défaut, 2 h après le début.
  const [endsAt, setEndsAt] = useState<Date | null>(activity ? new Date(activity.ends_at) : null);
  const [place, setPlace] = useState<Place | null>(
    activity ? { name: activity.location_name, address: activity.address ?? '', lat: activity.lat, lng: activity.lng } : null,
  );
  const [description, setDescription] = useState(activity?.description ?? '');
  const [maxParticipants, setMaxParticipants] = useState(activity?.max_participants?.toString() ?? '');
  const [coverUrl, setCoverUrl] = useState(activity?.cover_url ?? null);
  const [isOfficial, setIsOfficial] = useState(activity?.is_official ?? false);
  const [error, setError] = useState('');
  const [coverBusy, setCoverBusy] = useState(false);

  useEffect(() => onPlacePicked(setPlace), []);

  if (!profile) return null;
  const canBeOfficial = profile.role === 'ambassador' || profile.role === 'school_admin';

  const changeStart = (date: Date) => {
    // La fin suit le début pour garder la même durée.
    if (endsAt) setEndsAt(new Date(endsAt.getTime() + date.getTime() - startsAt.getTime()));
    setStartsAt(date);
  };

  const pickCover = async () => {
    setError('');
    setCoverBusy(true);
    try {
      const path = await pickAndUpload('covers', `${profile.school_id}/${profile.id}`, [16, 9]);
      if (path) {
        // On ne supprime que les couvertures jamais enregistrées ; celle de l'activité existante reste
        // tant que la modification n'est pas validée.
        if (coverUrl && coverUrl !== activity?.cover_url) await removeFile('covers', coverUrl);
        setCoverUrl(path);
      }
    } catch (e) {
      setError(isOwnError(e) ? e.message : friendlyError(e));
    } finally {
      setCoverBusy(false);
    }
  };

  const submit = async () => {
    const places = maxParticipants.trim() === '' ? null : Number(maxParticipants);
    if (title.trim().length < 5) return setError('Donne un titre un peu plus parlant (5 caractères minimum).');
    if (!category) return setError('Il manque juste la catégorie 😉');
    if (!place) return setError('Il manque juste le lieu 😉');
    if (endsAt && endsAt <= startsAt) return setError('La fin doit être après le début.');
    if (places !== null && (!Number.isInteger(places) || places < 2 || places > 500)) {
      return setError('Le nombre de places doit être entre 2 et 500 (ou vide pour illimité).');
    }
    setError('');

    const input: ActivityInput = {
      title: title.trim(),
      category,
      starts_at: startsAt.toISOString(),
      ends_at: (endsAt ?? new Date(startsAt.getTime() + 2 * HOUR)).toISOString(),
      location_name: place.name.trim() || place.address,
      address: place.address || null,
      lat: place.lat,
      lng: place.lng,
      description: description.trim() || null,
      max_participants: places,
      cover_url: coverUrl,
      is_official: canBeOfficial && isOfficial,
    };
    try {
      const id = await save.mutateAsync(input);
      if (activity?.cover_url && activity.cover_url !== coverUrl) await removeFile('covers', activity.cover_url);
      onSaved(id);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const now = new Date();
  const sixMonths = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

  return (
    <View className="gap-4">
      <TextField label="Titre" value={title} onChangeText={setTitle} placeholder="Foot à 5, sortie ciné, session révisions…" maxLength={80} />

      <View className="gap-1.5">
        <FieldLabel>Catégorie</FieldLabel>
        <ChipGroup>
          {CATEGORIES.map((c) => (
            <Chip key={c.code} label={`${c.emoji} ${c.label}`} selected={category === c.code} onPress={() => setCategory(c.code)} />
          ))}
        </ChipGroup>
      </View>

      <DateTimeField label="Début" value={startsAt} onChange={changeStart} minimumDate={now} maximumDate={sixMonths} />
      {endsAt ? (
        <DateTimeField label="Fin" value={endsAt} onChange={setEndsAt} minimumDate={startsAt} />
      ) : (
        <Button label="Préciser l'heure de fin (2 h par défaut)" variant="ghost" onPress={() => setEndsAt(new Date(startsAt.getTime() + 2 * HOUR))} />
      )}

      <View className="gap-1.5">
        <FieldLabel>Lieu</FieldLabel>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/pick-location')}
          className="min-h-12 justify-center rounded-2xl border border-night/15 bg-white px-4 py-2 dark:border-cream/20 dark:bg-night">
          {place ? (
            <>
              <Text className="font-semi text-base text-night dark:text-cream">{place.name}</Text>
              {place.address ? <Text className="font-body text-sm text-night/70 dark:text-cream/70">{place.address}</Text> : null}
            </>
          ) : (
            <Text className="font-body text-base text-[#8A93A6]">Chercher une adresse ou pointer sur la carte</Text>
          )}
        </Pressable>
      </View>

      <TextField
        label={`Description (facultatif, ${description.length}/1000)`}
        value={description}
        onChangeText={setDescription}
        placeholder="Niveau, matériel à prévoir, point de rendez-vous…"
        maxLength={1000}
        multiline
      />

      <TextField
        label="Nombre de places (vide = illimité)"
        value={maxParticipants}
        onChangeText={(text) => setMaxParticipants(text.replace(/\D/g, ''))}
        placeholder="Illimité"
        keyboardType="number-pad"
        maxLength={3}
      />

      <View className="gap-2">
        <FieldLabel>Photo de couverture (facultatif)</FieldLabel>
        {coverUrl ? (
          <View className="overflow-hidden rounded-2xl">
            <Cover activity={{ cover_url: coverUrl, category: category ?? 'other' }} height={140} />
          </View>
        ) : null}
        <Button label={coverUrl ? 'Changer la photo' : 'Ajouter une photo'} variant="secondary" loading={coverBusy} onPress={pickCover} />
      </View>

      {canBeOfficial ? (
        <Checkbox checked={isOfficial} onChange={setIsOfficial}>
          Activité officielle (école, BDE) : badge ⭐ et mise en avant en haut du fil
        </Checkbox>
      ) : null}

      <Notice>{error}</Notice>
      <Button label={submitLabel} loading={save.isPending} onPress={submit} />
    </View>
  );
}
