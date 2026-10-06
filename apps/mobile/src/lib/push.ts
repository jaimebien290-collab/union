import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Les notifications push ne fonctionnent ni dans Expo Go ni dans le navigateur : il faut un build de
// développement ou de production. La librairie n'est donc chargée que lorsqu'elle peut servir.
export const pushSupported = Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

type Notifications = typeof import('expo-notifications');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (): Notifications => require('expo-notifications');

/** Identifiant du projet Expo (EAS), indispensable pour obtenir un jeton. Renseigné par `eas init`. */
const projectId = (): string | undefined => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

export type PushStatus = 'unsupported' | 'unconfigured' | 'undetermined' | 'denied' | 'granted';

let currentToken: string | null = null;

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported) return 'unsupported';
  if (!projectId()) return 'unconfigured';
  const { status, canAskAgain } = await load().getPermissionsAsync();
  if (status === 'granted') return 'granted';
  return canAskAgain ? 'undetermined' : 'denied';
}

/**
 * Enregistre ce téléphone pour le compte connecté. `ask` : affiche la demande d'autorisation du système
 * (à n'appeler qu'après avoir expliqué pourquoi, NF-STORE-04). Sans `ask`, ne fait rien si l'autorisation
 * n'a pas déjà été donnée.
 */
export async function registerForPush(ask: boolean): Promise<PushStatus> {
  let status = await getPushStatus();
  if (status === 'undetermined' && ask) {
    const result = await load().requestPermissionsAsync();
    status = result.status === 'granted' ? 'granted' : 'denied';
  }
  if (status !== 'granted') return status;

  const notifications = load();
  if (Platform.OS === 'android') {
    await notifications.setNotificationChannelAsync('default', { name: 'UNION', importance: notifications.AndroidImportance.DEFAULT });
  }
  const { data: token } = await notifications.getExpoPushTokenAsync({ projectId: projectId() });
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (error) throw error;
  currentToken = token;
  return 'granted';
}

/** À la déconnexion : ce téléphone ne doit plus recevoir les notifications du compte. */
export async function unregisterFromPush() {
  if (!currentToken) return;
  await supabase.rpc('unregister_push_token', { p_token: currentToken });
  currentToken = null;
}

/**
 * Affiche les notifications quand l'app est ouverte, et ouvre le bon écran quand on en touche une
 * (F-NOTIF-11). Renvoie la fonction de nettoyage.
 */
export function listenToPush(open: (url: string) => void): () => void {
  if (!pushSupported) return () => undefined;
  const notifications = load();
  notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });

  const openFrom = (response: { notification: { request: { content: { data?: Record<string, unknown> } } } } | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) open(url);
  };
  // L'app a pu être lancée en touchant une notification.
  openFrom(notifications.getLastNotificationResponse());
  const subscription = notifications.addNotificationResponseReceivedListener(openFrom);
  return () => subscription.remove();
}

// Réglages par famille (F-NOTIF-10). Les clés sont celles de private.notification_category côté serveur.
export const PUSH_CATEGORIES = [
  { key: 'reminders', label: 'Rappels de mes activités', hint: 'La veille à 18 h et une heure avant.' },
  { key: 'activities', label: 'Changements sur mes activités', hint: 'Modification, annulation, place libérée.' },
  { key: 'messages', label: 'Messages', hint: 'Messages privés et discussions de groupe.' },
  { key: 'mentoring', label: 'Parrainage', hint: 'Demande reçue, parrain trouvé.' },
  { key: 'announcements', label: 'Annonces de mon école', hint: 'Trois par semaine au maximum.' },
  { key: 'rewards', label: 'Badges et goodies', hint: 'Badge débloqué, goodie remis.' },
] as const;
