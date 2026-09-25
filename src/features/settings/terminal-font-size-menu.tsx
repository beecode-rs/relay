import { type JSX, useState } from 'react';
import { Button, Menu } from 'react-native-paper';

import { useTerminalPreference } from '@/components/terminal-preference-context';
import type { TerminalFontSizeOption } from '@/services/terminal/terminal-preference';

const FONT_SIZE_OPTIONS: { label: string; value: TerminalFontSizeOption }[] = [
  { label: 'XS', value: 'xs' },
  { label: 'S', value: 's' },
  { label: 'M', value: 'm' },
  { label: 'L', value: 'l' },
  { label: 'XL', value: 'xl' },
  { label: 'XXL', value: 'xxl' },
];

export const TerminalFontSizeMenu = (): JSX.Element => {
  const { preference, savePreference } = useTerminalPreference();
  const [isVisible, setIsVisible] = useState(false);

  const resolveLeadingIcon = (params: { isMatch: boolean }): string | undefined => {
    if (params.isMatch) {
      return 'check';
    }

    return undefined;
  };

  const resolveSelectedLabel = (): string => {
    const selectedOption = FONT_SIZE_OPTIONS.find((option) => {
      return option.value === preference.fontSize;
    });

    return selectedOption?.label ?? FONT_SIZE_OPTIONS[2].label;
  };

  const selectFontSize = (fontSize: TerminalFontSizeOption): void => {
    setIsVisible(false);
    void savePreference({ ...preference, fontSize });
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
          testID="terminal-font-size-menu-anchor"
        >
          {resolveSelectedLabel()}
        </Button>
      }
      onDismiss={() => {
        setIsVisible(false);
      }}
      visible={isVisible}
    >
      {FONT_SIZE_OPTIONS.map((option) => {
        return (
          <Menu.Item
            key={option.value}
            leadingIcon={resolveLeadingIcon({ isMatch: preference.fontSize === option.value })}
            onPress={() => {
              selectFontSize(option.value);
            }}
            testID={`terminal-font-size-option-${option.value}`}
            title={option.label}
          />
        );
      })}
    </Menu>
  );
};
