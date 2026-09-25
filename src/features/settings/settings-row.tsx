import { type JSX, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useThemePreference } from '@/components/theme/theme-context';

interface SettingsRowProps {
  control: ReactNode;
  description?: string;
  label: string;
}

export const SettingsRow = ({ control, description, label }: SettingsRowProps): JSX.Element => {
  const { md3Theme } = useThemePreference();

  return (
    <View style={styles.row}>
      <View style={styles.textColumn}>
        <Text style={{ color: md3Theme.colors.onSurface }} variant="bodyLarge">
          {label}
        </Text>
        {description !== undefined && (
          <Text style={{ color: md3Theme.colors.onSurfaceVariant }} variant="bodySmall">
            {description}
          </Text>
        )}
      </View>
      {control}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minHeight: 48,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
});
