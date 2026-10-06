import { createElement } from 'react';
import { View } from 'react-native';

import { FieldLabel } from '@/components/ui';

type Props = { label: string; value: Date; onChange: (date: Date) => void; minimumDate?: Date; maximumDate?: Date };

/** Format attendu par <input type="datetime-local"> : heure locale, sans fuseau. */
const toLocal = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

// Version web (aperçu dans le navigateur) : le sélecteur natif du téléphone n'existe pas ici.
export function DateTimeField({ label, value, onChange, minimumDate, maximumDate }: Props) {
  return (
    <View className="gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      {createElement('input', {
        type: 'datetime-local',
        'aria-label': label,
        value: toLocal(value),
        min: minimumDate ? toLocal(minimumDate) : undefined,
        max: maximumDate ? toLocal(maximumDate) : undefined,
        onChange: (event: { target: { value: string } }) => {
          const date = new Date(event.target.value);
          if (!Number.isNaN(date.getTime())) onChange(date);
        },
        style: { minHeight: 48, borderRadius: 16, border: '1px solid rgba(30,42,74,0.15)', padding: '0 16px', fontSize: 16 },
      })}
    </View>
  );
}
