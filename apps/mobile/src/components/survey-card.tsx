import { Pressable, Text, View } from 'react-native';

import { usePendingSurvey, useSubmitSurvey } from '@/lib/mentoring';

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * F-SURV-01 : une seule question, facultative, à l'inscription puis à J+60. « Passer » est toujours visible.
 * La réponse n'est jamais lue individuellement par l'école (F-SURV-02).
 */
export function SurveyCard() {
  const wave = usePendingSurvey().data;
  const submit = useSubmitSurvey();
  if (!wave || submit.isPending || submit.isSuccess) return null;

  return (
    <View className="gap-3 rounded-3xl bg-white p-4 dark:bg-night">
      <Text className="font-strong text-base text-night dark:text-cream">Sur 10, comment tu te sens intégré(e) dans ton école ?</Text>
      <Text className="font-body text-sm text-night/70 dark:text-cream/70">
        Une seule question, anonyme pour ton école : elle ne voit que la moyenne.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {SCORES.map((score) => (
          <Pressable
            key={score}
            accessibilityRole="button"
            accessibilityLabel={`${score} sur 10`}
            onPress={() => submit.mutate({ wave, score })}
            className="h-11 w-11 items-center justify-center rounded-full border border-night/15 active:bg-coral dark:border-cream/20">
            <Text className="font-strong text-base text-night dark:text-cream">{score}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => submit.mutate({ wave, score: null })}>
        <Text className="font-semi text-sm text-coral">Passer</Text>
      </Pressable>
    </View>
  );
}
