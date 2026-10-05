import { Chip, ChipGroup, FieldLabel, TextField } from '@/components/ui';
import { View } from 'react-native';

import { CATEGORIES, type CategoryCode } from '@union/shared';

const YEARS = [1, 2, 3, 4, 5, 6];
export const MAX_INTERESTS = 5;

/** Formation : la liste de l'école si elle en a défini une, sinon saisie libre. */
export function ProgramField({ programs, value, onChange }: { programs: string[]; value: string; onChange: (v: string) => void }) {
  if (programs.length === 0) {
    return <TextField label="Formation" value={value} onChangeText={onChange} placeholder="Ex. Bachelor commerce" maxLength={80} />;
  }
  return (
    <View className="gap-1.5">
      <FieldLabel>Formation</FieldLabel>
      <ChipGroup>
        {programs.map((program) => (
          <Chip key={program} label={program} selected={value === program} onPress={() => onChange(program)} />
        ))}
      </ChipGroup>
    </View>
  );
}

export function StudyYearField({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <View className="gap-1.5">
      <FieldLabel>Année d&apos;études</FieldLabel>
      <ChipGroup>
        {YEARS.map((year) => (
          <Chip
            key={year}
            label={year === 1 ? '1re' : year === 6 ? '6e et +' : `${year}e`}
            selected={year === 6 ? (value ?? 0) >= 6 : value === year}
            onPress={() => onChange(year)}
          />
        ))}
      </ChipGroup>
    </View>
  );
}

export function InterestsField({ value, onChange }: { value: CategoryCode[]; onChange: (v: CategoryCode[]) => void }) {
  const toggle = (code: CategoryCode) => {
    if (value.includes(code)) onChange(value.filter((c) => c !== code));
    else if (value.length < MAX_INTERESTS) onChange([...value, code]);
  };
  return (
    <ChipGroup>
      {CATEGORIES.map((category) => (
        <Chip
          key={category.code}
          label={`${category.emoji} ${category.label}`}
          selected={value.includes(category.code)}
          onPress={() => toggle(category.code)}
        />
      ))}
    </ChipGroup>
  );
}
