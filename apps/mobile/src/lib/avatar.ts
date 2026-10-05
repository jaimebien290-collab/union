import { pickAndUpload, removeFile, useSignedUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export const useAvatarUrl = (path: string | null | undefined) => useSignedUrl('avatars', path);

export const removeAvatar = (path: string | null) => removeFile('avatars', path);

/**
 * Ouvre la galerie (recadrage carré), envoie la photo et met à jour le profil.
 * Renvoie le nouveau chemin, ou null si l'utilisateur a annulé.
 */
export async function pickAndUploadAvatar(userId: string, previousPath: string | null): Promise<string | null> {
  const path = await pickAndUpload('avatars', userId, [1, 1]);
  if (!path) return null;

  const { error } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId);
  if (error) throw error;

  await removeAvatar(previousPath);
  return path;
}
