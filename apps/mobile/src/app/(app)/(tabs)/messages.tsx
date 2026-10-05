import { router } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';

import { colors } from '@union/shared';

import { categoryOf } from '@/components/activity-card';
import { Avatar, EmptyState, LoadingScreen, Screen } from '@/components/ui';
import { formatShort } from '@/lib/activities';
import { type Conversation, conversationTitle, useConversations } from '@/lib/chat';
import { useSession } from '@/lib/session';

function ConversationRow({ conversation, myId }: { conversation: Conversation; myId?: string }) {
  const title = conversationTitle(conversation);
  const unread = conversation.unread_count > 0;
  const preview = conversation.last_message
    ? `${conversation.last_sender_id === myId ? 'Toi : ' : ''}${conversation.last_message}`
    : 'Dis bonjour au groupe 👋';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${unread ? `, ${conversation.unread_count} non lus` : ''}`}
      onPress={() => router.push(`/conversation/${conversation.id}`)}
      className="flex-row items-center gap-3 rounded-3xl bg-white p-3 active:opacity-80 dark:bg-night">
      {conversation.type === 'activity' ? (
        <View
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.category[categoryOf(conversation.activity_category ?? 'other').code] }}>
          <Text className="text-xl">{categoryOf(conversation.activity_category ?? 'other').emoji}</Text>
        </View>
      ) : (
        <Avatar firstName={conversation.other_first_name ?? '?'} lastName={conversation.other_last_name ?? ''} path={conversation.other_avatar_url} />
      )}
      <View className="flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text numberOfLines={1} className={`flex-1 text-base text-night dark:text-cream ${unread ? 'font-display' : 'font-strong'}`}>
            {title}
            {conversation.muted ? ' 🔕' : ''}
          </Text>
          {conversation.last_message_at ? (
            <Text className="font-body text-xs text-night/60 dark:text-cream/60">{formatShort(conversation.last_message_at)}</Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className={`flex-1 text-sm ${unread ? 'font-semi text-night dark:text-cream' : 'font-body text-night/70 dark:text-cream/70'}`}>
            {preview}
          </Text>
          {unread ? (
            <View className="min-w-6 items-center rounded-full bg-coral px-1.5 py-0.5">
              <Text className="font-strong text-xs text-white">{conversation.unread_count}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const { profile } = useSession();
  const { data, isPending, isRefetching, refetch } = useConversations();

  return (
    <Screen title="Messages">
      {isPending ? (
        <LoadingScreen />
      ) : !data?.length ? (
        <EmptyState emoji="💬" message="Pas encore de message. Les discussions s'ouvrent dès que tu rejoins une activité." />
      ) : (
        <FlatList
          className="mt-4"
          data={data}
          keyExtractor={(conversation) => conversation.id}
          renderItem={({ item }) => <ConversationRow conversation={item} myId={profile?.id} />}
          contentContainerClassName="gap-3 pb-8"
          showsVerticalScrollIndicator={false}
          refreshing={isRefetching}
          onRefresh={refetch}
        />
      )}
    </Screen>
  );
}
