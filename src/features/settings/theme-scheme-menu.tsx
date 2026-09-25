import { type JSX, useState } from 'react';
import { Button, Menu } from 'react-native-paper';

import { useThemePreference } from '@/components/theme/theme-context';
import type { ThemeSchemePreference } from '@/services/theme/theme-preference';

const SCHEME_OPTIONS: { label: string; value: ThemeSchemePreference }[] = [
  { label: 'Auto', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export const ThemeSchemeMenu = (): JSX.Element => {
  const { preference, savePreference } = useThemePreference();
  const [isVisible, setIsVisible] = useState(false);

  const resolveLeadingIcon = (params: { isMatch: boolean }): string | undefined => {
    if (params.isMatch) {
      return 'check';
    }

    return undefined;
  };

  const resolveSelectedLabel = (): string => {
    const selectedOption = SCHEME_OPTIONS.find((option) => {
      return option.value === preference.scheme;
    });

    return selectedOption?.label ?? SCHEME_OPTIONS[0].label;
  };

  const selectScheme = (scheme: ThemeSchemePreference): void => {
    setIsVisible(false);
    void savePreference({ scheme });
  };

  return (
    <Menu
      anchor={
        <Button
          compact
          mode="outlined"
          onPress={() => {
            setIsVisible(true);
          }}
          testID="theme-scheme-menu-anchor"
        >
          {resolveSelectedLabel()}
        </Button>
      }
      onDismiss={() => {
        setIsVisible(false);
      }}
      visible={isVisible}
    >
      {SCHEME_OPTIONS.map((option) => {
        return (
          <Menu.Item
            key={option.value}
            leadingIcon={resolveLeadingIcon({ isMatch: preference.scheme === option.value })}
            onPress={() => {
              selectScheme(option.value);
            }}
            testID={`theme-scheme-option-${option.value}`}
            title={option.label}
          />
        );
      })}
    </Menu>
  );
};
