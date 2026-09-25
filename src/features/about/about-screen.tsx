import Constants from 'expo-constants';
import { router } from 'expo-router';
import { type JSX } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTopBar } from '@/components/app-top-bar';
import { useThemePreference } from '@/components/theme/theme-context';
import { constant } from '@/constants/constant';
import { appInfo } from '@/constants/app';
import { SettingsRow } from '@/features/settings/settings-row';
import { SettingsSection } from '@/features/settings/settings-section';

export const AboutScreen = (): JSX.Element => {
  const { md3Theme, navigationTheme } = useThemePreference();

  const handleBack = (): void => {
    router.back();
  };

  const handleOpenBeecodeWebsite = (): void => {
    void Linking.openURL(constant.app.beecodeWebsiteUrl);
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: navigationTheme.colors.background }]}>
      <AppTopBar onPressBack={handleBack} testID="about-top-bar" title="About" />
      <ScrollView contentContainerStyle={styles.content} style={styles.contentScroll}>
        <View style={styles.header}>
          <Image source={require('@resource/icon/adaptive-icon.png')} style={styles.logo} testID="about-app-logo" />
          <Text style={[styles.appName, { color: md3Theme.colors.onSurface }]} variant="headlineSmall">
            {appInfo.name}
          </Text>
          <Text style={[styles.tagline, { color: md3Theme.colors.onSurfaceVariant }]} variant="bodyMedium">
            SSH terminal for mobile
          </Text>
        </View>
        <SettingsSection>
          <SettingsRow
            control={<Text style={{ color: md3Theme.colors.onSurfaceVariant }} variant="bodyLarge">{Constants.expoConfig?.version ?? '1.0.0'}</Text>}
            label="Version"
          />
          <SettingsRow
            control={<Text style={{ color: md3Theme.colors.onSurfaceVariant }} variant="bodyLarge">{Constants.expoConfig?.sdkVersion ?? 'Unknown'}</Text>}
            label="Expo SDK"
          />
        </SettingsSection>
        <Pressable
          accessibilityLabel="Visit beecode.rs"
          accessibilityRole="link"
          onPress={handleOpenBeecodeWebsite}
          style={styles.madeBy}
          testID="about-beecode-link"
        >
          <Image
            source={require('@resource/brand/beecode-logo.png')}
            style={styles.beecodeLogo}
            testID="about-beecode-logo"
          />
          <Text style={[styles.madeByText, { color: md3Theme.colors.onSurfaceVariant }]} variant="bodyMedium">
            Made by beecode
          </Text>
          <Text style={[styles.madeByText, { color: md3Theme.colors.primary }]} variant="bodyMedium">
            beecode.rs
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  appName: {
    textAlign: 'center',
  },
  beecodeLogo: {
    borderRadius: 10,
    height: 48,
    overflow: 'hidden',
    width: 48,
  },
  content: {
    paddingBottom: 24,
  },
  contentScroll: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  logo: {
    height: 96,
    width: 96,
  },
  madeBy: {
    alignItems: 'center',
    gap: 4,
    marginTop: 32,
  },
  madeByText: {
    textAlign: 'center',
  },
  safeArea: {
    flex: 1,
  },
  tagline: {
    textAlign: 'center',
  },
});
