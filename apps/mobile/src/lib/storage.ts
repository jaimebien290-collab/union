import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

const MAX_BYTES = 5 * 1024 * 1024; // F-PROF-01, même limite pour les couvertures

export type Bucket = 'avatars' | 'covers';

/** Les buckets sont privés : on affiche les images via une URL signée d'une heure. */
export function useSignedUrl(bucket: Bucket, path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-url', bucket, path],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  }).data;
}

export async function removeFile(bucket: Bucket, path: string | null | undefined) {
  if (path) await supabase.storage.from(bucket).remove([path]);
}

/**
 * Ouvre la galerie avec recadrage et envoie l'image dans `folder`.
 * Renvoie le chemin du fichier, ou null si l'utilisateur a annulé.
 */
export async function pickAndUpload(bucket: Bucket, folder: string, aspect: [number, number]): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.7 });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const body = await (await fetch(asset.uri)).arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    throw new Error('Cette photo est trop lourde (5 Mo max). Essaie avec une autre.');
  }

  const contentType = asset.mimeType ?? 'image/jpeg';
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folder}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType });
  if (error) throw error;
  return path;
}

/** Message à afficher pour une erreur venant de pickAndUpload (la nôtre) ou de Supabase. */
export const isOwnError = (e: unknown): e is Error => e instanceof Error && !('code' in e) && !('status' in e);
