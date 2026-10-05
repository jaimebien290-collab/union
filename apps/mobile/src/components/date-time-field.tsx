import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, Text, View } from 'react-native';

import { FieldLabel } from '@/components/ui';
import { formatShort } from '@/lib/activities';

type Props = { label: string; value: Date; onChange: (date: Date) => void; minimumDate?: Date; maximumDate?: Date };

/** Date et heure avec le sélecteur natif : compact sur iOS, deux boîtes de dialogue (jour puis heure) sur Android. */
export function DateTimeField({ label, value, onChange, minimumDate, maximumDate }: Props) {
  if (Platform.OS === 'ios') {
    return (
      <View className="flex-row items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <DateTimePicker
          mode="datetime"
          display="compact"
          locale="fr-FR"
          minuteInterval={5}
          value={value}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_event, date) => date && onChange(date)}
        />
      </View>
    );
  }

  const open = () =>
    DateTimePickerAndroid.open({
      mode: 'date',
      value,
      minimumDate,
      maximumDate,
      onChange: (event, day) => {
        if (event.type !== 'set' || !day) return;
        DateTimePickerAndroid.open({
          mode: 'time',
          is24Hour: true,
          value,
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== 'set' || !time) return;
            onChange(new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes()));
          },
        });
      },
    });

  return (
    <View className="gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${formatShort(value.toISOString())}`}
        onPress={open}
        className="min-h-12 justify-center rounded-2xl border border-night/15 bg-white px-4 dark:border-cream/20 dark:bg-night">
        <Text className="font-body text-base text-night dark:text-cream">{formatShort(value.toISOString())}</Text>
      </Pressable>
    </View>
  );
}
