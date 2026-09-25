import { type JSX } from 'react';
import { Switch } from 'react-native-paper';

import { useTerminalPreference } from '@/components/terminal-preference-context';
import { SettingsRow } from '@/features/settings/settings-row';
import { SettingsSection } from '@/features/settings/settings-section';
import { TerminalFontSizeMenu } from '@/features/settings/terminal-font-size-menu';
import { ThemeSchemeMenu } from '@/features/settings/theme-scheme-menu';

export const SystemSettingsTab = (): JSX.Element => {
  const { preference, savePreference } = useTerminalPreference();

  const handleToggleSelectionFollowFinger = (nextValue: boolean): void => {
    void savePreference({ ...preference, isSelectionFollowFingerEnabled: nextValue });
  };

  return (
    <>
      <SettingsSection>
        <SettingsRow control={<ThemeSchemeMenu />} description="Auto follows your system setting" label="Color scheme" />
      </SettingsSection>
      <SettingsSection title="Terminal">
        <SettingsRow control={<TerminalFontSizeMenu />} description="Terminal text size" label="Font size" />
        <SettingsRow
          control={
            <Switch
              onValueChange={handleToggleSelectionFollowFinger}
              testID="selection-follow-finger-switch"
              value={preference.isSelectionFollowFingerEnabled}
            />
          }
          description="Off moves the selection marker relative to your swipe, so screen edges can be selected from the center. On makes the marker follow your finger"
          label="Selection follows finger"
        />
      </SettingsSection>
    </>
  );
};
