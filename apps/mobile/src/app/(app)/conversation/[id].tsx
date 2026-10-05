import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@union/shared';

import { Button, EmptyState, LoadingScreen, Notice } from '@/components/ui';
import {
  conversationTitle,
  DELETED_USER,
  type Message,
  type Sender,
  useConversation,
  useMarkRead,
  useMessages,
  useSenders,
  useSendMessage,
  useSetMuted,
} from '@/lib/chat';
import { friendlyError } from '@/lib/errors';
import { useSession } from '@/lib/session';

const TIME = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const MAX_LENGTH = 2000; // F-CHAT-03

type BubbleProps = { message: Message; mine: boolean; sender?: Sender; showSender: boolean };

function Bubble({ message, mine, sender, showSender }: BubbleProps) {
  // F-CHAT-06 : appui long sur le message de quelqu'un d'autre pour le signaler.
  const report = () =>
    Alert.alert('Signaler ce message ?', "Il sera examiné par un ambassadeur ou par l'école.", [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Signaler', style: 'destructive', onPress: () => router.push(`/report?type=message&id=${message.id}`) },
    ]);

  return (
    <Pressable
      onLongPress={mine ? undefined : report}
      accessibilityHint={mine ? undefined : 'Appui long pour signaler'}
      className={`max-w-[82%] ${mine ? 'self-end' : 'self-start'}`}>
      {showSender && !mine ? (
        <Text className="mb-0.5 ml-3 font-semi text-xs text-night/70 dark:text-cream/70">
          {sender ? `${sender.first_name} ${sender.last_name}` : DELETED_USER}
        </Text>
      ) : null}
      <View className={`rounded-3xl px-4 py-2.5 ${mine ? 'bg-coral' : 'bg-white dark:bg-night'}`}>
        <Text className={`font-body text-base ${mine ? 'text-white' : 'text-night dark:text-cream'}`}>{message.content}</Text>
      </View>
      <Text className={`mt-0.5 font-body text-[11px] text-night/50 dark:text-cream/50 ${mine ? 'mr-3 text-right' : 'ml-3'}`}>
        {TIME.format(new Date(message.created_at))}
      </Text>
    </Pressable>
  );
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dark = useColorScheme() === 'dark';
  const { profile } = useSession();
  const conversation = useConversation(id);
  const messagesQuery = useMessages(id);
  const send = useSendMessage(id);
  const { mutate: markRead } = useMarkRead(id);
  const setMuted = useSetMuted(id);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const messages = messagesQuery.data?.pages.flat() ?? [];
  const senders = useSenders(messages.map((message) => message.sender_id));

  // Tout ce qui est affiché est lu : on avance le repère jusqu'au message le plus récent.
  const newest = messages[0];
  const newestAt = newest && newest.sender_id !== profile?.id ? newest.created_at : null;
  useEffect(() => {
    if (newestAt) markRead(newestAt);
  }, [newestAt, markRead]);

  if (conversation.isPending) return <LoadingScreen />;
  if (!conversation.data) {
    return (
      <SafeAreaView className="flex-1 bg-cream dark:bg-ink">
        <EmptyState emoji="🤷" message="Tu n'as plus accès à cette discussion." action={<Button label="Retour" onPress={() => router.back()} />} />
      </SafeAreaView>
    );
  }

  const c = conversation.data;
  const isGroup = c.type === 'activity';
  const iconColor = dark ? colors.cream : colors.night;

  const submit = async () => {
    const content = draft.trim();
    if (!content || send.isPending) return;
    setError('');
    setDraft('');
    try {
      await send.mutateAsync(content);
    } catch (e) {
      setDraft(content);
      setError(friendlyError(e));
    }
  };

  const openSubject = () => {
    if (isGroup && c.activity_id) router.push(`/activity/${c.activity_id}`);
    else if (c.other_id && c.other_first_name) router.push(`/user/${c.other_id}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-ink">
      <View className="flex-row items-center gap-2 border-b border-night/10 px-3 py-2 dark:border-cream/10">
        <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={iconColor} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={openSubject} className="flex-1">
          <Text numberOfLines={1} className="font-strong text-lg text-night dark:text-cream">
            {conversationTitle(c)}
          </Text>
          <Text className="font-body text-xs text-night/60 dark:text-cream/60">
            {isGroup ? "Discussion de l'activité · voir la fiche" : 'Message privé · voir le profil'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={c.muted ? 'Réactiver les notifications' : 'Mettre en sourdine'}
          hitSlop={12}
          onPress={() => setMuted.mutate(!c.muted)}>
          <Ionicons name={c.muted ? 'notifications-off' : 'notifications-outline'} size={24} color={iconColor} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <FlatList
          inverted
          data={messages}
          keyExtractor={(message) => message.id}
          renderItem={({ item, index }) => (
            <Bubble
              message={item}
              mine={item.sender_id === profile?.id}
              sender={senders?.get(item.sender_id)}
              // Liste inversée : le message précédent dans le temps est le suivant dans le tableau.
              showSender={isGroup && messages[index + 1]?.sender_id !== item.sender_id}
            />
          )}
          contentContainerClassName="gap-2 px-4 py-4"
          onEndReached={() => messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage && messagesQuery.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            messagesQuery.isPending ? null : (
              // F-CHAT-08 : rappel des règles avant un premier message. (Liste inversée : on retourne le bloc.)
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <Notice tone="info">
                  {isGroup
                    ? 'Lance la discussion : heure, point de rendez-vous, qui apporte quoi…'
                    : 'Premier message ? Présente-toi et reste bienveillant, comme en vrai. Tout message peut être signalé.'}
                </Notice>
              </View>
            )
          }
        />

        <View className="gap-2 px-4 pb-3 pt-1">
          <Notice>{error}</Notice>
          {c.writable ? (
            <View className="flex-row items-end gap-2">
              <TextInput
                accessibilityLabel="Ton message"
                value={draft}
                onChangeText={setDraft}
                placeholder="Ton message…"
                placeholderTextColor="#8A93A6"
                multiline
                maxLength={MAX_LENGTH}
                className="max-h-32 min-h-12 flex-1 rounded-3xl border border-night/15 bg-white px-4 py-3 font-body text-base text-night dark:border-cream/20 dark:bg-night dark:text-cream"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Envoyer"
                disabled={!draft.trim()}
                onPress={submit}
                className={`h-12 w-12 items-center justify-center rounded-full bg-coral ${draft.trim() ? '' : 'opacity-40'}`}>
                <Ionicons name="send" size={20} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <Notice tone="info">
              {isGroup ? "Cette discussion est fermée : l'activité est terminée depuis plus de 7 jours." : "Tu ne peux plus écrire à cette personne."}
            </Notice>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
