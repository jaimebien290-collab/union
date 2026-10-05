import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';
const MAX_BYTES = 5 * 1024 * 1024; // F-PROF-01

/** Le bucket est privé : on affiche les photos via une URL signée d'une heure. */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['avatar', path],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  }).data;
}

export async function removeAvatar(path: string | null) {
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}

/**
 * Ouvre la galerie (recadrage carré), envoie la photo et met à jour le profil.
 * Renvoie le nouveau chemin, ou null si l'utilisateur a annulé.
 */
export async function pickAndUploadAvatar(userId: string, previousPath: string | null): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const body = await (await fetch(asset.uri)).arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    throw new Error('Cette photo est trop lourde (5 Mo max). Essaie avec une autre.');
  }

  const contentType = asset.mimeType ?? 'image/jpeg';
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${Date.now()}.${extension}`;

  const upload = await supabase.storage.from(BUCKET).upload(path, body, { contentType });
  if (upload.error) throw upload.error;

  const update = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId);
  if (update.error) throw update.error;

  await removeAvatar(previousPath);
  return path;
}
