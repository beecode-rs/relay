import { router } from 'expo-router';
import { type JSX, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTopBar } from '@/components/app-top-bar';
import { ScrollableTabBar, type ScrollableTabBarTab } from '@/components/scrollable-tab-bar';
import { useThemePreference } from '@/components/theme/theme-context';
import { SecuritySettingsTab } from '@/features/settings/security-settings-tab';
import { SshKeySettingsTab } from '@/features/settings/ssh-key-settings-tab';
import { SystemSettingsTab } from '@/features/settings/system-settings-tab';

type SettingsTabKey = 'security' | 'sshKey' | 'system';

const SETTINGS_TABS: readonly ScrollableTabBarTab<SettingsTabKey>[] = [
  { key: 'system', label: 'System' },
  { key: 'sshKey', label: 'SSH Key' },
  { key: 'security', label: 'Security' },
];

const renderActiveTab = (tabKey: SettingsTabKey): JSX.Element => {
  switch (tabKey) {
    case 'security': {
      return <SecuritySettingsTab />;
    }
    case 'sshKey': {
      return <SshKeySettingsTab />;
    }
    case 'system': {
      return <SystemSettingsTab />;
    }
    default: {
      throw new Error(`Unsupported settings tab: ${String(tabKey)}`);
    }
  }
};

export const SettingsScreen = (): JSX.Element => {
  const { navigationTheme } = useThemePreference();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>('system');

  const handleBack = (): void => {
    router.back();
  };

  const handleSelectTab = (tabKey: SettingsTabKey): void => {
    setActiveTab(tabKey);
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: navigationTheme.colors.background }]}>
      <AppTopBar onPressBack={handleBack} testID="settings-top-bar" title="Settings" />
      <View style={[styles.screen, { backgroundColor: navigationTheme.colors.background }]}>
        <ScrollableTabBar activeKey={activeTab} onSelect={handleSelectTab} tabs={SETTINGS_TABS} />
        <ScrollView contentContainerStyle={styles.content} key={activeTab} style={styles.contentScroll}>
          {renderActiveTab(activeTab)}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
  },
  contentScroll: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
});
