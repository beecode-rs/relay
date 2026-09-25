import { type JSX, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useThemePreference } from '@/components/theme/theme-context';

interface SettingsSectionProps {
  children: ReactNode;
  title?: string;
}

export const SettingsSection = ({ children, title }: SettingsSectionProps): JSX.Element => {
  const { md3Theme } = useThemePreference();

  return (
    <View style={styles.section}>
      {title !== undefined && (
        <Text style={[styles.sectionTitle, { color: md3Theme.colors.onSurfaceVariant }]} variant="titleMedium">
          {title}
        </Text>
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontWeight: '600',
  },
});
